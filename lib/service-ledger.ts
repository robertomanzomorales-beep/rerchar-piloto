import {z} from "zod";
import type {Actor} from "./auth";
import {canManage,canReadService} from "./auth";
import {db,transaction} from "./db";

const uuid=z.uuid();
const date=z.union([z.iso.date(),z.literal("")]).default("");
const label=(max:number)=>z.string().trim().max(max).optional().default("");
export class LedgerError extends Error {}
function reject(message:string):never{throw new LedgerError(message);}
export type Followup={service_id:string;requested_on:Date|string|null;received_on:Date|string|null;documents_sent_on:Date|string|null;notes:string|null};
export type Commercial={service_id:string;quote_reference:string|null;quote_on:Date|string|null;order_reference:string|null;
  order_on:Date|string|null;service_sheet:string|null;eyj_guide:string|null;client_guide:string|null;sidrep:string|null;
  rental_days:string|null;quantity:string|null;service_value_clp:string|null;notes:string|null};
export async function getServiceLedger(actor:Actor,serviceId:string){
  if(!uuid.safeParse(serviceId).success)reject("Servicio inválido.");
  const [service]=await db.query<{client_id:string;driver_id:string|null}>("SELECT client_id,driver_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL",[serviceId]);
  if(!service||actor.role==="conductor"||!canReadService(actor,service))reject("Servicio no disponible.");
  const [followup,commercial]=await Promise.all([
    db.query<Followup>("SELECT * FROM valued_guide_followups WHERE service_id=$1",[serviceId]),
    db.query<Commercial>("SELECT * FROM service_commercial_details WHERE service_id=$1",[serviceId])]);
  return {followup:followup[0]??null,commercial:commercial[0]??null};
}
export async function listGuideFollowups(actor:Actor){
  if(!canManage(actor))reject("Acceso de operaciones requerido.");
  return db.query<{id:string;folio:string;client_name:string;site_name:string;scheduled_for:Date|null;status:string;
    requested_on:Date|string|null;received_on:Date|string|null;documents_sent_on:Date|string|null;notes:string|null}>(
    `SELECT s.id,s.folio,c.name AS client_name,cs.name AS site_name,s.scheduled_for,s.status,
      f.requested_on,f.received_on,f.documents_sent_on,f.notes FROM service_requests s
      JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
      LEFT JOIN valued_guide_followups f ON f.service_id=s.id
      WHERE s.deleted_at IS NULL AND s.status<>'cancelada' ORDER BY COALESCE(f.requested_on,s.scheduled_for::date,s.created_at::date) DESC LIMIT 250`);
}
export async function saveGuideFollowup(actor:Actor,serviceId:string,input:unknown){
  if(!canManage(actor))reject("Acceso de operaciones requerido.");
  uuid.parse(serviceId);
  const data=z.object({requested_on:date,received_on:date,documents_sent_on:date,notes:label(500)}).parse(input);
  if(data.received_on&&!data.requested_on)reject("Registre la fecha de solicitud antes de la recepción.");
  if(data.received_on&&data.received_on<data.requested_on)reject("La recepción precede a la solicitud.");
  if(data.documents_sent_on&&!data.received_on)reject("Registre la recepción antes del envío de documentos.");
  return transaction(async tx=>{
    const [service]=await tx.query("SELECT id FROM service_requests WHERE id=$1 AND deleted_at IS NULL",[serviceId]);
    if(!service)reject("Servicio no encontrado.");
    await tx.query(`INSERT INTO valued_guide_followups(service_id,requested_on,received_on,documents_sent_on,notes,updated_by)
      VALUES($1,NULLIF($2,'')::date,NULLIF($3,'')::date,NULLIF($4,'')::date,NULLIF($5,''),$6)
      ON CONFLICT(service_id) DO UPDATE SET requested_on=EXCLUDED.requested_on,received_on=EXCLUDED.received_on,
      documents_sent_on=EXCLUDED.documents_sent_on,notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [serviceId,data.requested_on,data.received_on,data.documents_sent_on,data.notes,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'update','valued_guide_followup',$2,$3)",
      [actor.id,serviceId,JSON.stringify(data)]);
  });
}
export async function saveCommercialDetails(actor:Actor,serviceId:string,input:unknown){
  if(!canManage(actor))reject("Acceso de operaciones requerido.");
  uuid.parse(serviceId);
  const number=z.union([z.literal(""),z.coerce.number().finite().min(0).max(1_000_000_000)]).default("");
  const data=z.object({quote_reference:label(100),quote_on:date,order_reference:label(100),order_on:date,
    service_sheet:label(100),eyj_guide:label(100),client_guide:label(100),sidrep:label(100),
    rental_days:number,quantity:number,service_value_clp:number,notes:label(700)}).parse(input);
  return transaction(async tx=>{
    const [service]=await tx.query("SELECT id FROM service_requests WHERE id=$1 AND deleted_at IS NULL",[serviceId]);
    if(!service)reject("Servicio no encontrado.");
    await tx.query(`INSERT INTO service_commercial_details(service_id,quote_reference,quote_on,order_reference,order_on,
      service_sheet,eyj_guide,client_guide,sidrep,rental_days,quantity,service_value_clp,notes,updated_by)
      VALUES($1,NULLIF($2,''),NULLIF($3,'')::date,NULLIF($4,''),NULLIF($5,'')::date,NULLIF($6,''),NULLIF($7,''),
        NULLIF($8,''),NULLIF($9,''),NULLIF($10::text,'')::numeric,NULLIF($11::text,'')::numeric,
        NULLIF($12::text,'')::numeric,NULLIF($13,''),$14)
      ON CONFLICT(service_id) DO UPDATE SET quote_reference=EXCLUDED.quote_reference,quote_on=EXCLUDED.quote_on,
      order_reference=EXCLUDED.order_reference,order_on=EXCLUDED.order_on,service_sheet=EXCLUDED.service_sheet,
      eyj_guide=EXCLUDED.eyj_guide,client_guide=EXCLUDED.client_guide,sidrep=EXCLUDED.sidrep,
      rental_days=EXCLUDED.rental_days,quantity=EXCLUDED.quantity,service_value_clp=EXCLUDED.service_value_clp,
      notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [serviceId,data.quote_reference,data.quote_on,data.order_reference,data.order_on,data.service_sheet,
        data.eyj_guide,data.client_guide,data.sidrep,data.rental_days,data.quantity,data.service_value_clp,data.notes,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'update','service_commercial_details',$2,$3)",
      [actor.id,serviceId,JSON.stringify(data)]);
  });
}
