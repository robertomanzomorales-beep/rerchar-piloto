"use server";

import {randomUUID} from "node:crypto";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {createUser,PilotError} from "@/lib/pilot";
import {changeUserRole,resetUserPassword,setUserActive,UsersError} from "@/lib/users";
import {userFormContext,userFormFailure,userHref,type UserFormKind,type UserFormState} from "@/lib/user-form-state";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function errorText(error:unknown,kind:UserFormKind){
  if(error instanceof UsersError||error instanceof PilotError)return error.message;
  if(error instanceof ZodError)return kind==="password"?"La contraseña debe tener entre 12 y 128 caracteres.":
    kind==="role"?"Seleccione un perfil válido y, para el portal Cliente, su empresa.":
    kind==="active"?"La cuenta o el estado solicitado no son válidos.":"Revise el nombre, correo, perfil, empresa y contraseña de 12 a 128 caracteres.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505")return "Ya existe una cuenta con este correo.";
  console.error("Gestión de usuarios",error);
  return "No se pudo actualizar la cuenta. Revise los datos e inténtelo de nuevo.";
}
async function run(kind:UserFormKind,form:FormData,operation:()=>Promise<{id:string;self?:boolean}>):Promise<UserFormState>{
  let result:{id:string;self?:boolean};
  try{result=await operation();}catch(error){return userFormFailure(kind,form,errorText(error,kind));}
  revalidatePath("/","layout");
  redirect(result.self?"/ingresar":userHref(userFormContext(form),{kind,id:result.id,ok:true,saved:randomUUID()}));
}
export async function createAccountAction(_previous:UserFormState,form:FormData){
  const actor=await requireActor();
  return run("create",form,async()=>({id:await createUser(actor,{
    name:value(form,"name").trim(),email:value(form,"email").trim().toLowerCase(),role:value(form,"role"),
    client_id:value(form,"client_id"),password:value(form,"password"),
  })}));
}
export async function changeRoleAction(_previous:UserFormState,form:FormData){
  const actor=await requireActor();
  return run("role",form,async()=>{const id=value(form,"id");await changeUserRole(actor,id,{role:value(form,"role"),client_id:value(form,"client_id")});return{id};});
}
export async function setAccountActiveAction(_previous:UserFormState,form:FormData){
  const actor=await requireActor();
  return run("active",form,async()=>{const id=value(form,"id");await setUserActive(actor,id,value(form,"active"));return{id};});
}
export async function resetAccountPasswordAction(_previous:UserFormState,form:FormData){
  const actor=await requireActor();
  return run("password",form,async()=>{const id=value(form,"id");return{id,self:await resetUserPassword(actor,id,value(form,"password"))};});
}
