import {isFinanceId} from "./finance-catalog-state";
import {recordPage} from "./record-pagination";
export type ServiceDayContext={pagina_partes?:string;pagina_cargos?:string;parte?:string;nuevo_parte?:string};
export type ServiceDayQuery=ServiceDayContext&{formulario?:string;formulario_cargo?:string};
export function serviceDayDate(value:unknown):value is string{return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export const serviceDayAnchor=(day:unknown)=>serviceDayDate(day)?`parte-${day}`:"parte-diario";
export function serviceDayContext(input:ServiceDayContext):ServiceDayContext{
  const page=recordPage(input.pagina_partes),charges=recordPage(input.pagina_cargos);return {...(page>1?{pagina_partes:String(page)}:{}),...(charges>1?{pagina_cargos:String(charges)}:{}),...(serviceDayDate(input.parte)?{parte:input.parte}:{}),...(input.nuevo_parte==="1"?{nuevo_parte:"1"}:{})};
}
export function serviceDayContextFromForm(form:FormData){return serviceDayContext(Object.fromEntries(["pagina_partes","pagina_cargos","parte","nuevo_parte"].map(key=>[key,String(form.get(key)??"")])));}
export function serviceDayHref(id:string,context:ServiceDayContext={},anchor="parte-diario",flags:{ok?:string;formulario?:string}={}){
  if(!isFinanceId(id))return "/solicitudes";const query=new URLSearchParams(serviceDayContext(context) as Record<string,string>);if(flags.ok)query.set("ok",flags.ok);if(flags.formulario==="day")query.set("formulario","day");return `/solicitudes/${id}${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
}
