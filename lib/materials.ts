import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction} from "./db";
import {catalogName} from "./material-stock";

const uuid=z.uuid();
const optional=(max:number)=>z.string().trim().max(max).optional().default("");
const weight=z.union([z.literal(""),z.coerce.number().finite().min(0).max(100_000_000)]).default("");
const price=z.union([z.literal(""),z.coerce.number().finite().min(0).max(100_000_000)]).default("");
export class MaterialError extends Error {}
function reject(message:string):never{throw new MaterialError(message);}
function manage(actor:Actor){if(!canManage(actor))reject("Sólo operaciones puede registrar ingresos de material.");}
function centi(value:string|number|null|undefined){return value==null||value===""?null:Math.round(Number(value)*100);}
export function materialAmounts(row:{supplier_kg:string|number|null;rerchar_kg:string|number|null;impurity_kg:string|number;net_basis:string;net_reported_kg:string|number|null;unit_price_clp:string|number|null}){
  const source=centi(row.net_basis==="proveedor"?row.supplier_kg:row.rerchar_kg);
  const impurity=centi(row.impurity_kg)??0;
  const net=source==null?null:(source-impurity)/100;
  const declared=centi(row.net_reported_kg);
  const unitPrice=centi(row.unit_price_clp);
  return {net_kg:net,variance_kg:net==null||declared==null?null:(source!-impurity-declared)/100,
    total_clp:net==null||unitPrice==null?null:Math.round((source!-impurity)*unitPrice/10_000)};
}
export type MaterialReceipt={id:string;client_id:string;client_name:string;service_id:string|null;service_folio:string|null;
  material_id:string|null;receipt_mode:"directa"|"programada"|null;
  kind:"ingreso"|"excedente";movement_on:Date|string;site_name:string;origin:string|null;destination:string|null;
  driver_name:string|null;driver_tax_id:string|null;truck_plate:string|null;trailer_plate:string|null;
  weighing_ticket:string|null;material_name:string;supplier_kg:string|null;rerchar_kg:string|null;impurity_kg:string;
  net_basis:"proveedor"|"rerchar";net_reported_kg:string|null;impurity_report:string|null;origin_guide:string|null;
  transfer_guide:string|null;entry_sheet:string|null;valued_guide:string|null;certificate_number:string|null;
  valued_guide_requested_on:Date|string|null;valued_guide_received_on:Date|string|null;
  act_number:string|null;invoice_number:string|null;unit_price_clp:string|null;payment_status:string;paid_on:Date|string|null;
  invoice_direction:"emitida"|"recibida"|null;invoice_issued_on:Date|string|null;payment_reference:string|null;
  closure_notified_on:Date|string|null;closure_recipient:string|null;closure_note:string|null;
  notes:string|null;created_at:Date};
const select=`SELECT r.*,c.name AS client_name,s.folio AS service_folio FROM material_receipts r JOIN clients c ON c.id=r.client_id
  LEFT JOIN service_requests s ON s.id=r.service_id`;

