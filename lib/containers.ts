import { z } from "zod";
import type { Actor } from "./auth";
import { canManage } from "./auth";
import { db,transaction } from "./db";

const uuid=z.uuid();
const optionalId=z.union([uuid,z.literal("")]).default("");
const optional=(max=160)=>z.string().trim().max(max).optional().default("");
export class ContainerError extends Error {}
function reject(message:string):never { throw new ContainerError(message); }
function guard(actor:Actor) { if (!canManage(actor)) reject("Sólo operaciones puede administrar contenedores."); }

export type ContainerRow={ id:string;code:string;kind:string;capacity_m3:string;status:string;client_id:string|null;site_id:string|null;
  client_name:string|null;site_name:string|null;location_name:string;waste_type:string|null;installed_at:Date|null;
  max_stay_days:number;stay_days:number;created_at:Date };
export type ContainerMovement={id:string;container_id:string;code:string;kind:string;previous_status:string|null;previous_location:string|null;
  previous_waste_type:string|null;next_status:string;next_location:string;next_waste_type:string|null;service_id:string|null;service_folio:string|null;
  note:string;actor_name:string;created_at:Date};

export async function listContainers(actor:Actor) {
  guard(actor);
  const [containers,sites,services,movements]=await Promise.all([
    db.query<ContainerRow>(`SELECT c.*,cl.name AS client_name,cs.name AS site_name,
      CASE WHEN c.installed_at IS NOT NULL THEN GREATEST(0,(now() AT TIME ZONE 'America/Santiago')::date-(c.installed_at AT TIME ZONE 'America/Santiago')::date)::int ELSE 0 END AS stay_days
      FROM containers c LEFT JOIN clients cl ON cl.id=c.client_id LEFT JOIN client_sites cs ON cs.id=c.site_id
      ORDER BY CASE WHEN c.status='instalada' THEN 0 ELSE 1 END,c.updated_at DESC LIMIT 400`),
    db.query<{id:string;client_id:string;client_name:string;name:string}>(`SELECT cs.id,cs.client_id,c.name AS client_name,cs.name FROM client_sites cs JOIN clients c ON c.id=cs.client_id
      WHERE cs.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.name,cs.name`),
    db.query<{id:string;folio:string;site_id:string;client_id:string}>(`SELECT id,folio,site_id,client_id FROM service_requests
      WHERE deleted_at IS NULL AND status IN ('solicitada','programada','en_ruta','completada') ORDER BY created_at DESC LIMIT 150`),
    db.query<ContainerMovement>(`SELECT m.*,c.code,s.folio AS service_folio,u.name AS actor_name FROM container_movements m
      JOIN containers c ON c.id=m.container_id LEFT JOIN service_requests s ON s.id=m.service_id JOIN users u ON u.id=m.actor_id
      ORDER BY m.created_at DESC,m.id DESC LIMIT 250`),
  ]);
  return {containers,sites,services,movements};
}

