import {recordPage} from "./record-pagination";

export const userRoles=["admin","operaciones","conductor","cliente"] as const;
export type UserFormKind="create"|"role"|"active"|"password";
export type UserContext={buscar:string;perfil:string;estado:string;pagina:number};
export type UserFormState={error:string;values:Record<string,string>};
export const emptyUserFormState:UserFormState={error:"",values:{}};
export const userId=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value.toLowerCase():"";
export function userContext(input:Record<string,unknown>):UserContext{
  return {buscar:typeof input.buscar==="string"?input.buscar.trim().slice(0,160):"",
    perfil:userRoles.includes(input.perfil as typeof userRoles[number])?String(input.perfil):"",
    estado:["activas","suspendidas","bloqueadas"].includes(String(input.estado))?String(input.estado):"",pagina:recordPage(input.pagina)};
}
export function userFormContext(form:FormData){return userContext(Object.fromEntries(["buscar","perfil","estado","pagina"].map(key=>[key,form.get(key)])));}
export function userFormFailure(kind:UserFormKind,form:FormData,error:string):UserFormState{
  const fields=kind==="create"?["name","email","role","client_id"]:kind==="role"?["id","role","client_id"]:["id"];
  return {error,values:Object.fromEntries(fields.map(key=>[key,String(form.get(key)??"")]))};
}
export function userHref(context:UserContext,options:{kind?:UserFormKind;id?:string;ok?:boolean;saved?:string}={}){
  const query=new URLSearchParams();
  if(context.buscar)query.set("buscar",context.buscar);
  if(context.perfil)query.set("perfil",context.perfil);
  if(context.estado)query.set("estado",context.estado);
  if(context.pagina>1)query.set("pagina",String(context.pagina));
  if(options.kind)query.set("formulario",options.kind);
  const id=userId(options.id),saved=userId(options.saved);
  if(id)query.set("usuario",id);
  if(options.ok)query.set("ok","1");
  if(saved)query.set("guardado",saved);
  return `/usuarios${query.size?`?${query}`:""}${id?`#cuenta-${id}`:options.kind==="create"?"#crear-cuenta":""}`;
}
