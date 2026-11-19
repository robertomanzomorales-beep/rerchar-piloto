import {recordPage} from "./record-pagination";

export const masterFields={client:["name","tax_id","contact_name","email","address"],site:["client_id","name","address"],asset:["code","kind","plate","label"],edit_client:["id","name","tax_id","contact_name","email","address"],edit_site:["id","name","address"],edit_asset:["id","plate","label"]} as const;
export type MasterFormKind=keyof typeof masterFields;
type Field=(typeof masterFields)[MasterFormKind][number];
export type MasterValues=Partial<Record<Field,string>>;
export type MasterFormState={error:string;values:MasterValues};
const limits:Record<Field,number>={id:36,client_id:36,name:180,tax_id:20,contact_name:120,email:254,address:250,code:30,kind:10,plate:15,label:120};
export function masterDraft(kind:MasterFormKind,form:FormData):MasterValues{return Object.fromEntries(masterFields[kind].map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).slice(0,limits[key]):""]));}
export const masterPageKeys=["pagina_clientes","pagina_centros","pagina_activos"] as const;
export type MasterPageKey=(typeof masterPageKeys)[number];
export type MasterContext={empresa?:string;q?:string}&Partial<Record<MasterPageKey,string>>;
export function masterContext(input:MasterContext):MasterContext{
  const result:MasterContext={};if(input.empresa==="rerchar"||input.empresa==="e_y_j")result.empresa=input.empresa;
  const q=input.q?.trim().slice(0,160);if(q)result.q=q;
  for(const key of masterPageKeys){const page=recordPage(input[key]);if(page>1)result[key]=String(page);}return result;
}
export function masterContextFromForm(form:FormData){return masterContext(Object.fromEntries(["empresa","q",...masterPageKeys].map(key=>[key,String(form.get(key)??"")])));}
const uuid=(value:string)=>/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export function masterAnchor(kind:MasterFormKind,id=""){return kind.startsWith("edit_")&&uuid(id)?`${kind.slice(5)}-${id}`:kind==="client"?"clientes":kind==="site"?"centros":"activos";}
export function masterHref(context:MasterContext,anchor="",flags:{formulario?:string;edicion?:string;ok?:string;error?:string}={}){
  const query=new URLSearchParams(masterContext(context) as Record<string,string>);
  if(flags.formulario&&Object.hasOwn(masterFields,flags.formulario))query.set("formulario",flags.formulario);
  if(flags.edicion&&uuid(flags.edicion))query.set("edicion",flags.edicion);
  if(flags.ok)query.set("ok",flags.ok);if(flags.error)query.set("error",flags.error);
  return `/maestros${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
}
export function matchesMaster(query:string|undefined,values:(string|null|undefined)[]){
  const fold=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es-CL");
  return !query||fold(values.filter(Boolean).join(" ")).includes(fold(query));
}