export async function createContainer(actor:Actor,input:unknown) {
  guard(actor);
  const data=z.object({code:z.string().trim().min(2).max(45),kind:z.enum(["tolva","ampliroll","contenedor"]),
    capacity_m3:z.coerce.number().finite().positive().max(10000),location_name:z.string().trim().min(2).max(180),
    max_stay_days:z.coerce.number().int().min(1).max(3650)}).parse(input);
  return transaction(async(tx)=>{
    const [created]=await tx.query<{id:string}>(`INSERT INTO containers (code,kind,capacity_m3,location_name,max_stay_days,created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,[data.code.toUpperCase(),data.kind,data.capacity_m3,data.location_name,data.max_stay_days,actor.id]);
    await tx.query(`INSERT INTO container_movements (container_id,kind,next_status,next_location,note,actor_id)
      VALUES ($1,'alta','patio',$2,'Unidad registrada en patio',$3)`,[created.id,data.location_name,actor.id]);
    await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'create','container',$2,$3)",
      [actor.id,created.id,JSON.stringify(data)]);
    return created.id;
  });
}

export async function moveContainer(actor:Actor,containerId:string,input:unknown) {
  guard(actor);
  const id=uuid.parse(containerId);
  const data=z.object({action:z.enum(["instalar","retirar","reubicar","traslado","fuera_servicio","reactivar"]),
    site_id:optionalId,service_id:optionalId,location_name:optional(180),waste_type:optional(120),
    note:z.string().trim().min(5).max(500)}).parse(input);
  await transaction(async(tx)=>{
    const [current]=await tx.query<{status:string;site_id:string|null;client_id:string|null;location_name:string;waste_type:string|null}>(
      "SELECT status,site_id,client_id,location_name,waste_type FROM containers WHERE id=$1 FOR UPDATE",[id]);
    if (!current) reject("La unidad no existe.");
    let nextStatus:string;
    let nextLocation:string;
    let nextWaste:string|null=null;
    let siteId:string|null=null;
    let clientId:string|null=null;
    let eventKind:string;
    if (data.action==="instalar" || data.action==="reubicar") {
      if (!data.site_id || !data.waste_type) reject("Seleccione una faena y describa el contenido o residuo.");
      if (data.action==="instalar" && !["patio","en_transito"].includes(current.status)) reject("La unidad debe estar en patio o tránsito antes de instalarse.");
      if (data.action==="reubicar" && (current.status!=="instalada" || current.site_id===data.site_id)) reject("Seleccione una faena distinta para reubicar una unidad instalada.");
      const [site]=await tx.query<{client_id:string;client_name:string;name:string}>(`SELECT cs.client_id,c.name AS client_name,cs.name FROM client_sites cs
        JOIN clients c ON c.id=cs.client_id WHERE cs.id=$1 AND cs.deleted_at IS NULL AND c.deleted_at IS NULL`,[data.site_id]);
      if (!site) reject("Faena o cliente inexistente.");
      nextStatus="instalada";
      nextLocation=`${site.client_name} · ${site.name}`;
      siteId=data.site_id;
      clientId=site.client_id;
      nextWaste=data.waste_type;
      eventKind=data.action==="instalar"?"instalacion":"reubicacion";
    } else {
      if (data.site_id) reject("Una unidad fuera de faena no puede mantener una ubicación de cliente.");
      if (data.action==="retirar" && current.status!=="instalada") reject("Sólo puede retirar una unidad instalada.");
      if (data.action==="traslado" && !["patio","instalada"].includes(current.status)) reject("Sólo puede trasladar una unidad desde patio o faena.");
      if (data.action==="fuera_servicio" && !["patio","en_transito"].includes(current.status)) reject("Retire la unidad de la faena antes de dejarla fuera de servicio.");
      if (data.action==="reactivar" && current.status!=="fuera_servicio") reject("Sólo puede reactivar una unidad fuera de servicio.");
      if (!data.location_name || data.location_name.length<2) reject("Indique patio, ubicación de tránsito o taller.");
      nextStatus=data.action==="retirar" || data.action==="reactivar"?"patio":data.action==="traslado"?"en_transito":"fuera_servicio";
      nextLocation=data.location_name;
      eventKind=data.action==="reactivar"?"reactivacion":data.action==="retirar"?"retiro":data.action;
    }
    if (data.service_id) {
      const [service]=await tx.query<{client_id:string;site_id:string}>("SELECT client_id,site_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL",[data.service_id]);
      if (!service) reject("Servicio no encontrado.");
      const relevantSite=siteId??current.site_id;
      const relevantClient=clientId??current.client_id;
      if (!relevantSite || service.site_id!==relevantSite || service.client_id!==relevantClient) reject("El servicio seleccionado no pertenece a la faena de este movimiento.");
    }
    await tx.query(`UPDATE containers SET status=$2,client_id=$3,site_id=$4,location_name=$5,waste_type=$6,
      installed_at=CASE WHEN $2='instalada' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1`,
      [id,nextStatus,clientId,siteId,nextLocation,nextWaste]);
    const [movement]=await tx.query<{id:string}>(`INSERT INTO container_movements
      (container_id,kind,previous_status,previous_location,previous_waste_type,next_status,next_location,next_waste_type,service_id,note,actor_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,'')::uuid,$10,$11) RETURNING id`,
      [id,eventKind,current.status,current.location_name,current.waste_type,nextStatus,nextLocation,nextWaste,data.service_id,data.note,actor.id]);
    await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,$2,'container',$3,$4,$5)",
      [actor.id,eventKind,id,JSON.stringify(current),JSON.stringify({status:nextStatus,client_id:clientId,site_id:siteId,location_name:nextLocation,waste_type:nextWaste,movement_id:movement.id})]);
  });
}
