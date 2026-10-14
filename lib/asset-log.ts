import { z } from "zod";
import type { Actor } from "./auth";
import { canManage } from "./auth";
import { db, transaction, type Db } from "./db";

const uuid=z.uuid();
const nonnegative=z.coerce.number().finite().min(0).max(100_000_000);
const positive=z.coerce.number().finite().positive().max(100_000_000);
const optionalDate=z.union([z.literal(""),z.iso.date()]).default("");
const optionalText=(max:number)=>z.string().trim().max(max).default("");
export class AssetLogError extends Error {}
function reject(message:string):never { throw new AssetLogError(message); }
function guard(actor:Actor) { if(!canManage(actor)) reject("Este registro requiere acceso de operaciones."); }
function todayChile() { return new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
async function audit(tx:Db,actor:Actor,action:string,entityType:string,entityId:string,change:unknown) {
  await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,$2,$3,$4,$5)",
    [actor.id,action,entityType,entityId,JSON.stringify(change)]);
}

export type EquipmentItem={id:string;asset_id:string;name:string;quantity:string;condition:string;
  expires_on:Date|string|null;note:string|null;warning:boolean};
export type AssetRoute={id:string;source:"servicio"|"guia";event_at:Date|string;guide_number:string|null;
  movement_type:string;origin:string;destination:string;counterparty:string;status:string;
  net_kg:string|null;href:string};
export type AssetFault={id:string;asset_id:string;description:string;severity:string;status:string;
  observed_on:Date|string|null;reported_at:Date;resolved_at:Date|null;resolution:string|null;
  source_service_id:string|null;reported_by_name:string};
export type AssetOrder={id:string;folio:string;kind:string;title:string;description:string|null;
  status:string;performed_on:Date|string|null;history_only:boolean;closed_at:Date|null;
  created_at:Date;reading_at_close:string|null;resolution:string|null};
export type AssetPlan={id:string;title:string;next_due_date:Date|string|null;next_due_reading:string|null;
  current_reading:string;reading_unit:string;frequency_kind:string};

export async function getAssetLog(actor:Actor,assetId:string) {
  guard(actor);
  if(!uuid.safeParse(assetId).success) reject("Activo inválido.");
  const [asset]=await db.query<{id:string;code:string;label:string;kind:string;plate:string|null;
    brand:string|null;model:string|null;available:boolean;reading_unit:string;current_reading:string}>(
      "SELECT id,code,label,kind,plate,brand,model,available,reading_unit,current_reading FROM assets WHERE id=$1 AND deleted_at IS NULL",[assetId]);
  if(!asset) reject("Activo no encontrado.");
  const [serviceRoutes,directGuides,faults,orders,plans,equipment]=await Promise.all([
    db.query<Omit<AssetRoute,"source"|"href">>(`SELECT s.id,COALESCE(s.scheduled_for,s.created_at) AS event_at,s.guide_number,
      COALESCE(s.request_category,s.service_type) AS movement_type,s.origin,s.destination,c.name AS counterparty,
      s.status,(s.gross_kg-s.tare_kg)::text AS net_kg
      FROM service_requests s JOIN clients c ON c.id=s.client_id
      WHERE (s.assigned_asset_id=$1 OR s.ramp_asset_id=$1) AND s.deleted_at IS NULL
      ORDER BY event_at DESC,s.id DESC LIMIT 100`,[assetId]),
    db.query<Omit<AssetRoute,"source"|"href">>(`SELECT g.id,(g.movement_on+time '12:00') AT TIME ZONE 'America/Santiago' AS event_at,
      g.guide_number,g.movement_type,g.origin,g.destination,c.name AS counterparty,
      'registrada' AS status,NULL::text AS net_kg
      FROM material_guides g JOIN clients c ON c.id=g.counterparty_id
      WHERE ($1::text='camion' AND (upper(trim(g.truck_plate))=upper(trim($2::text)) OR upper(trim(g.truck_plate))=upper(trim($3::text))))
        OR ($1::text='rampa' AND (upper(trim(g.trailer_plate))=upper(trim($2::text)) OR upper(trim(g.trailer_plate))=upper(trim($3::text))))
      ORDER BY g.movement_on DESC,g.id DESC LIMIT 100`,[asset.kind,asset.plate,asset.code]),
    db.query<AssetFault>(`SELECT i.*,u.name AS reported_by_name FROM fleet_incidents i JOIN users u ON u.id=i.reported_by
      WHERE i.asset_id=$1 ORDER BY COALESCE(i.observed_on::timestamp,i.reported_at) DESC,i.reported_at DESC LIMIT 100`,[assetId]),
    db.query<AssetOrder>(`SELECT id,folio,kind,title,description,status,performed_on,history_only,closed_at,created_at,reading_at_close,resolution
      FROM work_orders WHERE asset_id=$1 ORDER BY COALESCE(performed_on::timestamp,closed_at,created_at) DESC,id DESC LIMIT 100`,[assetId]),
    db.query<AssetPlan>(`SELECT p.id,p.title,p.frequency_kind,p.next_due_date,p.next_due_reading,a.current_reading,a.reading_unit
      FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id WHERE p.asset_id=$1 AND p.active=true ORDER BY p.created_at DESC`,[assetId]),
    db.query<EquipmentItem>(`SELECT e.*,(e.condition<>'operativo' OR COALESCE(e.expires_on <= (now() AT TIME ZONE 'America/Santiago')::date+30,false)) AS warning
      FROM asset_equipment_inventory e WHERE e.asset_id=$1 AND e.active=true ORDER BY warning DESC,e.name LIMIT 200`,[assetId]),
  ]);
  const routes:AssetRoute[]=[
    ...serviceRoutes.map((row)=>({...row,source:"servicio" as const,href:`/solicitudes/${row.id}`})),
    ...directGuides.map((row)=>({...row,source:"guia" as const,href:`/control-guias/${row.id}`})),
  ].sort((a,b)=>new Date(b.event_at).getTime()-new Date(a.event_at).getTime()).slice(0,100);
  return {asset,routes,faults,orders,plans,equipment};
}

