import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction} from "./db";

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
  kind:"ingreso"|"excedente";movement_on:Date|string;site_name:string;origin:string|null;destination:string|null;
  driver_name:string|null;driver_tax_id:string|null;truck_plate:string|null;trailer_plate:string|null;
  weighing_ticket:string;material_name:string;supplier_kg:string|null;rerchar_kg:string|null;impurity_kg:string;
  net_basis:"proveedor"|"rerchar";net_reported_kg:string|null;impurity_report:string|null;origin_guide:string|null;
  transfer_guide:string|null;entry_sheet:string|null;valued_guide:string|null;certificate_number:string|null;
  act_number:string|null;invoice_number:string|null;unit_price_clp:string|null;payment_status:string;paid_on:Date|string|null;
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
export async function createMaterialReceipt(actor:Actor,input:unknown){
  manage(actor);
  const data=z.object({client_id:uuid,service_id:z.union([uuid,z.literal("")]).default(""),kind:z.enum(["ingreso","excedente"]),
    movement_on:z.iso.date(),site_name:z.string().trim().min(2).max(180),origin:optional(180),destination:optional(180),
    driver_name:optional(120),driver_tax_id:optional(25),truck_plate:optional(20),trailer_plate:optional(30),
    weighing_ticket:z.string().trim().min(1).max(80),material_name:z.string().trim().min(2).max(180),
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
  if(data.payment_status==="pagado"&&!data.paid_on)reject("Indique la fecha del pago.");
  return transaction(async tx=>{
    const [client]=await tx.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.client_id]);
    if(!client)reject("Seleccione un cliente activo.");
    if(data.service_id){const [service]=await tx.query("SELECT id FROM service_requests WHERE id=$1 AND client_id=$2 AND deleted_at IS NULL",[data.service_id,data.client_id]);
      if(!service)reject("El servicio seleccionado no pertenece al cliente.");}
    const [r]=await tx.query<{id:string}>(`INSERT INTO material_receipts(client_id,service_id,kind,movement_on,site_name,origin,destination,
      driver_name,driver_tax_id,truck_plate,trailer_plate,weighing_ticket,material_name,supplier_kg,rerchar_kg,impurity_kg,
      net_basis,net_reported_kg,impurity_report,origin_guide,transfer_guide,entry_sheet,valued_guide,certificate_number,
      act_number,invoice_number,unit_price_clp,payment_status,paid_on,notes,recorded_by)
      VALUES($1,NULLIF($2,'')::uuid,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),
        NULLIF($11,''),$12,$13,NULLIF($14::text,'')::numeric,NULLIF($15::text,'')::numeric,$16,$17,
        NULLIF($18::text,'')::numeric,NULLIF($19,''),NULLIF($20,''),NULLIF($21,''),NULLIF($22,''),NULLIF($23,''),
        NULLIF($24,''),NULLIF($25,''),NULLIF($26,''),NULLIF($27::text,'')::numeric,$28,NULLIF($29,'')::date,NULLIF($30,''),$31)
      RETURNING id`,[data.client_id,data.service_id,data.kind,data.movement_on,data.site_name,data.origin,data.destination,
      data.driver_name,data.driver_tax_id,data.truck_plate,data.trailer_plate,data.weighing_ticket,data.material_name,
      data.supplier_kg,data.rerchar_kg,impurity,data.net_basis,data.net_reported_kg,data.impurity_report,
      data.origin_guide,data.transfer_guide,data.entry_sheet,data.valued_guide,data.certificate_number,
      data.act_number,data.invoice_number,data.unit_price_clp,data.payment_status,data.paid_on,data.notes,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'create','material_receipt',$2,$3)",
      [actor.id,r.id,JSON.stringify({client_id:data.client_id,ticket:data.weighing_ticket,kind:data.kind,...values})]);
    return r.id;
  });
}
export async function updateMaterialPayment(actor:Actor,id:string,input:unknown){
  manage(actor);uuid.parse(id);
  const data=z.object({payment_status:z.enum(["pendiente","parcial","pagado","no_aplica"]),
    paid_on:z.union([z.iso.date(),z.literal("")]).default("")}).parse(input);
  if(data.payment_status==="pagado"&&!data.paid_on)reject("Indique la fecha del pago.");
  await transaction(async tx=>{
    const [row]=await tx.query<{payment_status:string;paid_on:Date|string|null}>("SELECT payment_status,paid_on FROM material_receipts WHERE id=$1 FOR UPDATE",[id]);
    if(!row)reject("Ingreso no encontrado.");
    await tx.query("UPDATE material_receipts SET payment_status=$2,paid_on=NULLIF($3,'')::date,updated_at=now() WHERE id=$1",
      [id,data.payment_status,data.paid_on]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,'payment','material_receipt',$2,$3,$4)",
      [actor.id,id,JSON.stringify(row),JSON.stringify(data)]);
  });
}