export async function listMaterialReceipts(actor:Actor){
  if(actor.role==="conductor")reject("Sin acceso al registro de material.");
  return db.query<MaterialReceipt>(`${select} WHERE ($1::text<>'cliente' OR r.client_id=$2::uuid)
    ORDER BY r.movement_on DESC,r.created_at DESC LIMIT 350`,[actor.role,actor.client_id]);
}
export async function getMaterialReceipt(actor:Actor,id:string){
  if(!uuid.safeParse(id).success)reject("Ingreso no encontrado.");
  const [row]=await db.query<MaterialReceipt>(`${select} WHERE r.id=$1`,[id]);
  if(!row||actor.role==="conductor"||(actor.role==="cliente"&&actor.client_id!==row.client_id))reject("Ingreso no disponible.");
  return row;
}
export async function exportMaterialReceipts(actor:Actor,month:string,clientId=""){
  manage(actor);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))reject("Seleccione un mes válido.");
  if(clientId&&!uuid.safeParse(clientId).success)reject("Seleccione un cliente válido.");
  const rows=await db.query<MaterialReceipt>(`${select} WHERE r.movement_on >= $1::date
    AND r.movement_on < $1::date + interval '1 month'
    AND ($2::text='' OR r.client_id=NULLIF($2,'')::uuid)
    ORDER BY r.movement_on,r.created_at,r.id LIMIT 10001`,[`${month}-01`,clientId]);
  if(rows.length>10000)reject("El mes supera 10.000 registros. Descargue por cliente para conservar todos los ingresos.");
  return rows;
}
export async function createMaterialReceipt(actor:Actor,input:unknown){
  manage(actor);
  const data=z.object({client_id:uuid,service_id:z.union([uuid,z.literal("")]).default(""),kind:z.enum(["ingreso","excedente"]),
    material_id:z.union([uuid,z.literal("")]).default(""),receipt_mode:z.enum(["directa","programada"]).default("programada"),
    movement_on:z.iso.date(),site_name:z.string().trim().min(2).max(180),origin:optional(180),destination:optional(180),
    driver_name:optional(120),driver_tax_id:optional(25),truck_plate:optional(20),trailer_plate:optional(30),
    weighing_ticket:optional(80),material_name:optional(180),
    supplier_kg:weight,rerchar_kg:weight,impurity_kg:weight,net_basis:z.enum(["proveedor","rerchar"]),
    net_reported_kg:weight,impurity_report:optional(80),origin_guide:optional(80),transfer_guide:optional(80),
    entry_sheet:optional(80),valued_guide:optional(80),certificate_number:optional(80),act_number:optional(80),
    invoice_number:optional(80),unit_price_clp:price,payment_status:z.enum(["pendiente","parcial","pagado","no_aplica"]).default("pendiente"),
    paid_on:z.union([z.iso.date(),z.literal("")]).default(""),notes:optional(1000)}).parse(input);
  const impurity=data.impurity_kg===""?0:data.impurity_kg;
  const values=materialAmounts({supplier_kg:data.supplier_kg,rerchar_kg:data.rerchar_kg,impurity_kg:impurity,
    net_basis:data.net_basis,net_reported_kg:data.net_reported_kg,unit_price_clp:data.unit_price_clp});
  if(values.net_kg==null||values.net_kg<0)reject("Indique un peso válido para la base elegida y compruebe las impurezas.");
  if(values.variance_kg!==null&&Math.abs(values.variance_kg)>0.01&&data.notes.length<10)
    reject("El neto anotado difiere del cálculo. Explique la diferencia en observaciones.");
  if(data.payment_status==="pagado"||data.payment_status==="parcial"||data.paid_on)
    reject("Registre primero el ingreso. Después adjunte el comprobante y actualice el pago desde su ficha.");
  if(!data.material_id&&data.material_name.length<2)reject("Seleccione el material del catálogo o escriba su nombre.");
  if(![data.weighing_ticket,data.origin_guide,data.transfer_guide,data.entry_sheet].some(Boolean))
    reject("Indique al menos un ticket, guía de traslado o hoja de ingreso.");
  if(data.receipt_mode==="directa"){
    if(data.service_id)reject("La recepción directa no debe generar un despacho propio. Quite el servicio vinculado.");
    if(!data.driver_name||!data.driver_tax_id||!data.truck_plate)reject("En recepción directa identifique conductor externo, RUT y patente del camión.");
    if(!data.origin_guide&&!data.transfer_guide&&!data.entry_sheet)reject("La recepción directa requiere guía de traslado u hoja de ingreso; el ticket es opcional.");
    if(data.rerchar_kg==="")reject("Indique el peso físico medido por RERCHAR para la recepción directa.");
  }
  return transaction(async tx=>{
    const [client]=await tx.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.client_id]);
    if(!client)reject("Seleccione un cliente activo.");
    if(data.service_id){const [service]=await tx.query("SELECT id FROM service_requests WHERE id=$1 AND client_id=$2 AND operating_company='rerchar' AND deleted_at IS NULL",[data.service_id,data.client_id]);
      if(!service)reject("La hoja de ingreso de RERCHAR requiere un servicio de RERCHAR del mismo cliente.");}
    const materialName=data.material_id?await catalogName(tx,data.material_id):data.material_name;
    const [r]=await tx.query<{id:string}>(`INSERT INTO material_receipts(client_id,service_id,kind,movement_on,site_name,origin,destination,
      driver_name,driver_tax_id,truck_plate,trailer_plate,weighing_ticket,material_name,supplier_kg,rerchar_kg,impurity_kg,
      net_basis,net_reported_kg,impurity_report,origin_guide,transfer_guide,entry_sheet,valued_guide,certificate_number,
      act_number,invoice_number,unit_price_clp,payment_status,paid_on,notes,recorded_by,material_id,receipt_mode)
      VALUES($1,NULLIF($2,'')::uuid,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),
        NULLIF($11,''),NULLIF($12,''),$13,NULLIF($14::text,'')::numeric,NULLIF($15::text,'')::numeric,$16,$17,
        NULLIF($18::text,'')::numeric,NULLIF($19,''),NULLIF($20,''),NULLIF($21,''),NULLIF($22,''),NULLIF($23,''),
        NULLIF($24,''),NULLIF($25,''),NULLIF($26,''),NULLIF($27::text,'')::numeric,$28,NULLIF($29,'')::date,NULLIF($30,''),$31,
        NULLIF($32,'')::uuid,$33)
      RETURNING id`,[data.client_id,data.service_id,data.kind,data.movement_on,data.site_name,data.origin,data.destination,
        data.driver_name,data.driver_tax_id,data.truck_plate,data.trailer_plate,data.weighing_ticket,materialName,
      data.supplier_kg,data.rerchar_kg,impurity,data.net_basis,data.net_reported_kg,data.impurity_report,
      data.origin_guide,data.transfer_guide,data.entry_sheet,data.valued_guide,data.certificate_number,
        data.act_number,data.invoice_number,data.unit_price_clp,data.payment_status,data.paid_on,data.notes,actor.id,
        data.material_id,data.receipt_mode]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'create','material_receipt',$2,$3)",
      [actor.id,r.id,JSON.stringify({client_id:data.client_id,ticket:data.weighing_ticket,kind:data.kind,...values})]);
    return r.id;
  });
}
export async function updateMaterialPayment(actor:Actor,id:string,input:unknown){
  manage(actor);uuid.parse(id);
  const data=z.object({payment_status:z.enum(["pendiente","parcial","pagado","no_aplica"]),
    paid_on:z.union([z.iso.date(),z.literal("")]).default(""),payment_reference:z.string().trim().max(120).default("")}).parse(input);
  if(["parcial","pagado"].includes(data.payment_status)&&(!data.paid_on||!data.payment_reference))
    reject("Para un pago parcial o total indique fecha y referencia del comprobante.");
  if(["pendiente","no_aplica"].includes(data.payment_status)&&(data.paid_on||data.payment_reference))
    reject("Quite fecha y referencia si el estado es pendiente o no aplica.");
  await transaction(async tx=>{
    const [row]=await tx.query<{payment_status:string;paid_on:Date|string|null;payment_reference:string|null}>(
      "SELECT payment_status,paid_on,payment_reference FROM material_receipts WHERE id=$1 FOR UPDATE",[id]);
    if(!row)reject("Ingreso no encontrado.");
    if(["parcial","pagado"].includes(data.payment_status)){
      const [file]=await tx.query("SELECT id FROM operation_files WHERE receipt_id=$1 AND kind='comprobante' LIMIT 1",[id]);
      if(!file)reject("Adjunte primero el comprobante de pago al ingreso.");
    }
    await tx.query("UPDATE material_receipts SET payment_status=$2,paid_on=NULLIF($3,'')::date,payment_reference=NULLIF($4,''),updated_at=now() WHERE id=$1",
      [id,data.payment_status,data.paid_on,data.payment_reference]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,'payment','material_receipt',$2,$3,$4)",
      [actor.id,id,JSON.stringify(row),JSON.stringify(data)]);
  });
}
export async function updateMaterialReferences(actor:Actor,id:string,input:unknown){
  manage(actor);uuid.parse(id);
  const data=z.object({entry_sheet:z.string().trim().max(80),invoice_number:z.string().trim().max(80),
    certificate_number:z.string().trim().max(80).default(""),
    invoice_direction:z.enum(["","emitida","recibida"]).default(""),
    invoice_issued_on:z.union([z.iso.date(),z.literal("")]).default("")}).parse(input);
  if(data.invoice_direction&&(!data.invoice_number||!data.invoice_issued_on))
    reject("Para confirmar la factura indique dirección, número y fecha.");
  if(!data.invoice_number&&(data.invoice_direction||data.invoice_issued_on))
    reject("Indique el número de factura antes de registrar sus datos.");
  await transaction(async tx=>{
    const [row]=await tx.query<{entry_sheet:string|null;invoice_number:string|null;invoice_direction:string|null;
      invoice_issued_on:Date|string|null;certificate_number:string|null;closure_notified_on:Date|string|null}>(
      "SELECT entry_sheet,invoice_number,invoice_direction,invoice_issued_on,certificate_number,closure_notified_on FROM material_receipts WHERE id=$1 FOR UPDATE",[id]);
    if(!row)reject("Ingreso no encontrado.");
    if(data.invoice_direction){
      const [file]=await tx.query("SELECT id FROM operation_files WHERE receipt_id=$1 AND kind='factura' LIMIT 1",[id]);
      if(!file)reject("Adjunte la factura antes de confirmar si fue emitida o recibida.");
    }
    const reopen=(row.invoice_number??"")!==data.invoice_number||(row.invoice_direction??"")!==data.invoice_direction||
      (row.invoice_issued_on?dateOnly(row.invoice_issued_on):"")!==data.invoice_issued_on||
      (row.certificate_number??"")!==data.certificate_number;
    await tx.query(`UPDATE material_receipts SET entry_sheet=NULLIF($2,''),invoice_number=NULLIF($3,''),
      invoice_direction=NULLIF($4,''),invoice_issued_on=NULLIF($5,'')::date,certificate_number=NULLIF($6,''),
      closure_notified_on=CASE WHEN $7::boolean THEN NULL ELSE closure_notified_on END,
      closure_recipient=CASE WHEN $7::boolean THEN NULL ELSE closure_recipient END,
      closure_note=CASE WHEN $7::boolean THEN NULL ELSE closure_note END,updated_at=now() WHERE id=$1`,
      [id,data.entry_sheet,data.invoice_number,data.invoice_direction,data.invoice_issued_on,data.certificate_number,reopen]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,'update','material_receipt',$2,$3,$4)",
      [actor.id,id,JSON.stringify(row),JSON.stringify(data)]);
  });
}

