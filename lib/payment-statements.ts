import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction,type Db} from "./db";

const uuid=z.uuid();
const optional=(max:number)=>z.string().trim().max(max).default("");
const amount=z.union([z.string(),z.number()]).transform((value,ctx)=>{
  const text=String(value).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(text)||Number(text)>100_000_000_000){ctx.addIssue({code:"custom",message:"Monto o peso inválido."});return z.NEVER;}
  return text;
});
const quantity=z.union([z.string(),z.number()]).transform((value,ctx)=>{
  const text=String(value).trim();
  if(!/^\d+(?:\.\d{1,3})?$/.test(text)||Number(text)>100_000_000){ctx.addIssue({code:"custom",message:"Cantidad inválida."});return z.NEVER;}
  return text;
});
export class PaymentStatementError extends Error {}
function reject(message:string):never{throw new PaymentStatementError(message);}
function admin(actor:Actor){if(actor.role!=="admin")reject("Sólo administración puede modificar estados de pago.");}
function read(actor:Actor){if(!canManage(actor))reject("Sin acceso a estados de pago.");}
async function audit(tx:Db,actor:Actor,action:string,type:string,id:string,next:unknown){
  await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,$2,$3,$4,$5)",
    [actor.id,action,type,id,JSON.stringify(next)]);
}

export type Statement={id:string;client_id:string;client_name:string;client_tax_id:string;client_address:string;client_contact:string;
  issuer_contact:string|null;contract_manager:string|null;number:string;period_on:Date|string;
  statement_type:"residuos"|"arriendo";contract_reference:string|null;notes:string|null;
  status:"borrador"|"enviado"|"aprobado"|"observado";created_at:Date|string};
export type Operation={id:string;statement_id:string;line_number:number;description:string;operation_on:Date|string|null;
  weight_kg:string|null;weighing_ticket:string|null;service_sheet:string|null;guide_number:string|null;sidrep:string|null;
  rental_from:Date|string|null;rental_to:Date|string|null;is_disposal:boolean};
export type Charge={id:string;statement_id:string;line_number:number;description:string;pricing:"clp_servicio"|"uf_ton"|"uf_unidad";
  unit_value:string;quantity:string|null;uf_value_clp:string|null;uf_on:Date|string|null};
export type StatementTotals={lines:{charge:Charge;quantity:number|null;total_clp:number|null}[];net_clp:number|null;
  vat_clp:number|null;total_clp:number|null;disposal_tons:number|null};

export function statementTotals(operations:Operation[],charges:Charge[]):StatementTotals{
  const disposal=operations.filter(o=>o.is_disposal&&o.weight_kg!=null);
  const disposalTons=disposal.length?Math.round(disposal.reduce((sum,o)=>sum+Number(o.weight_kg),0)*100)/100000:null;
  const lines=charges.map(charge=>{
    const qty=charge.pricing==="uf_ton"?disposalTons:Number(charge.quantity??0);
    const total=qty==null?null:Math.round(Number(charge.unit_value)*qty*(charge.pricing==="clp_servicio"?1:Number(charge.uf_value_clp)));
    return {charge,quantity:qty,total_clp:total};
  });
  const net=lines.length&&lines.every(l=>l.total_clp!=null)?lines.reduce((sum,l)=>sum+l.total_clp!,0):null;
  const vat=net==null?null:Math.round(net*0.19);
  return {lines,net_clp:net,vat_clp:vat,total_clp:net==null?null:net+vat!,disposal_tons:disposalTons};
}

export async function listPaymentStatements(actor:Actor){
  read(actor);
  return db.query<Statement>("SELECT * FROM payment_statements ORDER BY period_on DESC,created_at DESC");
}
export async function getPaymentStatement(actor:Actor,id:string){
  read(actor);if(!uuid.safeParse(id).success)reject("Estado de pago no encontrado.");
  const [statement]=await db.query<Statement>("SELECT * FROM payment_statements WHERE id=$1",[id]);
  if(!statement)reject("Estado de pago no encontrado.");
  const [operations,charges]=await Promise.all([
    db.query<Operation>("SELECT * FROM payment_statement_operations WHERE statement_id=$1 ORDER BY line_number",[id]),
    db.query<Charge>("SELECT * FROM payment_statement_charges WHERE statement_id=$1 ORDER BY line_number",[id]),
  ]);
  return {statement,operations,charges,totals:statementTotals(operations,charges)};
}

