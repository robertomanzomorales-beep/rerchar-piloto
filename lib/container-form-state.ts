import {recordPage} from "./record-pagination";

export const containerFields={
  create:["code","kind","capacity_m3","location_name","max_stay_days"],
  move:["container_id","action","site_id","service_id","location_name","waste_type","note","photo_retry","omit_photo"],
  record:["container_id","service_id","kind","record_date","kilometers","description","cost_clp","mark_out_of_service","workshop_location"],
} as const;
export type ContainerFormKind=keyof typeof containerFields;
type Field=(typeof containerFields)[ContainerFormKind][number];
export type ContainerValues=Partial<Record<Field,string>>;
export type ContainerFormState={error:string;values:ContainerValues;photoName?:string};
const limits:Record<Field,number>={code:45,kind:20,capacity_m3:24,location_name:180,max_stay_days:10,container_id:36,action:20,site_id:36,service_id:36,waste_type:120,note:500,photo_retry:3,omit_photo:3,record_date:10,kilometers:24,description:500,cost_clp:24,mark_out_of_service:3,workshop_location:180};
export function containerDraft(kind:ContainerFormKind,form:FormData):ContainerValues{
  return Object.fromEntries(containerFields[kind].map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,limits[key]):""]));
}
export const containerPageKeys=["pagina","pagina_movimientos","pagina_registros"] as const;
export type ContainerPageKey=(typeof containerPageKeys)[number];
const contextKeys=["empresa","unidad",...containerPageKeys] as const;
export type ContainerContext=Partial<Record<(typeof contextKeys)[number],string>>;
export const validContainerId=(id?:string)=>!!id&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);
export function containerContext(input:ContainerContext):ContainerContext{
  const result:ContainerContext={};
  if(input.empresa==="rerchar"||input.empresa==="e_y_j")result.empresa=input.empresa;
  if(validContainerId(input.unidad))result.unidad=input.unidad!.toLowerCase();
  for(const key of containerPageKeys){const page=recordPage(input[key]);if(page>1)result[key]=String(page);}
  return result;
}
export function containerContextFromForm(form:FormData){return containerContext(Object.fromEntries(contextKeys.map(key=>[key,String(form.get(key)??"")])));}
export const containerAnchors:Record<ContainerFormKind,string>={create:"nueva-unidad",move:"movimiento-unidad",record:"registro-unidad"};
export function containerHref(context:ContainerContext,anchor="",flags:{ok?:string;error?:string}={}){
  const query=new URLSearchParams(containerContext(context) as Record<string,string>);
  for(const [key,value]of Object.entries(flags))if(value)query.set(key,value);
  return `/contenedores${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
}
export const containerStatuses:Record<string,string>={patio:"En patio",instalada:"Instalada",en_transito:"En tránsito",fuera_servicio:"Fuera de servicio"};
export const containerActionLabels:Record<string,string>={instalar:"Instalar en faena",retirar:"Retirar a patio",reubicar:"Reubicar en otra faena",traslado:"Enviar en tránsito",fuera_servicio:"Dejar fuera de servicio",reactivar:"Reactivar en patio"};
export function containerActions(status?:string):string[]{
  return status==="patio"?["instalar","traslado","fuera_servicio"]:status==="instalada"?["retirar","reubicar","traslado"]:status==="en_transito"?["instalar","fuera_servicio"]:status==="fuera_servicio"?["reactivar"]:[];
}
