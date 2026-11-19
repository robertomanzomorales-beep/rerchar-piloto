import {isFinanceId} from "./finance-catalog-state";
import {serviceDayContext,type ServiceDayContext} from "./service-day-state";

export type ServiceDriverKind="account"|"external";
export type ServiceDriverValues=Partial<Record<"name"|"email"|"tax_id"|"company_name"|"phone",string>>;
export type ServiceDriverState={error:string;values:ServiceDriverValues};
export const serviceDriverAnchor=(kind:ServiceDriverKind)=>kind==="account"?"conductor-cuenta":"conductor-tercero";
export function serviceDriverDraft(kind:ServiceDriverKind,form:FormData):ServiceDriverValues{
  const limits=kind==="account"?{name:120,email:254}:{name:120,tax_id:20,company_name:160,phone:40};
  // La contraseña nunca forma parte del estado devuelto al navegador.
  return Object.fromEntries(Object.entries(limits).map(([key,max])=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,max):""]));
}
export function serviceDriverHref(id:string,kind:ServiceDriverKind,context:ServiceDayContext={},created?:string){
  if(!isFinanceId(id))return "/solicitudes";
  const query=new URLSearchParams(serviceDayContext(context) as Record<string,string>);
  query.set("formulario",`driver_${kind}`);
  const registered=created&&isFinanceId(created)?created:"";
  if(registered){query.set("ok","1");query.set("conductor_creado",`${kind}:${registered}`);}
  return `/solicitudes/${id}?${query}#${registered?"planificacion":serviceDriverAnchor(kind)}`;
}