export async function recordMaterialClosureNotification(actor:Actor,id:string,input:unknown){
  manage(actor);uuid.parse(id);
  const data=z.object({notified_on:z.iso.date(),recipient:z.string().trim().min(3).max(180),
    note:z.string().trim().max(500).default("")}).parse(input);
  await transaction(async tx=>{
    const [row]=await tx.query<{valued_guide:string|null;valued_guide_received_on:Date|string|null;
      invoice_number:string|null;invoice_direction:string|null;invoice_issued_on:Date|string|null;
      certificate_number:string|null;closure_notified_on:Date|string|null;closure_recipient:string|null;closure_note:string|null}>(
      `SELECT valued_guide,valued_guide_received_on,invoice_number,invoice_direction,invoice_issued_on,
        certificate_number,closure_notified_on,closure_recipient,closure_note FROM material_receipts WHERE id=$1 FOR UPDATE`,[id]);
    if(!row)reject("Ingreso no encontrado.");
    if(!row.valued_guide||!row.valued_guide_received_on||!row.invoice_number||!row.invoice_direction||!row.invoice_issued_on)
      reject("Complete guía valorizada y factura con número, fecha y dirección antes de registrar el aviso.");
    if(data.notified_on<dateOnly(row.valued_guide_received_on)||data.notified_on<dateOnly(row.invoice_issued_on))
      reject("La fecha del aviso no puede preceder la recepción de la guía ni la fecha de la factura.");
    const docs=await tx.query<{kind:string}>(
      "SELECT DISTINCT kind FROM operation_files WHERE receipt_id=$1 AND kind IN ('guia_valorizada','factura','certificado')",[id]);
    const kinds=new Set(docs.map(d=>d.kind));
    if(!kinds.has("guia_valorizada")||!kinds.has("factura")||row.certificate_number&&!kinds.has("certificado"))
      reject("Adjunte guía valorizada y factura; si anotó un certificado, adjúntelo también.");
    await tx.query(`UPDATE material_receipts SET closure_notified_on=$2::date,closure_recipient=$3,
      closure_note=NULLIF($4,''),updated_at=now() WHERE id=$1`,[id,data.notified_on,data.recipient,data.note]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,'closure_notice','material_receipt',$2,$3,$4)",
      [actor.id,id,JSON.stringify({notified_on:row.closure_notified_on,recipient:row.closure_recipient,note:row.closure_note}),JSON.stringify(data)]);
  });
}

