import {recordPage} from "./record-pagination";

export const personnelFields={profile:["user_id","national_id","position","shift","phone","employer"],
  requirement:["client_id","site_id","name","kind","warning_days"],external_driver:["name","tax_id","company_name","phone"],
  credential:["user_id","requirement_id","reference","issued_on","expires_on"],external_credential:["external_driver_id","requirement_id","reference","issued_on","expires_on"],
  review:["reason"],external_review:["reason"],disable:["reason"]} as const;
export type PersonnelFormKind=keyof typeof personnelFields;
type Field=(typeof personnelFields)[PersonnelFormKind][number];
export type PersonnelValues=Partial<Record<Field,string>>;
export type PersonnelFormState={error:string;values:PersonnelValues};
const limits:Record<Field,number>={user_id:36,national_id:20,position:120,shift:80,phone:40,employer:20,client_id:36,site_id:36,name:150,kind:20,warning_days:10,
  tax_id:20,company_name:160,external_driver_id:36,requirement_id:36,reference:160,issued_on:10,expires_on:10,reason:500};
export function personnelDraft(kind:PersonnelFormKind,form:FormData):PersonnelValues{
  return Object.fromEntries(personnelFields[kind].map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).slice(0,limits[key]):""]));
}
export const personnelPageKeys=["pagina_documentos","pagina_terceros","pagina_habilitacion","pagina_habilitacion_terceros"] as const;
export type PersonnelPageKey=(typeof personnelPageKeys)[number];
const contextKeys=["empresa","vigencia",...personnelPageKeys] as const;
export type PersonnelContext=Partial<Record<(typeof contextKeys)[number],string>>;
export function personnelContext(input:PersonnelContext):PersonnelContext{
  const result:PersonnelContext={};
  if(input.empresa==="rerchar"||input.empresa==="e_y_j")result.empresa=input.empresa;
  if(input.vigencia==="vencidas"||input.vigencia==="proximas")result.vigencia=input.vigencia;
  for(const key of personnelPageKeys){const page=recordPage(input[key]);if(page>1)result[key]=String(page);}
  return result;
}
export function personnelContextFromForm(form:FormData){return personnelContext(Object.fromEntries(contextKeys.map(key=>[key,String(form.get(key)??"")])));}
const anchors={profile:"fichas-personal",requirement:"requisitos-personal",external_driver:"conductores-terceros",credential:"registro-propio",external_credential:"registro-tercero",review:"documentos-propios",external_review:"documentos-terceros",disable:"requisitos-personal"};
export function personnelAnchor(kind:PersonnelFormKind,id="",detail=false){
  if(detail&&id){if(kind==="review"||kind==="external_review")return `documento-${kind==="review"?"propio":"tercero"}-${id}`;if(kind==="disable")return `requisito-${id}`;}
  return anchors[kind];
}
export function personnelHref(context:PersonnelContext,anchor="",flags:{ok?:string;error?:string;edicion?:string;accion?:string;origen?:string}={}){
  const query=new URLSearchParams(personnelContext(context) as Record<string,string>);
  for(const [key,value]of Object.entries(flags))if(value)query.set(key,value);
  return `/personal${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
}