export async function addAssetEquipment(actor:Actor,input:unknown) {
  guard(actor);
  const data=z.object({asset_id:uuid,name:z.string().trim().min(2).max(120),quantity:positive,
    condition:z.enum(["operativo","por_revisar","fuera_servicio"]),expires_on:optionalDate,note:optionalText(500)}).parse(input);
  return transaction(async tx=>{
    const [asset]=await tx.query("SELECT id FROM assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[data.asset_id]);
    if(!asset) reject("Activo no encontrado.");
    const [existing]=await tx.query("SELECT id FROM asset_equipment_inventory WHERE asset_id=$1 AND lower(name)=lower($2) AND active=true",[data.asset_id,data.name]);
    if(existing) reject("El elemento ya está registrado para este activo. Edite su cantidad o condición.");
    const [row]=await tx.query<{id:string}>(`INSERT INTO asset_equipment_inventory
      (asset_id,name,quantity,condition,expires_on,note,created_by)
      VALUES ($1,$2,$3,$4,NULLIF($5,'')::date,NULLIF($6,''),$7) RETURNING id`,
      [data.asset_id,data.name,data.quantity,data.condition,data.expires_on,data.note,actor.id]);
    await audit(tx,actor,"create","asset_equipment_inventory",row.id,data);
    return row.id;
  });
}

export async function updateAssetEquipment(actor:Actor,id:string,input:unknown) {
  guard(actor);
  const itemId=uuid.parse(id);
  const data=z.object({quantity:positive,condition:z.enum(["operativo","por_revisar","fuera_servicio"]),
    expires_on:optionalDate,note:optionalText(500)}).parse(input);
  return transaction(async tx=>{
    const [row]=await tx.query<{asset_id:string}>("SELECT asset_id FROM asset_equipment_inventory WHERE id=$1 AND active=true FOR UPDATE",[itemId]);
    if(!row) reject("Elemento no encontrado.");
    await tx.query(`UPDATE asset_equipment_inventory SET quantity=$2,condition=$3,expires_on=NULLIF($4,'')::date,
      note=NULLIF($5,''),updated_at=now() WHERE id=$1`,[itemId,data.quantity,data.condition,data.expires_on,data.note]);
    await audit(tx,actor,"update","asset_equipment_inventory",itemId,data);
    return row.asset_id;
  });
}

export async function removeAssetEquipment(actor:Actor,id:string) {
  guard(actor);
  const itemId=uuid.parse(id);
  return transaction(async tx=>{
    const [row]=await tx.query<{asset_id:string}>("UPDATE asset_equipment_inventory SET active=false,updated_at=now() WHERE id=$1 AND active=true RETURNING asset_id",[itemId]);
    if(!row) reject("Elemento no encontrado.");
    await audit(tx,actor,"remove","asset_equipment_inventory",itemId,{asset_id:row.asset_id});
    return row.asset_id;
  });
}

export async function recordAssetMaintenance(actor:Actor,input:unknown) {
  guard(actor);
  const data=z.object({asset_id:uuid,performed_on:z.iso.date(),title:z.string().trim().min(5).max(160),
    description:optionalText(1500),kind:z.enum(["preventiva","correctiva","neumaticos"]),
    reading:z.union([z.literal(""),nonnegative]).default("")}).parse(input);
  if(data.performed_on>todayChile()) reject("La mantención histórica no puede tener una fecha futura.");
  return transaction(async tx=>{
    const [asset]=await tx.query<{reading_unit:string}>("SELECT reading_unit FROM assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[data.asset_id]);
    if(!asset) reject("Activo no encontrado.");
    if(data.reading!==""&&asset.reading_unit==="sin") reject("Configure la unidad de lectura del activo o deje el campo vacío.");
    const [row]=await tx.query<{id:string}>(`INSERT INTO work_orders
      (asset_id,kind,title,description,status,started_at,closed_at,performed_on,history_only,reading_at_close,resolution,created_by,closed_by)
      VALUES ($1,$2,$3,NULLIF($4,''),'cerrada',now(),now(),$5,true,$6,$7,$8,$8) RETURNING id`,
      [data.asset_id,data.kind,data.title,data.description,data.performed_on,data.reading===""?null:data.reading,
        data.description||data.title,actor.id]);
    await audit(tx,actor,"record_history","work_order",row.id,data);
    return row.id;
  });
}
