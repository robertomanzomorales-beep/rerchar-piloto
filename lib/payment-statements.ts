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
  status:"borrador"|"enviado"|"aprobado"|"observado";created_at:Date|string;
  receivable_invoice_id:string|null;service_invoice_id:string|null;invoice_variance_note:string|null};
export type Operation={id:string;statement_id:string;service_id:string|null;line_number:number;description:string;operation_on:Date|string|null;
  weight_kg:string|null;weighing_ticket:string|null;service_sheet:string|null;guide_number:string|null;sidrep:string|null;
  rental_from:Date|string|null;rental_to:Date|string|null;is_disposal:boolean};
export type Charge={id:string;statement_id:string;line_number:number;description:string;pricing:"clp_servicio"|"uf_ton"|"uf_unidad";
  unit_value:string;quantity:string|null;uf_value_clp:string|null;uf_on:Date|string|null};
export type StatementService={id:string;folio:string;service_type:string;waste_type:string;operation_on:Date|string|null;
  weight_kg:string|null;rental_from:Date|string|null;rental_to:Date|string|null;
  guide_number:string|null;service_sheet:string|null;sidrep:string|null;weighing_ticket:string|null;
  transport_used:boolean;disposal_used:boolean};
export type StatementInvoice={id:string;source:"servicio"|"edp";invoice_number:string;issued_on:Date|string;
  due_on:Date|string;total_clp:string;paid_clp:string;status:"emitida"|"anulada";service_id:string|null};
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

export async function getStatementInvoice(actor:Actor,statement:Statement):Promise<StatementInvoice|null>{
  read(actor);
  if(statement.service_invoice_id){
    const [invoice]=await db.query<StatementInvoice>(`SELECT f.id,'servicio'::text AS source,f.invoice_number,
      f.issued_on,f.due_on,f.total_clp,f.status,v.service_id,
      COALESCE((SELECT sum(p.amount_clp) FROM invoice_payments p WHERE p.invoice_id=f.id),0)::text AS paid_clp
      FROM service_invoices f JOIN service_valuations v ON v.id=f.valuation_id WHERE f.id=$1`,[statement.service_invoice_id]);
    return invoice??null;
  }
  if(statement.receivable_invoice_id){
    const [invoice]=await db.query<StatementInvoice>(`SELECT i.id,'edp'::text AS source,i.invoice_number,
      i.issued_on,i.due_on,i.total_clp,i.status,NULL::uuid AS service_id,
      COALESCE((SELECT sum(p.amount_clp) FROM extra_receivable_payments p WHERE p.invoice_id=i.id),0)::text AS paid_clp
      FROM extra_receivable_invoices i WHERE i.id=$1`,[statement.receivable_invoice_id]);
    return invoice??null;
  }
  return null;
}

