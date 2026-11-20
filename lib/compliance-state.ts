import {z} from "zod";
import {recordPage} from "./record-pagination";
export const complianceFields={save:["service_id","category","classification","generator_name","transporter_name","receiver_name","treatment","guide_number"],review:[],observe:["reason"],declare:["external_reference","reported_on"]} as const;
export type ComplianceKind=keyof typeof complianceFields;
export type ComplianceFormState={error:string;values:Record<string,string>};
export type ComplianceContext={empresa?:string;client_id?:string;pagina?:string};
export const complianceId=(value:unknown)=>typeof value==="string"&&z.uuid().safeParse(value).success?value.toLowerCase():"";
export const complianceDay=(value:Date|string|null|undefined)=>value?(value instanceof Date?value.toISOString():String(value)).slice(0,10):"";
export const wasteStatusNames:Record<string,string>={borrador:"Borrador",revisado:"Revisado",declarado:"Declaración registrada",observado:"Observado"};
export function complianceDraft(kind:ComplianceKind,form:FormData){return Object.fromEntries(complianceFields[kind].map(field=>[field,String(form.get(field)??"").replace(/\r\n?/g,"\n").slice(0,field==="reason"?500:field==="classification"||field==="external_reference"?120:field==="reported_on"?10:field==="guide_number"?80:field==="service_id"?36:160)]));}
export function complianceContext(input:ComplianceContext):ComplianceContext{const out:ComplianceContext={};if(["rerchar","e_y_j","pendiente"].includes(input.empresa??""))out.empresa=input.empresa;const id=complianceId(input.client_id);if(id)out.client_id=id;const page=recordPage(input.pagina);if(page>1)out.pagina=String(page);return out;}
export function complianceFormContext(form:FormData){return complianceContext(Object.fromEntries(["empresa","client_id","pagina"].map(key=>[key,String(form.get(key)??"")])));}
export function complianceHref(context:ComplianceContext={},id="",kind?:ComplianceKind,saved=""){
  const query=new URLSearchParams(complianceContext(context) as Record<string,string>),record=complianceId(id);
  if(kind)query.set("formulario",kind);if(complianceId(saved)){query.set("ok","1");query.set("guardado",saved);}
  return `/cumplimiento${record?"/"+record:""}${query.size?"?"+query:""}${kind?"#ambiental-"+kind:""}`;
}