export async function createPaymentStatement(actor:Actor,input:unknown){
  admin(actor);
  const data=z.object({submission_key:uuid,client_id:uuid,number:z.string().trim().min(1).max(40),period_on:z.iso.date(),
    statement_type:z.enum(["residuos","arriendo"]),client_name:z.string().trim().min(2).max(200),
    client_tax_id:z.string().trim().min(5).max(30),client_address:z.string().trim().min(5).max(300),
    client_contact:z.string().trim().min(5).max(160),issuer_contact:optional(160),contract_manager:optional(160),
    contract_reference:optional(100),notes:optional(1000)}).parse(input);
  return transaction(async tx=>{
    const [existing]=await tx.query<{id:string;created_by:string}>("SELECT id,created_by FROM payment_statements WHERE submission_key=$1",[data.submission_key]);
    if(existing){if(existing.created_by!==actor.id)reject("Clave de formulario en uso.");return existing.id;}
    const [client]=await tx.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.client_id]);
    if(!client)reject("Seleccione un cliente activo.");
    const [row]=await tx.query<{id:string}>(`INSERT INTO payment_statements
      (submission_key,client_id,number,period_on,statement_type,client_name,client_tax_id,client_address,
       client_contact,issuer_contact,contract_manager,contract_reference,notes,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),NULLIF($11,''),NULLIF($12,''),NULLIF($13,''),$14) RETURNING id`,
      [data.submission_key,data.client_id,data.number,data.period_on,data.statement_type,data.client_name,
        data.client_tax_id,data.client_address,data.client_contact,data.issuer_contact,data.contract_manager,
        data.contract_reference,data.notes,actor.id]);
    await audit(tx,actor,"create","payment_statement",row.id,data);
    return row.id;
  });
}

async function editable(tx:Db,id:string){
  const [statement]=await tx.query<{statement_type:Statement["statement_type"];status:Statement["status"]}>(
    "SELECT statement_type,status FROM payment_statements WHERE id=$1 FOR UPDATE",[id]);
  if(!statement)reject("Estado de pago no encontrado.");
  if(!["borrador","observado"].includes(statement.status))reject("Devuelva el estado de pago a borrador para corregirlo.");
  return statement;
}
const operationSchema=z.object({line_id:z.union([uuid,z.literal("")]).default(""),line_number:z.coerce.number().int().min(1).max(200),
  description:z.string().trim().min(4).max(500),operation_on:z.union([z.iso.date(),z.literal("")]).default(""),
  weight_kg:z.union([amount,z.literal("")]).default(""),weighing_ticket:optional(80),service_sheet:optional(80),
  guide_number:optional(80),sidrep:optional(80),rental_from:z.union([z.iso.date(),z.literal("")]).default(""),
  rental_to:z.union([z.iso.date(),z.literal("")]).default(""),is_disposal:z.enum(["0","1"]).default("0")});