export async function linkStatementInvoice(actor:Actor,statementId:string,input:unknown){
  admin(actor);uuid.parse(statementId);
  const data=z.object({invoice_number:z.string().trim().min(2).max(80),issued_on:z.iso.date(),due_on:z.iso.date(),
    total_clp:amount,variance_note:optional(500)}).parse(input);
  if(Number(data.total_clp)<=0)reject("Ingrese el total real positivo de la factura externa.");
  if(data.due_on<data.issued_on)reject("El vencimiento no puede anteceder a la emisión de la factura.");
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if(data.issued_on>today)reject("La fecha de emisión de la factura no puede ser futura.");
  await transaction(async tx=>{
    const [statement]=await tx.query<Statement>("SELECT * FROM payment_statements WHERE id=$1 AND issuer='e_y_j' FOR UPDATE",[statementId]);
    if(!statement||statement.status!=="aprobado")reject("Apruebe el EDP antes de registrar su factura externa.");
    if(statement.receivable_invoice_id||statement.service_invoice_id)reject("Este EDP ya tiene una factura vinculada.");
    const [operations,charges]=await Promise.all([
      tx.query<Operation>("SELECT * FROM payment_statement_operations WHERE statement_id=$1",[statementId]),
      tx.query<Charge>("SELECT * FROM payment_statement_charges WHERE statement_id=$1",[statementId]),
    ]);
    const edpTotal=statementTotals(operations,charges).total_clp;
    if(edpTotal==null)reject("El EDP no tiene una valorización completa.");
    const sameDay=(value:Date|string,expected:string)=>(value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10))===expected;
    const [main]=await tx.query<{id:string;client_id:string;operating_company:string;status:string;total_verified:boolean;
      issued_on:Date|string;due_on:Date|string;total_clp:string}>(`SELECT f.id,s.client_id,s.operating_company,f.status,f.total_verified,f.issued_on,f.due_on,f.total_clp
      FROM service_invoices f JOIN service_valuations v ON v.id=f.valuation_id JOIN service_requests s ON s.id=v.service_id
      WHERE f.invoice_number=$1 FOR UPDATE OF f`,[data.invoice_number]);
    let invoiceId:string,source:"servicio"|"edp";
    if(main){
      const [otherReceivable]=await tx.query("SELECT id FROM extra_receivable_invoices WHERE issuer='e_y_j' AND invoice_number=$1 AND status='emitida'",[data.invoice_number]);
      if(otherReceivable)reject("Ese folio también figura en Cobranza. Concílielo antes de vincular el EDP para no duplicarlo.");
      if(main.status!=="emitida"||!main.total_verified||main.client_id!==statement.client_id||main.operating_company!=="e_y_j"||
        !sameDay(main.issued_on,data.issued_on)||!sameDay(main.due_on,data.due_on)||Number(main.total_clp)!==Number(data.total_clp))
        reject("El folio ya existe en Finanzas con otra empresa, cliente, fecha o total. Concílielo antes de vincularlo.");
      invoiceId=main.id;source="servicio";
    }else{
      const [existing]=await tx.query<{id:string;status:string;client_id:string;issued_on:Date|string;due_on:Date|string;total_clp:string}>(
        "SELECT * FROM extra_receivable_invoices WHERE issuer='e_y_j' AND invoice_number=$1 FOR UPDATE",[data.invoice_number]);
      if(existing){
        if(existing.status!=="emitida"||existing.client_id!==statement.client_id||!sameDay(existing.issued_on,data.issued_on)||
          !sameDay(existing.due_on,data.due_on)||Number(existing.total_clp)!==Number(data.total_clp))
          reject("El folio ya existe en Cobranza con otro cliente, fecha o total.");
        invoiceId=existing.id;
      }else{
        const [created]=await tx.query<{id:string}>(`INSERT INTO extra_receivable_invoices
          (issuer,client_id,invoice_number,issued_on,due_on,total_clp,created_by)
          VALUES('e_y_j',$1,$2,$3,$4,$5,$6) RETURNING id`,
          [statement.client_id,data.invoice_number,data.issued_on,data.due_on,data.total_clp,actor.id]);
        invoiceId=created.id;
      }
      source="edp";
    }
    const linked=await tx.query<{id:string}>(`SELECT id FROM payment_statements WHERE id<>$1 AND
      ${source==="edp"?"receivable_invoice_id":"service_invoice_id"}=$2 FOR UPDATE`,[statementId,invoiceId]);
    let linkedTotal=edpTotal;
    for(const other of linked){
      const [otherOperations,otherCharges]=await Promise.all([
        tx.query<Operation>("SELECT * FROM payment_statement_operations WHERE statement_id=$1",[other.id]),
        tx.query<Charge>("SELECT * FROM payment_statement_charges WHERE statement_id=$1",[other.id]),
      ]);
      const total=statementTotals(otherOperations,otherCharges).total_clp;
      if(total==null)reject("Otro EDP del mismo folio carece de valorización completa.");
      linkedTotal+=total;
    }
    if(Number(data.total_clp)!==linkedTotal&&data.variance_note.length<8)
      reject("Explique la diferencia entre el total de los EDP vinculados y el total real de la factura (mínimo 8 caracteres).");
    await tx.query(`UPDATE payment_statements SET receivable_invoice_id=$2,service_invoice_id=$3,
      invoice_variance_note=NULLIF($4,''),updated_at=now() WHERE id=$1`,
      [statementId,source==="edp"?invoiceId:null,source==="servicio"?invoiceId:null,data.variance_note]);
    await audit(tx,actor,"link_invoice","payment_statement",statementId,
      {invoice_id:invoiceId,source,invoice_number:data.invoice_number,total_clp:data.total_clp,edp_total_clp:edpTotal,
        linked_edp_total_clp:linkedTotal,
        variance_note:data.variance_note});
  });
}

