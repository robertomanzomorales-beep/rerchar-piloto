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
export type ServiceDayEntry=DayReport&{revision:string;asset_code:string;asset_label:string;asset_plate:string|null;recorder_name:string};
export type DayReportWeek=DayReport&{folio:string;operating_company:Company|null;client_name:string;waste_type:string};
export const resultLabel:Record<DayReport["outcome"],string>={completado:"Realizado",incompleto:"Incompleto",suspendido:"Suspendido"};

export async function reportServiceDay(actor:Actor,serviceId:string,input:unknown,company?:Company){
  if(!canPlan(actor))invalid("Sólo operaciones puede registrar resultados de terreno.");
  if(!uuid.safeParse(serviceId).success)invalid("Servicio inválido.");
  const expectedCompany=company===undefined?undefined:z.enum(["rerchar","e_y_j"]).parse(company);
  const data=z.object({day:z.iso.date(),outcome:z.enum(["completado","incompleto","suspendido"]),
    observation:z.string().trim().max(1000),expected_revision:z.string().max(80).optional()}).parse(input);
  if(data.day>today())invalid("No se puede registrar un resultado en una fecha futura.");
  if(data.outcome!=="completado"&&data.observation.length<5)invalid("Explique qué quedó pendiente o por qué se suspendió (mínimo 5 caracteres).");
  return transaction(async tx=>{
    const [currentUser]=await tx.query("SELECT id FROM users WHERE id=$1 AND active=true AND role IN ('admin','operaciones') FOR SHARE",[actor.id]);
    if(!currentUser)invalid("Su acceso para registrar partes ya no está activo.");
    const [service]=await tx.query<{status:string;service_type:string;scheduled_for:Date|null;assigned_asset_id:string|null;driver_name:string|null;operating_company:Company|null}>(
      `SELECT s.status,s.service_type,s.scheduled_for,s.assigned_asset_id,s.operating_company,COALESCE(u.name,e.name) AS driver_name
       FROM service_requests s LEFT JOIN users u ON u.id=s.driver_id LEFT JOIN external_drivers e ON e.id=s.external_driver_id
       WHERE s.id=$1 AND s.deleted_at IS NULL FOR UPDATE OF s`,[serviceId]);
    if(!service||service.service_type==="arriendo"||!["programada","en_ruta","pendiente_revision","completada"].includes(service.status))
      invalid("Programe primero un servicio de camión vigente para registrar su resultado.");
    if(expectedCompany&&service.operating_company!==expectedCompany)invalid("La empresa del servicio cambió. Vuelva a consultar la ficha.");
    const [before]=await tx.query<DayReport&{revision:string}>("SELECT *,updated_at::text AS revision FROM service_day_reports WHERE service_id=$1 AND day=$2::date",[serviceId,data.day]);
    const unchanged=before&&before.outcome===data.outcome&&before.observation===data.observation;
    if(data.expected_revision!==undefined){
      if(before&&unchanged)return;
      if(before&&data.expected_revision!==before.revision)invalid(data.expected_revision?"Este parte cambió después de abrirlo. Revise el registro actualizado antes de corregirlo.":"Ya existe un parte para esta fecha. Ábralo desde el historial para corregirlo.");
      if(!before&&data.expected_revision)invalid("El parte que intentaba corregir ya no está disponible. Consulte nuevamente el historial.");
    }
    if(unchanged)return;
    if(!before){
      if(!service.scheduled_for||!service.assigned_asset_id)invalid("Programe primero el camión y la fecha del servicio.");
      const planned=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(service.scheduled_for!));
      if(data.day<planned)invalid("El resultado no puede ser anterior a la fecha programada.");
    }
    const assetId=before?.asset_id??service.assigned_asset_id,driverName=before?before.driver_name:service.driver_name;
    await tx.query(`INSERT INTO service_day_reports(service_id,day,asset_id,driver_name,outcome,observation,recorded_by)
      VALUES($1,$2::date,$3,$4,$5,$6,$7) ON CONFLICT(service_id,day) DO UPDATE SET
      outcome=EXCLUDED.outcome,observation=EXCLUDED.observation,recorded_by=EXCLUDED.recorded_by,updated_at=clock_timestamp()`,
      [serviceId,data.day,assetId,driverName,data.outcome,data.observation,actor.id]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES($1,'day_result','service_request',$2,$3,$4)`,[actor.id,serviceId,
      before?JSON.stringify({day:data.day,outcome:before.outcome,observation:before.observation,asset_id:before.asset_id,driver_name:before.driver_name}):null,
      JSON.stringify({day:data.day,outcome:data.outcome,observation:data.observation,asset_id:assetId,driver_name:driverName})]);
  });
}

export async function listServiceDays(actor:Actor,serviceId:string){
  if(!uuid.safeParse(serviceId).success)invalid("Servicio inválido.");
  const [service]=await db.query<{client_id:string;driver_id:string|null}>("SELECT client_id,driver_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL",[serviceId]);
  if(!service||!canReadService(actor,service))invalid("Servicio no disponible.");
  return db.query<ServiceDayEntry>(`SELECT d.*,d.updated_at::text AS revision,a.code AS asset_code,a.label AS asset_label,a.plate AS asset_plate,u.name AS recorder_name
    FROM service_day_reports d JOIN assets a ON a.id=d.asset_id JOIN users u ON u.id=d.recorded_by
    WHERE d.service_id=$1 ORDER BY d.day DESC`,[serviceId]);
}

export async function listWeekResults(actor:Actor,from:string,to:string){
  if(!canPlan(actor))invalid("Acceso de operaciones requerido.");
  if(!z.iso.date().safeParse(from).success||!z.iso.date().safeParse(to).success||from>=to||
    new Date(to).getTime()-new Date(from).getTime()!==7*86400000)invalid("Semana inválida.");
  return db.query<DayReportWeek>(`SELECT d.*,s.folio,s.operating_company,c.name AS client_name,s.waste_type
    FROM service_day_reports d JOIN service_requests s ON s.id=d.service_id JOIN clients c ON c.id=s.client_id
    WHERE s.deleted_at IS NULL AND d.day >= $1::date AND d.day < $2::date ORDER BY d.day,d.updated_at,d.service_id`,[from,to]);
}

export async function listOpenDayAlerts(actor:Actor,company="",page=1){
  if(!canPlan(actor))invalid("Acceso de operaciones requerido.");
  if(company&&!(["rerchar","e_y_j"] as string[]).includes(company))invalid("Empresa inválida.");
  const offset=(Math.max(1,Math.min(10_000,Math.trunc(page)||1))-1)*100;
  const from=`FROM (SELECT DISTINCT ON (service_id) * FROM service_day_reports ORDER BY service_id,day DESC) d
    JOIN service_requests s ON s.id=d.service_id`;
  const where=`WHERE s.deleted_at IS NULL AND s.status IN ('programada','en_ruta','pendiente_revision')
      AND d.outcome IN ('incompleto','suspendido') AND ($1::text='' OR s.operating_company=$1)`;
  const [count,items]=await Promise.all([
    db.query<{total:string}>(`SELECT count(*)::text AS total ${from} ${where}`,[company]),
    db.query<DayReportWeek>(`SELECT d.*,s.folio,s.operating_company,c.name AS client_name,s.waste_type ${from}
    JOIN clients c ON c.id=s.client_id ${where}
    ORDER BY d.day DESC,d.updated_at DESC,d.service_id DESC LIMIT 100 OFFSET $2`,[company,offset]),
  ]);
  return {total:Number(count[0]?.total??0),items};
}
