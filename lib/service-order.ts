import type {Actor} from "./auth";
import {db} from "./db";
import {getService,PilotError,type ServiceRow} from "./pilot";
export type ServiceOrderChecklist={vehicle_ok:boolean;documents_ok:boolean;containment_ok:boolean;ppe_ok:boolean;comment:string|null;completed_at:Date;completed_name:string|null};
export type ServiceOrderMaterial={position:number;material_name:string;quantity_kg:string|null;line_note:string|null};
export async function getServiceOrder(actor:Actor,id:string){
  const [viewer]=await db.query<Actor>("SELECT id,name,email,role,client_id FROM users WHERE id=$1 AND active=true",[actor.id]);if(!viewer)throw new PilotError("Servicio no encontrado o sin acceso.");
  const service=await getService(viewer,id);
  const [checks,materials]=await Promise.all([
    service.service_type==="arriendo"?Promise.resolve([]):db.query<ServiceOrderChecklist>(`SELECT c.vehicle_ok,c.documents_ok,c.containment_ok,c.ppe_ok,c.comment,c.completed_at,u.name AS completed_name
      FROM service_checklists c LEFT JOIN users u ON u.id=c.completed_by WHERE c.service_id=$1`,[id]),
    service.request_category==="compra"?db.query<ServiceOrderMaterial>("SELECT position,material_name,quantity_kg,line_note FROM service_request_materials WHERE service_id=$1 ORDER BY position",[id]):Promise.resolve([]),
  ]);
  return {service,check:checks[0],materials};
}
function measured(value:string|number|null|undefined){if(value===null||value===undefined||String(value).trim()==="")return null;const result=Number(value);return Number.isFinite(result)&&result>=0?result:null;}
export function serviceOrderWeight(value:string|number|null|undefined,precision:2|3=2){const number=measured(value);return number===null?"Sin registro":`${number.toLocaleString("es-CL",{maximumFractionDigits:precision})} kg`;}
export function serviceOrderNet(gross:string|number|null,tare:string|number|null){const g=measured(gross),t=measured(tare);if(g===null||t===null)return "Sin registro";if(g<t)return "Revisar pesaje";return serviceOrderWeight(Math.round((g-t)*100)/100);}
export function serviceOrderState(service:Pick<ServiceRow,"operating_company"|"status"|"service_type"|"scheduled_for"|"assigned_asset_id"|"driver_id"|"external_driver_id"|"rental_from"|"rental_to">){
  if(service.status==="cancelada")return {title:"ORDEN CANCELADA",notice:"Servicio cancelado. Documento conservado para consulta del historial.",draft:false};
  if(!service.operating_company)return {title:"BORRADOR DE ORDEN",notice:"Empresa operadora por confirmar. Esta vista conserva los datos para revisión.",draft:true};
  if(service.status==="completada")return {title:service.service_type==="arriendo"?"ORDEN DE ARRIENDO":"ORDEN DE SERVICIO",notice:"",draft:false};
  const rental=service.service_type==="arriendo",planned=service.status!=="solicitada"&&(rental?Boolean(service.rental_from&&service.rental_to):Boolean(service.scheduled_for&&service.assigned_asset_id&&(service.driver_id||service.external_driver_id)));
  if(!planned)return {title:"BORRADOR DE ORDEN",notice:rental?"Programación de arriendo pendiente de confirmar.":"Programación o recursos de despacho pendientes de confirmar.",draft:true};
  return {title:rental?"ORDEN DE ARRIENDO":"ORDEN DE SERVICIO",notice:"",draft:false};
}