const serviceSelect=`SELECT s.id,s.folio::text,s.service_type,s.waste_type,
  COALESCE((SELECT max(d.day) FROM service_day_reports d WHERE d.service_id=s.id AND d.outcome='completado'),
    (s.closed_at AT TIME ZONE 'America/Santiago')::date)::text AS operation_on,
  CASE WHEN s.gross_kg IS NOT NULL AND s.tare_kg IS NOT NULL THEN (s.gross_kg-s.tare_kg)::text END AS weight_kg,
  s.rental_from::text,s.rental_to::text,
  COALESCE(NULLIF(c.eyj_guide,''),NULLIF(s.guide_number,''),g.guide_number) AS guide_number,
  c.service_sheet,c.sidrep,
  COALESCE(NULLIF(g.departure_ticket,''),NULLIF(g.destination_ticket,''),NULLIF(g.origin_ticket,'')) AS weighing_ticket
  FROM service_requests s LEFT JOIN service_commercial_details c ON c.service_id=s.id
  LEFT JOIN LATERAL (SELECT guide_number,departure_ticket,destination_ticket,origin_ticket
    FROM service_guide_controls WHERE service_id=s.id ORDER BY movement_date DESC,line_number DESC LIMIT 1) g ON true`;

export async function listStatementServices(actor:Actor,statementId:string){
  read(actor);if(!uuid.safeParse(statementId).success)reject("Estado de pago no encontrado.");
  const [statement]=await db.query<{client_id:string;statement_type:Statement["statement_type"]}>(
    "SELECT client_id,statement_type FROM payment_statements WHERE id=$1 AND issuer='e_y_j'",[statementId]);
  if(!statement)reject("Estado de pago no encontrado.");
  const services=await db.query<StatementService>(`SELECT source.*,
    EXISTS(SELECT 1 FROM payment_statement_operations o WHERE o.service_id=source.id AND NOT o.is_disposal) AS transport_used,
    EXISTS(SELECT 1 FROM payment_statement_operations o WHERE o.service_id=source.id AND o.is_disposal) AS disposal_used
    FROM (${serviceSelect} WHERE s.operating_company='e_y_j' AND s.client_id=$1 AND s.deleted_at IS NULL
      AND s.status='completada' AND (($2::text='arriendo' AND s.service_type='arriendo') OR
      ($2::text='residuos' AND s.service_type IN ('retiro','traslado','otro')))
      AND NOT EXISTS(SELECT 1 FROM payment_statement_operations o WHERE o.service_id=s.id AND o.statement_id<>$3)
      ORDER BY s.folio DESC LIMIT 300) source ORDER BY source.folio::bigint DESC`,
    [statement.client_id,statement.statement_type,statementId]);
  return services.filter(s=>!s.transport_used||(statement.statement_type==="residuos"&&!s.disposal_used));
}

