import {z} from "zod";
import type {Actor} from "./auth";
import {db} from "./db";
export class AuditAccessError extends Error {}
export type AuditFilterInput={from?:string;to?:string;kind?:string};
export function auditFilterIssue(input:AuditFilterInput){
  if([input.from,input.to].some(value=>value!==undefined&&value!==""&&!z.iso.date().safeParse(value).success))return "Seleccione fechas válidas para consultar la auditoría.";
  if(input.from&&input.to&&input.from>input.to)return "La fecha Desde no puede ser posterior a Hasta.";
  if(input.kind&&!(typeof input.kind==="string"&&/^[a-z][a-z0-9_]{0,79}$/.test(input.kind)))return "Seleccione un tipo de registro válido.";
  return "";
}
export function auditFilter(input:AuditFilterInput){
  const date=(value:string|undefined)=>value&&z.iso.date().safeParse(value).success?value:"";
  return {from:date(input.from),to:date(input.to),kind:typeof input.kind==="string"&&/^[a-z][a-z0-9_]{0,79}$/.test(input.kind)?input.kind:""};
}
export type AuditFilters=ReturnType<typeof auditFilter>;
async function requireAdmin(actor:Actor){
  if(actor.role!=="admin")throw new AuditAccessError("La auditoría requiere administración.");
  const [user]=await db.query("SELECT id FROM users WHERE id=$1 AND role='admin' AND active=true",[actor.id]);if(!user)throw new AuditAccessError("Su acceso de administración ya no está activo.");
}
function checkedFilters(filters:AuditFilters){const issue=auditFilterIssue(filters);if(issue)throw new Error(issue);return auditFilter(filters);}
const where=`($1::text='' OR (e.created_at AT TIME ZONE 'America/Santiago')::date >= NULLIF($1,'')::date)
    AND ($2::text='' OR (e.created_at AT TIME ZONE 'America/Santiago')::date <= NULLIF($2,'')::date)
    AND ($3::text='' OR e.entity_type=$3)`;
const params=(filters:AuditFilters)=>[filters.from,filters.to,filters.kind];
export async function auditKinds(actor:Actor){await requireAdmin(actor);return db.query<{entity_type:string}>("SELECT DISTINCT entity_type FROM audit_events ORDER BY entity_type");}
export async function auditOverview(actor:Actor,filters:AuditFilters){
  await requireAdmin(actor);const normalized=checkedFilters(filters);
  const [row]=await db.query<{total:string;people:string;entities:string}>(`SELECT count(*)::text AS total,count(DISTINCT e.actor_id)::text AS people,count(DISTINCT e.entity_type)::text AS entities FROM audit_events e WHERE ${where}`,params(normalized));
  return {total:Number(row.total),people:Number(row.people),entities:Number(row.entities)};
}
export type AuditRow={id:string;actor_name:string;action:string;entity_type:string;entity_id:string;created_at:Date;created_at_cursor:string};
export type AuditCursor={at:string;id:string};
export async function auditReport(actor:Actor,filters:AuditFilters,limit=100,offset=0,before?:AuditCursor){
  await requireAdmin(actor);const normalized=checkedFilters(filters),size=z.number().int().min(1).max(500).parse(limit),skip=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(offset);
  if(before&&(!z.uuid().safeParse(before.id).success||!Number.isFinite(Date.parse(before.at))))throw new Error("Página de auditoría inválida.");
  return db.query<AuditRow>(`SELECT e.id,u.name AS actor_name,e.action,e.entity_type,e.entity_id,e.created_at,e.created_at::text AS created_at_cursor
    FROM audit_events e JOIN users u ON u.id=e.actor_id WHERE ${where}
    AND ($6::timestamptz IS NULL OR (e.created_at,e.id)<($6::timestamptz,$7::uuid))
    ORDER BY e.created_at DESC,e.id DESC LIMIT $4 OFFSET $5`,[...params(normalized),size,skip,before?.at??null,before?.id??null]);
}
export async function* iterateAuditReport(actor:Actor,filters:AuditFilters){
  let before:AuditCursor|undefined;
  while(true){const rows=await auditReport(actor,filters,500,0,before);if(!rows.length)return;yield rows;if(rows.length<500)return;const last=rows[rows.length-1];before={at:last.created_at_cursor,id:last.id};}
}
const entities:Record<string,string>={service_request:"Servicio",user:"Usuario",client:"Cliente",client_site:"Faena",asset:"Activo de flota",fleet_incident:"Avería de flota",waste_record:"Registro ambiental",service_certificate:"Certificado",service_extra_charge:"Cobro extraordinario",service_valuation:"Valorización",service_invoice:"Factura de servicio",invoice_payment:"Abono de factura",extra_receivable_invoice:"Factura extraordinaria",payment_statement:"Estado de pago",material_receipt:"Ingreso de material",material_stock_movement:"Movimiento de stock",material_guide_item:"Material de guía",quote:"Cotización",contract:"Contrato",tariff:"Tarifa",supplier_invoice:"Factura de proveedor",container:"Contenedor",fuel_entry:"Carga de combustible"};
const actions:Record<string,string>={create:"Creación",update:"Actualización",delete:"Eliminación",archive:"Archivo",approve:"Aprobación",review:"Revisión",confirm:"Confirmación",void:"Anulación",cancel:"Cancelación",payment:"Registro de abono",propose:"Propuesta de cobro",decide:"Decisión de cobro",record_invoice:"Registro de factura",confirm_invoice_total:"Confirmación de total",update_reference:"Actualización de referencia",unlink_void_invoice:"Desvinculación por anulación",day_result:"Resultado de parte diario",evidencia:"Documento adjuntado",solicitada:"Solicitud registrada",programada:"Programación",en_ruta:"Inicio de ruta",pendiente_revision:"Entrega a revisión",completada:"Cierre de servicio",cancelada:"Cancelación de servicio",checklist:"Checklist registrado",incident_reported:"Avería informada",incident_resolved:"Avería resuelta",incident_from_checklist:"Avería detectada en checklist",stock:"Movimiento de stock",catalogar:"Clasificación de material",quote_response_ack:"Acuse de respuesta de cotización"};
const readable=(value:string)=>{const words=value.replaceAll("_"," ");return words.charAt(0).toUpperCase()+words.slice(1);};
export const auditEntityLabel=(value:string)=>entities[value]??readable(value);
export const auditActionLabel=(value:string)=>actions[value]??readable(value);
