import {z} from "zod";
import {canPlan,type Actor} from "./auth";
import {db,transaction} from "./db";
import type {Company} from "./companies";

export class FleetScheduleError extends Error {}
function deny(message:string):never{throw new FleetScheduleError(message);}
const uuid=z.uuid();
const daySchema=z.iso.date();
const blockingKinds=["mantencion","indisponible","sin_conductor"];
export type FleetDayNote={asset_id:string;day:Date|string;kind:string;detail:string};
export type ScheduledTrip={id:string;folio:string;operating_company:Company|null;assigned_asset_id:string;scheduled_for:Date;status:string;priority:string;client_name:string;site_name:string;waste_type:string;driver_name:string|null;ramp_label:string|null;notes:string|null};
export type UnplannedTrip={id:string;folio:string;operating_company:Company|null;priority:string;client_name:string;site_name:string;waste_type:string;created_at:Date};

export async function weeklyFleet(actor:Actor,from:string,to:string,company=""){
  if(!canPlan(actor))deny("Sólo operaciones puede consultar la programación de flota.");
  if(!daySchema.safeParse(from).success||!daySchema.safeParse(to).success||from>=to||
    (new Date(to).getTime()-new Date(from).getTime())!==7*86400000)deny("Semana inválida.");
  if(company!==""&&company!=="rerchar"&&company!=="e_y_j")deny("Empresa inválida.");
  const [assets,notes,trips,pending]=await Promise.all([
    db.query<{id:string;code:string;plate:string|null;label:string;available:boolean}>(
      "SELECT id,code,plate,label,available FROM assets WHERE kind='camion' AND deleted_at IS NULL ORDER BY code"),
    db.query<FleetDayNote>("SELECT asset_id,day,kind,detail FROM fleet_day_notes WHERE day >= $1::date AND day < $2::date ORDER BY day",[from,to]),
    db.query<ScheduledTrip>(`SELECT s.id,s.folio,s.operating_company,s.assigned_asset_id,s.scheduled_for,s.status,s.priority,
       c.name AS client_name,cs.name AS site_name,s.waste_type,COALESCE(u.name,ed.name) AS driver_name,
       CASE WHEN r.id IS NOT NULL THEN COALESCE(NULLIF(r.plate,''),r.code) END AS ramp_label,s.notes
      FROM service_requests s JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
      LEFT JOIN users u ON u.id=s.driver_id LEFT JOIN external_drivers ed ON ed.id=s.external_driver_id
      LEFT JOIN assets r ON r.id=s.ramp_asset_id
      WHERE s.deleted_at IS NULL AND s.assigned_asset_id IS NOT NULL AND s.service_type<>'arriendo'
        AND s.status IN ('programada','en_ruta','pendiente_revision','completada')
        AND (s.scheduled_for AT TIME ZONE 'America/Santiago')::date >= $1::date
        AND (s.scheduled_for AT TIME ZONE 'America/Santiago')::date < $2::date
      ORDER BY s.scheduled_for,s.folio LIMIT 1000`,[from,to]),
    db.query<UnplannedTrip>(`SELECT s.id,s.folio,s.operating_company,s.priority,c.name AS client_name,cs.name AS site_name,s.waste_type,s.created_at
      FROM service_requests s JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
      WHERE s.deleted_at IS NULL AND s.status='solicitada' AND s.service_type<>'arriendo'
        AND ($1::text='' OR s.operating_company=$1)
      ORDER BY CASE s.priority WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END,s.created_at,s.folio LIMIT 60`,[company]),
  ]);
  return {assets,notes,trips,pending};
}

export async function setFleetDay(actor:Actor,input:unknown){
  if(!canPlan(actor))deny("Sólo operaciones puede modificar la programación.");
  const data=z.object({asset_id:uuid,day:daySchema,kind:z.enum(["mantencion","indisponible","sin_conductor","nota","despejado"]),
    detail:z.string().trim().max(500)}).parse(input);
  if(data.kind!=="despejado"&&data.detail.length<2)deny("Indique el motivo u observación (mínimo 2 caracteres).");
  return transaction(async tx=>{
    // La asignación de servicios y este bloqueo comparten el candado del activo.
    const [asset]=await tx.query<{id:string}>("SELECT id FROM assets WHERE id=$1 AND kind='camion' AND deleted_at IS NULL FOR UPDATE",[data.asset_id]);
    if(!asset)deny("Seleccione un camión registrado.");
    const [before]=await tx.query<{kind:string;detail:string}>("SELECT kind,detail FROM fleet_day_notes WHERE asset_id=$1 AND day=$2::date",[data.asset_id,data.day]);
    if(data.kind==="despejado"){
      await tx.query("DELETE FROM fleet_day_notes WHERE asset_id=$1 AND day=$2::date",[data.asset_id,data.day]);
    }else{
      if(blockingKinds.includes(data.kind)){
        const [trip]=await tx.query(`SELECT id FROM service_requests WHERE deleted_at IS NULL
          AND status IN ('programada','en_ruta') AND (assigned_asset_id=$1 OR ramp_asset_id=$1)
          AND (scheduled_for AT TIME ZONE 'America/Santiago')::date=$2::date LIMIT 1`,[data.asset_id,data.day]);
        if(trip)deny("Ya hay un servicio activo asignado ese día. Reprográmelo antes de bloquear el camión.");
      }
      await tx.query(`INSERT INTO fleet_day_notes(asset_id,day,kind,detail,updated_by) VALUES($1,$2::date,$3,$4,$5)
        ON CONFLICT(asset_id,day) DO UPDATE SET kind=EXCLUDED.kind,detail=EXCLUDED.detail,updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [data.asset_id,data.day,data.kind,data.detail,actor.id]);
    }
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES($1,'fleet_day_updated','asset',$2,$3,$4)`,[actor.id,data.asset_id,
      before?JSON.stringify({day:data.day,...before}):null,
      data.kind==="despejado"?null:JSON.stringify({day:data.day,kind:data.kind,detail:data.detail})]);
  });
}