export async function addStatementService(actor:Actor,statementId:string,input:unknown){
  admin(actor);uuid.parse(statementId);
  const data=z.object({service_id:uuid,line_number:z.coerce.number().int().min(1).max(200),
    is_disposal:z.enum(["0","1"])}).parse(input);
  return transaction(async tx=>{
    const statement=await editable(tx,statementId);
    const [scope]=await tx.query<{client_id:string}>("SELECT client_id FROM payment_statements WHERE id=$1 AND issuer='e_y_j'",[statementId]);
    if(!scope)reject("Estado de pago no encontrado.");
    // Serializa las importaciones del mismo servicio entre EDP concurrentes.
    const [lock]=await tx.query<{id:string}>("SELECT id FROM service_requests WHERE id=$1 FOR UPDATE",[data.service_id]);
    if(!lock)reject("Servicio no encontrado.");
    const [service]=await tx.query<StatementService>(`${serviceSelect} WHERE s.id=$1 AND s.client_id=$2
      AND s.operating_company='e_y_j' AND s.deleted_at IS NULL AND s.status='completada'`,
      [data.service_id,scope.client_id]);
    if(!service)reject("El servicio debe estar completado, ser de E y J y pertenecer al mismo cliente.");
    if((statement.statement_type==="arriendo")!==(service.service_type==="arriendo"))
      reject("El tipo de servicio no corresponde al formato del estado de pago.");
    if(statement.statement_type==="residuos"&&!(["retiro","traslado","otro"].includes(service.service_type)))
      reject("El EDP de residuos sólo incorpora servicios de retiro o traslado.");
    const disposal=data.is_disposal==="1";
    if(statement.statement_type==="arriendo"&&disposal)reject("El arriendo no tiene disposición final.");
    if(statement.statement_type==="residuos"&&(!service.operation_on||!service.weight_kg||Number(service.weight_kg)<=0))
      reject("Complete la fecha de cierre y el pesaje bruto/tara del servicio antes de incorporarlo.");
    if(statement.statement_type==="arriendo"&&(!service.rental_from||!service.rental_to))
      reject("Complete las fechas de arriendo del servicio antes de incorporarlo.");
    const [linked]=await tx.query("SELECT id FROM payment_statement_operations WHERE service_id=$1 AND statement_id<>$2 LIMIT 1",
      [data.service_id,statementId]);
    if(linked)reject("Este servicio ya respalda otro estado de pago.");
    const [duplicate]=await tx.query("SELECT id FROM payment_statement_operations WHERE service_id=$1 AND is_disposal=$2",
      [data.service_id,disposal]);
    if(duplicate)reject("Ese tipo de ítem ya fue incorporado desde el servicio.");
    for(const [name,value] of Object.entries({service_sheet:service.service_sheet,guide_number:service.guide_number,
      sidrep:service.sidrep,weighing_ticket:service.weighing_ticket}))
      if(value&&value.length>80)reject(`El campo ${name} supera 80 caracteres; corríjalo en el servicio.`);
    const description=statement.statement_type==="arriendo"?`Arriendo ${service.waste_type}`:
      disposal?`Disposición final ${service.waste_type}`:`Servicio de transporte ${service.waste_type}`;
    const [line]=await tx.query<{id:string}>(`INSERT INTO payment_statement_operations
      (statement_id,service_id,line_number,description,operation_on,weight_kg,weighing_ticket,service_sheet,
       guide_number,sidrep,rental_from,rental_to,is_disposal,recorded_by)
      VALUES($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11::date,$12::date,$13,$14) RETURNING id`,
      [statementId,service.id,data.line_number,description,
        statement.statement_type==="residuos"?service.operation_on:null,
        statement.statement_type==="residuos"?service.weight_kg:null,
        statement.statement_type==="residuos"?service.weighing_ticket:null,
        statement.statement_type==="residuos"?service.service_sheet:null,
        statement.statement_type==="residuos"?service.guide_number:null,
        statement.statement_type==="residuos"?service.sidrep:null,
        statement.statement_type==="arriendo"?service.rental_from:null,
        statement.statement_type==="arriendo"?service.rental_to:null,disposal,actor.id]);
    await audit(tx,actor,"create","payment_statement_operation",line.id,
      {statement_id:statementId,service_id:service.id,is_disposal:disposal,line_number:data.line_number});
    return line.id;
  });
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
