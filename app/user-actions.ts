"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {createUser,PilotError} from "@/lib/pilot";
import {changeUserRole,resetUserPassword,setUserActive,UsersError} from "@/lib/users";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function errorText(error:unknown){
  if(error instanceof UsersError||error instanceof PilotError)return error.message;
  if(error instanceof ZodError)return "Revise correo, perfil, cliente y contraseña; la clave debe tener al menos doce caracteres.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505")return "Ya existe una cuenta con este correo.";
  console.error("Gestión de usuarios",error);
  return "No se pudo actualizar la cuenta. Revise los datos e inténtelo de nuevo.";
}
async function run(operation:()=>Promise<unknown>):Promise<never>{
  try{await operation();}catch(error){redirect(`/usuarios?error=${encodeURIComponent(errorText(error))}`);}
  revalidatePath("/","layout");
  redirect("/usuarios?ok=1");
}

export async function createAccountAction(form:FormData){
  const actor=await requireActor();
  await run(()=>createUser(actor,{
    name:value(form,"name"),email:value(form,"email"),role:value(form,"role"),
    client_id:value(form,"client_id"),password:value(form,"password"),
  }));
}
export async function changeRoleAction(form:FormData){
  const actor=await requireActor();
  await run(()=>changeUserRole(actor,value(form,"id"),{
    role:value(form,"role"),client_id:value(form,"client_id"),
  }));
}
export async function setAccountActiveAction(form:FormData){
  const actor=await requireActor();
  await run(()=>setUserActive(actor,value(form,"id"),value(form,"active")));
}
export async function resetAccountPasswordAction(form:FormData){
  const actor=await requireActor();
  let self:boolean;
  try{self=await resetUserPassword(actor,value(form,"id"),value(form,"password"));}
  catch(error){redirect(`/usuarios?error=${encodeURIComponent(errorText(error))}`);}
  revalidatePath("/","layout");
  redirect(self?"/ingresar":"/usuarios?ok=1");
}
