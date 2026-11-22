import {agendaPeriod} from "./agenda-dates";
import {recordPage} from "./record-pagination";

const fields={asset_id:36,day:10,kind:24,detail:1000} as const;
export type FleetDayValues=Partial<Record<keyof typeof fields,string>>;
export type FleetDayFormState={error:string;values:FleetDayValues};
export type FleetDayContext={inicio?:string;empresa?:string;partes?:string;pagina?:string};

export function fleetDayDraft(form:FormData):FleetDayValues{
  return Object.fromEntries(Object.entries(fields).map(([name,limit])=>[name,
    typeof form.get(name)==="string"?String(form.get(name)).replace(/\r\n?/g,"\n").slice(0,limit):""]));
}
export function fleetDayContext(input:FleetDayContext){
  return {inicio:agendaPeriod({inicio:input.inicio}).reference,
    empresa:input.empresa==="rerchar"||input.empresa==="e_y_j"?input.empresa:"",
    ...(input.partes==="pendientes"?{partes:"pendientes",pagina:String(recordPage(input.pagina))}:{})};
}
export function fleetDayContextFromForm(form:FormData){
  return fleetDayContext(Object.fromEntries(["inicio","empresa","partes","pagina"].map(name=>[name,
    typeof form.get(name)==="string"?String(form.get(name)):""])));
}
export function fleetDayHref(context:FleetDayContext,saved?:string){
  return `/agenda?${new URLSearchParams({...fleetDayContext(context),...(saved?{ok:saved}:{})})}#${saved?"planilla-semanal":"novedad-agenda"}`;
}
