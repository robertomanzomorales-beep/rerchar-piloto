import {z} from "zod";
import type {Actor} from "./auth";
import {canManage,canReadService} from "./auth";
import {db,transaction} from "./db";
import type {Company} from "./companies";

const uuid=z.uuid();
const date=z.union([z.iso.date(),z.literal("")]).default("");
const label=(max:number)=>z.string().trim().max(max).optional().default("");
export class LedgerError extends Error {}
function reject(message:string):never{throw new LedgerError(message);}
export type Followup={service_id:string;dispatch_guide_status:string|null;requested_on:Date|string|null;due_on:Date|string|null;
  responsible_user_id:string|null;received_on:Date|string|null;documents_sent_on:Date|string|null;notes:string|null};
export type GuideFilter="todas"|"atrasadas"|"proximas"|"sin_plazo"|"pendientes"|"mias";
export function parseGuideFilter(value:string|undefined):GuideFilter{
  return value==="atrasadas"||value==="proximas"||value==="sin_plazo"||value==="pendientes"||value==="mias"?value:"todas";
}
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
export async function guideFollowupOverview(actor:Actor,asOf:string){
  if(!canManage(actor))reject("Acceso de operaciones requerido.");
  const [counts]=await db.query<{waiting_request:string;pending:string;overdue:string;my_overdue:string;upcoming:string;undated:string;waiting_close:string}>(
    `SELECT count(*) FILTER (WHERE s.scheduled_for IS NOT NULL
        AND COALESCE((SELECT max(d.day) FROM service_day_reports d WHERE d.service_id=s.id AND d.outcome='completado'),
          (s.scheduled_for AT TIME ZONE 'America/Santiago')::date)<=$1::date AND f.requested_on IS NULL)::text AS waiting_request,
      count(*) FILTER (WHERE f.requested_on IS NOT NULL AND f.received_on IS NULL)::text AS pending,
      count(*) FILTER (WHERE f.requested_on IS NOT NULL AND f.received_on IS NULL AND f.due_on<$1::date)::text AS overdue,
      count(*) FILTER (WHERE f.requested_on IS NOT NULL AND f.received_on IS NULL
        AND f.due_on<$1::date AND f.responsible_user_id=$2::uuid)::text AS my_overdue,
      count(*) FILTER (WHERE f.requested_on IS NOT NULL AND f.received_on IS NULL
        AND f.due_on BETWEEN $1::date AND $1::date+7)::text AS upcoming,
      count(*) FILTER (WHERE f.requested_on IS NOT NULL AND f.received_on IS NULL AND f.due_on IS NULL)::text AS undated,
      count(*) FILTER (WHERE f.received_on IS NOT NULL AND f.documents_sent_on IS NULL)::text AS waiting_close
    FROM service_requests s LEFT JOIN valued_guide_followups f ON f.service_id=s.id
    WHERE s.operating_company='rerchar' AND s.deleted_at IS NULL AND s.status<>'cancelada'
      AND s.service_type<>'arriendo' AND (s.scheduled_for IS NOT NULL OR f.service_id IS NOT NULL)`,[asOf,actor.id]);
  return counts??{waiting_request:"0",pending:"0",overdue:"0",my_overdue:"0",upcoming:"0",undated:"0",waiting_close:"0"};
}
export async function listGuideFollowups(actor:Actor,company="",filter:GuideFilter="todas",asOf=""){
  if(!canManage(actor))reject("Acceso de operaciones requerido.");
  return db.query<{id:string;folio:string;operating_company:Company|null;client_name:string;site_name:string;scheduled_for:Date|null;service_day:Date|string;status:string;dispatch_guide_status:string|null;
    requested_on:Date|string|null;due_on:Date|string|null;responsible_name:string|null;received_on:Date|string|null;documents_sent_on:Date|string|null;notes:string|null}>(
    `SELECT s.id,s.folio,s.operating_company,c.name AS client_name,cs.name AS site_name,s.scheduled_for,s.status,
      COALESCE((SELECT max(d.day) FROM service_day_reports d WHERE d.service_id=s.id AND d.outcome='completado'),
        (s.scheduled_for AT TIME ZONE 'America/Santiago')::date) AS service_day,
      f.dispatch_guide_status,f.requested_on,f.due_on,u.name AS responsible_name,f.received_on,f.documents_sent_on,f.notes FROM service_requests s
      JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
      LEFT JOIN valued_guide_followups f ON f.service_id=s.id
      LEFT JOIN users u ON u.id=f.responsible_user_id
      WHERE s.deleted_at IS NULL AND s.status<>'cancelada' AND s.service_type<>'arriendo'
        AND (s.scheduled_for IS NOT NULL OR f.service_id IS NOT NULL)
        AND s.operating_company='rerchar' AND ($1::text='' OR s.operating_company=$1)
        AND ($2::text='todas' OR ($2='pendientes' AND f.requested_on IS NOT NULL AND f.received_on IS NULL)
          OR ($2='atrasadas' AND f.requested_on IS NOT NULL AND f.received_on IS NULL AND f.due_on<$3::date)
          OR ($2='proximas' AND f.requested_on IS NOT NULL AND f.received_on IS NULL AND f.due_on BETWEEN $3::date AND $3::date+7)
          OR ($2='sin_plazo' AND f.requested_on IS NOT NULL AND f.received_on IS NULL AND f.due_on IS NULL)
          OR ($2='mias' AND f.requested_on IS NOT NULL AND f.received_on IS NULL AND f.responsible_user_id=$4::uuid))
      ORDER BY CASE WHEN f.requested_on IS NOT NULL AND f.received_on IS NULL THEN 0 ELSE 1 END,
        f.due_on ASC NULLS LAST,COALESCE(f.requested_on,(s.scheduled_for AT TIME ZONE 'America/Santiago')::date,s.created_at::date) DESC
      LIMIT 250`,[company,filter,asOf||"2000-01-01",actor.id]);
}
export async function saveGuideFollowup(actor:Actor,serviceId:string,input:unknown){
  if(!canManage(actor))reject("Acceso de operaciones requerido.");
  uuid.parse(serviceId);
  const data=z.object({dispatch_guide_status:z.enum(["pendiente","enviada","no_aplica",""]).default(""),
    requested_on:date,due_on:date,responsible_user_id:z.union([uuid,z.literal("")]).default(""),
    received_on:date,documents_sent_on:date,notes:label(500)}).parse(input);
  if(data.received_on&&!data.requested_on)reject("Registre la fecha de solicitud antes de la recepción.");
  if(data.received_on&&data.received_on<data.requested_on)reject("La recepción precede a la solicitud.");
  if(data.due_on&&!data.requested_on)reject("Registre la solicitud antes de acordar el plazo.");
  if(data.due_on&&data.due_on<data.requested_on)reject("El plazo no puede anteceder a la solicitud.");
  if(data.due_on&&!data.responsible_user_id)reject("Asigne a quien gestionará la guía valorizada.");
  if(!data.requested_on&&(data.due_on||data.responsible_user_id))reject("Registre la solicitud antes de asignar el seguimiento.");
  return transaction(async tx=>{
    const [service]=await tx.query<{operating_company:Company|null}>("SELECT operating_company FROM service_requests WHERE id=$1 AND deleted_at IS NULL",[serviceId]);
    if(!service)reject("Servicio no encontrado.");
    if(service.operating_company==="e_y_j"&&(data.requested_on||data.received_on||data.due_on||data.responsible_user_id))reject("E y J no utiliza guías valorizadas. Registre sólo su cierre documental.");
    if(data.responsible_user_id){
      const [owner]=await tx.query("SELECT id FROM users WHERE id=$1 AND active=true AND role IN ('admin','operaciones')",[data.responsible_user_id]);
      if(!owner)reject("Seleccione un responsable activo de administración u operaciones.");
    }
    if(service.operating_company!=="e_y_j"&&data.documents_sent_on&&!data.received_on)reject("Registre la recepción antes del envío de documentos.");
    if(service.operating_company!=="e_y_j"&&data.documents_sent_on&&data.documents_sent_on<data.received_on)reject("El envío de documentos no puede anteceder a la recepción de la guía.");
    await tx.query(`INSERT INTO valued_guide_followups(service_id,requested_on,received_on,documents_sent_on,notes,updated_by,dispatch_guide_status,due_on,responsible_user_id)
      VALUES($1,NULLIF($2,'')::date,NULLIF($3,'')::date,NULLIF($4,'')::date,NULLIF($5,''),$6,NULLIF($7,''),NULLIF($8,'')::date,NULLIF($9,'')::uuid)
      ON CONFLICT(service_id) DO UPDATE SET requested_on=EXCLUDED.requested_on,received_on=EXCLUDED.received_on,
      documents_sent_on=EXCLUDED.documents_sent_on,notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,
      dispatch_guide_status=EXCLUDED.dispatch_guide_status,due_on=EXCLUDED.due_on,
      responsible_user_id=EXCLUDED.responsible_user_id,updated_at=now()`,
      [serviceId,data.requested_on,data.received_on,data.documents_sent_on,data.notes,actor.id,data.dispatch_guide_status,
        data.due_on,data.responsible_user_id]);
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