export async function saveStatementOperation(actor:Actor,statementId:string,input:unknown){
  admin(actor);uuid.parse(statementId);
  const data=operationSchema.parse(input);
  return transaction(async tx=>{
    const statement=await editable(tx,statementId);
    if(statement.statement_type==="residuos"){
      if(!data.operation_on||!data.weight_kg||Number(data.weight_kg)<=0)reject("La operación de residuos requiere fecha y peso en kg.");
      if(data.rental_from||data.rental_to)reject("Las fechas de arriendo corresponden al otro formato.");
    }else{
      if(!data.rental_from||!data.rental_to||data.rental_to<data.rental_from)reject("Indique fechas válidas desde y hasta del arriendo.");
      if(data.operation_on||data.weight_kg||data.is_disposal==="1")reject("El arriendo no utiliza peso ni disposición.");
    }
    const values=[data.line_number,data.description,data.operation_on||null,data.weight_kg||null,data.weighing_ticket||null,
      data.service_sheet||null,data.guide_number||null,data.sidrep||null,data.rental_from||null,data.rental_to||null,
      data.is_disposal==="1",actor.id];
    let id=data.line_id;
    if(id){
      const [line]=await tx.query("SELECT id FROM payment_statement_operations WHERE id=$1 AND statement_id=$2 FOR UPDATE",[id,statementId]);
      if(!line)reject("Ítem no encontrado en este estado de pago.");
      await tx.query(`UPDATE payment_statement_operations SET line_number=$3,description=$4,operation_on=$5,weight_kg=$6,
        weighing_ticket=$7,service_sheet=$8,guide_number=$9,sidrep=$10,rental_from=$11,rental_to=$12,
        is_disposal=$13,recorded_by=$14,updated_at=now() WHERE id=$1 AND statement_id=$2`,[id,statementId,...values]);
    }else{
      const [line]=await tx.query<{id:string}>(`INSERT INTO payment_statement_operations
        (statement_id,line_number,description,operation_on,weight_kg,weighing_ticket,service_sheet,guide_number,
         sidrep,rental_from,rental_to,is_disposal,recorded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,[statementId,...values]);
      id=line.id;
    }
    await audit(tx,actor,data.line_id?"update":"create","payment_statement_operation",id,data);
    return id;
  });
}

const chargeSchema=z.object({line_id:z.union([uuid,z.literal("")]).default(""),line_number:z.coerce.number().int().min(1).max(100),
  description:z.string().trim().min(4).max(500),pricing:z.enum(["clp_servicio","uf_ton","uf_unidad"]),
  unit_value:amount,quantity:z.union([quantity,z.literal("")]).default(""),uf_value_clp:z.union([amount,z.literal("")]).default(""),
  uf_on:z.union([z.iso.date(),z.literal("")]).default("")});
export async function saveStatementCharge(actor:Actor,statementId:string,input:unknown){
  admin(actor);uuid.parse(statementId);
  const data=chargeSchema.parse(input);
  if(Number(data.unit_value)<=0)reject("El valor unitario debe ser mayor que cero.");
  if(data.pricing==="uf_ton"&&data.quantity)reject("La cantidad por tonelada se calcula desde los ítems de disposición.");
  if(data.pricing!=="uf_ton"&&(!data.quantity||Number(data.quantity)<=0))reject("Indique la cantidad facturada.");
  if(data.pricing==="clp_servicio"&&(data.uf_value_clp||data.uf_on))reject("Una tarifa en CLP no lleva valor UF.");
  if(data.pricing!=="clp_servicio"&&(!data.uf_on||!data.uf_value_clp||Number(data.uf_value_clp)<=0))
    reject("Indique la fecha y el valor UF usados en el estado de pago.");
  return transaction(async tx=>{
    const statement=await editable(tx,statementId);
    if(statement.statement_type==="arriendo"&&data.pricing==="uf_ton")reject("El arriendo no se cobra por toneladas de disposición.");
    const values=[data.line_number,data.description,data.pricing,data.unit_value,data.quantity||null,
      data.uf_value_clp||null,data.uf_on||null,actor.id];
    let id=data.line_id;
    if(id){
      const [line]=await tx.query("SELECT id FROM payment_statement_charges WHERE id=$1 AND statement_id=$2 FOR UPDATE",[id,statementId]);
      if(!line)reject("Cobro no encontrado en este estado de pago.");
      await tx.query(`UPDATE payment_statement_charges SET line_number=$3,description=$4,pricing=$5,unit_value=$6,
        quantity=$7,uf_value_clp=$8,uf_on=$9,recorded_by=$10,updated_at=now() WHERE id=$1 AND statement_id=$2`,
        [id,statementId,...values]);
    }else{
      const [line]=await tx.query<{id:string}>(`INSERT INTO payment_statement_charges
        (statement_id,line_number,description,pricing,unit_value,quantity,uf_value_clp,uf_on,recorded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[statementId,...values]);
      id=line.id;
    }
    await audit(tx,actor,data.line_id?"update":"create","payment_statement_charge",id,data);
    return id;
  });
}

export async function deletePaymentStatementLine(actor:Actor,statementId:string,kind:unknown,lineId:string){
  admin(actor);uuid.parse(statementId);uuid.parse(lineId);
  const table=z.enum(["operation","charge"]).parse(kind)==="operation"?"payment_statement_operations":"payment_statement_charges";
  return transaction(async tx=>{
    await editable(tx,statementId);
    const [line]=await tx.query<{id:string;line_number:number}>(
      `DELETE FROM ${table} WHERE id=$1 AND statement_id=$2 RETURNING id,line_number`,[lineId,statementId]);
    if(!line)reject("La línea no existe en este estado de pago.");
    await audit(tx,actor,"delete",table==="payment_statement_operations"?"payment_statement_operation":"payment_statement_charge",
      line.id,{statement_id:statementId,line_number:line.line_number});
  });
}

export async function setPaymentStatementStatus(actor:Actor,id:string,next:unknown){
  admin(actor);uuid.parse(id);
  const to=z.enum(["borrador","enviado","aprobado","observado"]).parse(next);
  return transaction(async tx=>{
    const [current]=await tx.query<{status:Statement["status"]}>("SELECT status FROM payment_statements WHERE id=$1 FOR UPDATE",[id]);
    if(!current)reject("Estado de pago no encontrado.");
    const allowed:Record<Statement["status"],string[]>={borrador:["enviado"],enviado:["aprobado","observado"],
      observado:["borrador","enviado"],aprobado:[]};
    if(!allowed[current.status].includes(to))reject("Esa transición no corresponde al estado actual.");
    if(to==="enviado"||to==="aprobado"){
      const [operations,charges]=await Promise.all([
        tx.query<Operation>("SELECT * FROM payment_statement_operations WHERE statement_id=$1",[id]),
        tx.query<Charge>("SELECT * FROM payment_statement_charges WHERE statement_id=$1",[id]),
      ]);
      const totals=statementTotals(operations,charges);
      if(!operations.length||!charges.length||totals.total_clp==null)reject("Complete respaldo operativo y valorización antes de enviarlo o aprobarlo.");
    }
    await tx.query("UPDATE payment_statements SET status=$2,updated_at=now() WHERE id=$1",[id,to]);
    await audit(tx,actor,"status","payment_statement",id,{before:current.status,after:to});
  });
}
