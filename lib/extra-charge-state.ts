import {isFinanceId} from "./finance-catalog-state";
import {serviceDayContext,type ServiceDayContext} from "./service-day-state";
import {recordPage} from "./record-pagination";
export const extraChargeFields={propose:["submission_key","service_day","kind","reason","amount_clp","quote_reference","client_order_reference"],decide:["id","status","decision_note","amount_clp"],invoice:["id","invoice_number","invoiced_on","due_on","total_clp"]} as const;
export type ExtraChargeFormKind=keyof typeof extraChargeFields;
type Field=(typeof extraChargeFields)[ExtraChargeFormKind][number];
export type ExtraChargeValues=Partial<Record<Field,string>>;
export type ExtraChargeFormState={error:string;values:ExtraChargeValues};
const limits:Record<Field,number>={submission_key:36,service_day:10,kind:20,reason:1000,amount_clp:24,quote_reference:80,client_order_reference:80,id:36,status:15,decision_note:500,invoice_number:80,invoiced_on:10,due_on:10,total_clp:24};
export function extraChargeDraft(kind:ExtraChargeFormKind,form:FormData):ExtraChargeValues{return Object.fromEntries(extraChargeFields[kind].map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,limits[key]):""]));}
export type ExtraChargeContext=ServiceDayContext&{empresa?:string;estado?:string;pagina?:string};
export type ExtraChargeFlags={formulario?:string;ok?:string;error?:string;formulario_cargo?:string;origen_cargo?:string;cargo?:string};
export type ExtraChargeQuery=ExtraChargeContext&ExtraChargeFlags;
export function extraChargeContext(input:ExtraChargeContext):ExtraChargeContext{
  const page=recordPage(input.pagina),servicePage=recordPage(input.pagina_cargos);return {...serviceDayContext(input),empresa:input.empresa==="e_y_j"?"e_y_j":"rerchar",estado:input.estado==="propuestos"||input.estado==="aprobados"?input.estado:"todos",...(page>1?{pagina:String(page)}:{}),...(servicePage>1?{pagina_cargos:String(servicePage)}:{})};
}
export function extraChargeContextFromForm(form:FormData){return extraChargeContext(Object.fromEntries(["empresa","estado","pagina","pagina_cargos","pagina_partes","parte","nuevo_parte"].map(key=>[key,String(form.get(key)??"")])));}
export const extraChargeAnchor=(id="")=>isFinanceId(id)?`cargo-${id}`:"cargos-parte";
function flags(query:URLSearchParams,input:ExtraChargeFlags){
  for(const key of ["formulario_cargo","origen_cargo"] as const)if(input[key]&&Object.hasOwn(extraChargeFields,input[key]!))query.set(key,input[key]!);
  if(isFinanceId(input.cargo))query.set("cargo",input.cargo!);if(input.ok)query.set("ok",input.ok);if(input.error)query.set("error",input.error);
}
export function extraChargeBoardHref(context:ExtraChargeContext,anchor="cargos-parte",input:ExtraChargeFlags={}){
  const {pagina_cargos,pagina_partes,parte,nuevo_parte,...normalized}=extraChargeContext(context);void pagina_cargos;void pagina_partes;void parte;void nuevo_parte;const query=new URLSearchParams(normalized as Record<string,string>);flags(query,input);return `/cobros-extraordinarios?${query}${anchor?"#"+anchor:""}`;
}
export function serviceChargeHref(id:string,context:ExtraChargeContext,anchor="cargos-adicionales",input:ExtraChargeFlags={}){
  if(!isFinanceId(id))return "/solicitudes";const query=new URLSearchParams(),page=recordPage(context.pagina_cargos);for(const [key,value]of Object.entries(serviceDayContext(context)))query.set(key,value);if(page>1)query.set("pagina_cargos",String(page));if(input.formulario==="day")query.set("formulario","day");flags(query,input);return `/solicitudes/${id}${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
}
export const extraChargeStatusNames={propuesto:"Por decidir",aprobado:"Aprobado",descartado:"No cobrar",facturado:"Factura registrada"} as const;
