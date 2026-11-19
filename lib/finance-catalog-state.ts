import {recordPage} from "./record-pagination";

export const financeCatalogFields={
  contract:["client_id","site_id","operating_company","code","starts_on","ends_on","notes"],
  tariff:["contract_id","service_type","waste_type","unit","unit_price_clp","valid_from","valid_until"],
  classify:["id","operating_company"],revise:["tariff_id","unit_price_clp","valid_from","reason"],
  notice:["notice_id","channel","recipient","notified_on","reference"],
} as const;
export type FinanceCatalogKind=keyof typeof financeCatalogFields;
type Field=(typeof financeCatalogFields)[FinanceCatalogKind][number];
export type FinanceCatalogValues=Partial<Record<Field,string>>;
export type FinanceCatalogState={error:string;values:FinanceCatalogValues};
const limits:Record<Field,number>={client_id:36,site_id:36,operating_company:10,code:80,starts_on:10,ends_on:10,notes:1000,contract_id:36,service_type:15,waste_type:120,unit:10,unit_price_clp:24,valid_from:10,valid_until:10,id:36,tariff_id:36,reason:500,notice_id:36,channel:12,recipient:254,notified_on:10,reference:500};
export function financeCatalogDraft(kind:FinanceCatalogKind,form:FormData):FinanceCatalogValues{return Object.fromEntries(financeCatalogFields[kind].map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,limits[key]):""]));}
export const financePageKeys=["pagina","pagina_avisos","pagina_contratos","pagina_tarifas"] as const;
export type FinancePageKey=(typeof financePageKeys)[number];
export type FinanceCatalogContext={empresa?:string;facturacion?:string;oc?:string;avisos?:string}&Partial<Record<FinancePageKey,string>>;
export function financeCatalogContext(input:FinanceCatalogContext):FinanceCatalogContext{
  const result:FinanceCatalogContext={empresa:input.empresa==="e_y_j"||input.empresa==="pendiente"?input.empresa:"rerchar"};
  if(input.facturacion==="pendiente")result.facturacion="pendiente";if(input.oc==="pendiente")result.oc="pendiente";if(input.avisos==="pendientes")result.avisos="pendientes";
  for(const key of financePageKeys){const page=recordPage(input[key]);if(page>1)result[key]=String(page);}return result;
}
export function financeCatalogContextFromForm(form:FormData){return financeCatalogContext(Object.fromEntries(["empresa","facturacion","oc","avisos",...financePageKeys].map(key=>[key,String(form.get(key)??"")])));}
export const isFinanceId=(id?:string)=>!!id&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);
export function financeCatalogAnchor(kind:FinanceCatalogKind,id=""){
  if(isFinanceId(id))return `${kind==="contract"||kind==="classify"?"contrato":kind==="notice"?"aviso":"tarifa"}-${id}`;
  return kind==="contract"?"registrar-contrato":kind==="tariff"?"nueva-tarifa":kind==="notice"?"avisos-tarifa":kind==="classify"?"historial-contratos":"historial-tarifas";
}
export function financeCatalogHref(context:FinanceCatalogContext,anchor="",flags:{ok?:string;error?:string;formulario?:string;origen?:string;edicion?:string}={}){
  const query=new URLSearchParams(financeCatalogContext(context) as Record<string,string>);
  for(const key of ["formulario","origen"] as const)if(flags[key]&&Object.hasOwn(financeCatalogFields,flags[key]!))query.set(key,flags[key]!);
  if(isFinanceId(flags.edicion))query.set("edicion",flags.edicion!);if(flags.ok)query.set("ok",flags.ok);if(flags.error)query.set("error",flags.error);
  return `/finanzas?${query}${anchor?"#"+anchor:""}`;
}
export const financeUnitLabels:Record<string,string>={servicio:"Por servicio",kg:"Por kg neto",dia:"Por día de arriendo"};
export function financeUnits(type:string){return type==="arriendo"?["servicio","dia"]:["servicio","kg"];}
export const financeDay=(date:Date|string)=>date instanceof Date?date.toISOString().slice(0,10):String(date).slice(0,10);
export function followingFinanceDay(date:Date|string){return new Date(Date.parse(financeDay(date))+86400000).toISOString().slice(0,10);}
