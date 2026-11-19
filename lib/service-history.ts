import {z} from "zod";
import type {Actor} from "./auth";
import {canReadService} from "./auth";
import {db} from "./db";
import {recordPage} from "./record-pagination";
export class ServiceHistoryError extends Error {}
export const serviceHistoryPageSize=20;
export type ServiceHistoryEntry={id:string;kind:string;description:string;created_at:Date;actor_name:string|null};
export type ServiceHistoryPage={items:ServiceHistoryEntry[];total:number;page:number;pages:number};
export async function listServiceHistory(actor:Actor,serviceId:string,requestedPage:unknown=1):Promise<ServiceHistoryPage>{
  if(!z.uuid().safeParse(serviceId).success)throw new ServiceHistoryError("Servicio no disponible.");
  const [service]=await db.query<{client_id:string;driver_id:string|null;viewer_role:Actor["role"];viewer_client_id:string|null}>(`SELECT s.client_id,s.driver_id,v.role AS viewer_role,v.client_id AS viewer_client_id
    FROM service_requests s JOIN users v ON v.id=$2 AND v.active=true WHERE s.id=$1 AND s.deleted_at IS NULL`,[serviceId,actor.id]);
  if(!service||!canReadService({...actor,role:service.viewer_role,client_id:service.viewer_client_id},service))throw new ServiceHistoryError("Servicio no disponible.");
  const [count]=await db.query<{total:string}>("SELECT count(*)::text AS total FROM service_events WHERE service_id=$1",[serviceId]),total=Number(count.total),pages=Math.max(1,Math.ceil(total/serviceHistoryPageSize)),page=Math.min(recordPage(requestedPage),pages);
  const items=await db.query<ServiceHistoryEntry>(`SELECT e.id,e.description,e.kind,e.created_at,u.name AS actor_name FROM service_events e
    LEFT JOIN users u ON u.id=e.actor_id WHERE e.service_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT $2 OFFSET $3`,[serviceId,serviceHistoryPageSize,(page-1)*serviceHistoryPageSize]);
  return {items,total,page,pages};
}
const labels:Record<string,string>={solicitud_creada:"Solicitud",empresa_asignada:"Empresa validada",planificacion:"Planificación",checklist:"Checklist",checklist_invalidado:"Checklist por actualizar",averia_reportada:"Avería informada",ruta_iniciada:"Inicio de ruta",documentacion_entregada:"Entrega a revisión",servicio_cerrado:"Cierre de servicio",evidencia:"Documento adjuntado",cancelacion:"Cancelación",arriendo_programado:"Programación de arriendo",arriendo_cerrado:"Cierre de arriendo",guia_control:"Control de guía"};
export const serviceHistoryLabel=(kind:string)=>labels[kind]??kind.replaceAll("_"," ").replace(/^./,character=>character.toUpperCase());
