import {z} from "zod";
import type {Actor} from "./auth";
import {canPlan,canReadService} from "./auth";
import {db,transaction} from "./db";
import type {Company} from "./companies";

export class ServiceDayError extends Error {}
const invalid=(message:string):never=>{throw new ServiceDayError(message);};
const uuid=z.uuid();
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

export type DayReport={service_id:string;day:Date|string;asset_id:string;driver_name:string|null;
  outcome:"completado"|"incompleto"|"suspendido";observation:string;recorded_by:string;updated_at:Date};
export type DayReportWeek=DayReport&{folio:string;operating_company:Company|null;client_name:string;waste_type:string};
export const resultLabel:Record<DayReport["outcome"],string>={completado:"Realizado",incompleto:"Incompleto",suspendido:"Suspendido"};

export async function reportServiceDay(actor:Actor,serviceId:string,input:unknown){
  if(!canPlan(actor))invalid("Sólo operaciones puede registrar resultados de terreno.");
  if(!uuid.safeParse(serviceId).success)invalid("Servicio inválido.");
  const data=z.object({day:z.iso.date(),outcome:z.enum(["completado","incompleto","suspendido"]),
    observation:z.string().trim().max(1000)}).parse(input);
  if(data.day>today())invalid("No se puede registrar un resultado en una fecha futura.");
  if(data.outcome!=="completado"&&data.observation.length<5)invalid("Explique qué quedó pendiente o por qué se suspendió (mínimo 5 caracteres).");
  return transaction(async tx=>{
    const [service]=await tx.query<{status:string;service_type:string;scheduled_for:Date|null;assigned_asset_id:string|null;driver_name:string|null}>(
      `SELECT s.status,s.service_type,s.scheduled_for,s.assigned_asset_id,COALESCE(u.name,e.name) AS driver_name
       FROM service_requests s LEFT JOIN users u ON u.id=s.driver_id LEFT JOIN external_drivers e ON e.id=s.external_driver_id
       WHERE s.id=$1 AND s.deleted_at IS NULL FOR UPDATE OF s`,[serviceId]);
    if(!service||service.service_type==="arriendo"||!service.scheduled_for||!service.assigned_asset_id||
      !["programada","en_ruta","pendiente_revision","completada"].includes(service.status))
      invalid("Programe primero un servicio de camión vigente para registrar su resultado.");
    const planned=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(service.scheduled_for!));
    if(data.day<planned)invalid("El resultado no puede ser anterior a la fecha programada.");
    const [before]=await tx.query<DayReport>("SELECT * FROM service_day_reports WHERE service_id=$1 AND day=$2::date",[serviceId,data.day]);
    await tx.query(`INSERT INTO service_day_reports(service_id,day,asset_id,driver_name,outcome,observation,recorded_by)
      VALUES($1,$2::date,$3,$4,$5,$6,$7) ON CONFLICT(service_id,day) DO UPDATE SET
      asset_id=EXCLUDED.asset_id,driver_name=EXCLUDED.driver_name,outcome=EXCLUDED.outcome,
      observation=EXCLUDED.observation,recorded_by=EXCLUDED.recorded_by,updated_at=now()`,
      [serviceId,data.day,service.assigned_asset_id,service.driver_name,data.outcome,data.observation,actor.id]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES($1,'day_result','service_request',$2,$3,$4)`,[actor.id,serviceId,
      before?JSON.stringify({day:data.day,outcome:before.outcome,observation:before.observation}):null,
      JSON.stringify({day:data.day,outcome:data.outcome,observation:data.observation,asset_id:service.assigned_asset_id})]);
  });
}

export async function listServiceDays(actor:Actor,serviceId:string){
  if(!uuid.safeParse(serviceId).success)invalid("Servicio inválido.");
  const [service]=await db.query<{client_id:string;driver_id:string|null}>("SELECT client_id,driver_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL",[serviceId]);
  if(!service||!canReadService(actor,service))invalid("Servicio no disponible.");
  return db.query<DayReport>("SELECT * FROM service_day_reports WHERE service_id=$1 ORDER BY day DESC LIMIT 120",[serviceId]);
}

export async function listWeekResults(actor:Actor,from:string,to:string){
  if(!canPlan(actor))invalid("Acceso de operaciones requerido.");
  return db.query<DayReportWeek>(`SELECT d.*,s.folio,s.operating_company,c.name AS client_name,s.waste_type
    FROM service_day_reports d JOIN service_requests s ON s.id=d.service_id JOIN clients c ON c.id=s.client_id
    WHERE s.deleted_at IS NULL AND d.day >= $1::date AND d.day < $2::date ORDER BY d.day,d.updated_at LIMIT 1000`,[from,to]);
}

export async function listOpenDayAlerts(actor:Actor,company=""){
  if(!canPlan(actor))invalid("Acceso de operaciones requerido.");
  if(company&&!(["rerchar","e_y_j"] as string[]).includes(company))invalid("Empresa inválida.");
  return db.query<DayReportWeek>(`SELECT d.*,s.folio,s.operating_company,c.name AS client_name,s.waste_type FROM (
      SELECT DISTINCT ON (service_id) * FROM service_day_reports ORDER BY service_id,day DESC
    ) d JOIN service_requests s ON s.id=d.service_id JOIN clients c ON c.id=s.client_id
    WHERE s.deleted_at IS NULL AND s.status IN ('programada','en_ruta','pendiente_revision')
      AND d.outcome IN ('incompleto','suspendido') AND ($1::text='' OR s.operating_company=$1)
    ORDER BY d.day DESC,d.updated_at DESC LIMIT 100`,[company]);
}