function dateOnly(value:Date|string){return value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);}

export async function updateMaterialGuideFollowup(actor:Actor,id:string,input:unknown){
  manage(actor);uuid.parse(id);
  const data=z.object({requested_on:z.union([z.iso.date(),z.literal("")]),
    received_on:z.union([z.iso.date(),z.literal("")]),valued_guide:z.string().trim().max(80)}).parse(input);
  if(Boolean(data.received_on)!==Boolean(data.valued_guide))
    reject("Para registrar la recepción indique fecha y número de guía valorizada juntos.");
  if(data.requested_on&&data.received_on&&data.received_on<data.requested_on)
    reject("La recepción no puede preceder a la solicitud.");
  await transaction(async tx=>{
    const [row]=await tx.query<{valued_guide:string|null;valued_guide_requested_on:Date|string|null;valued_guide_received_on:Date|string|null}>(
      "SELECT valued_guide,valued_guide_requested_on,valued_guide_received_on FROM material_receipts WHERE id=$1 FOR UPDATE",[id]);
    if(!row)reject("Ingreso no encontrado.");
    if(data.valued_guide){
      const [file]=await tx.query("SELECT id FROM operation_files WHERE receipt_id=$1 AND kind='guia_valorizada' LIMIT 1",[id]);
      if(!file)reject("Adjunte la guía valorizada recibida antes de registrar su número y fecha.");
    }
    const reopen=(row.valued_guide??"")!==data.valued_guide||
      (row.valued_guide_received_on?dateOnly(row.valued_guide_received_on):"")!==data.received_on;
    await tx.query(`UPDATE material_receipts SET valued_guide_requested_on=NULLIF($2,'')::date,
      valued_guide_received_on=NULLIF($3,'')::date,valued_guide=NULLIF($4,''),
      closure_notified_on=CASE WHEN $5::boolean THEN NULL ELSE closure_notified_on END,
      closure_recipient=CASE WHEN $5::boolean THEN NULL ELSE closure_recipient END,
      closure_note=CASE WHEN $5::boolean THEN NULL ELSE closure_note END,updated_at=now() WHERE id=$1`,
      [id,data.requested_on,data.received_on,data.valued_guide,reopen]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,'valued_guide','material_receipt',$2,$3,$4)",
      [actor.id,id,JSON.stringify(row),JSON.stringify(data)]);
  });
}
