"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import { createRequirement, disableRequirement, PersonnelError, recordCredential, reviewCredential, saveWorkerProfile } from "@/lib/personnel";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown) {
  if(error instanceof PersonnelError) return error.message;
  if(error instanceof ZodError) return "Revise las fechas, faena, trabajador y requisitos indicados.";
  console.error("Error en personal",error);
  return "No fue posible registrar este cambio de acreditación.";
}
async function run(operation:()=>Promise<unknown>):Promise<never> {
  try{await operation();}catch(error){redirect(`/personal?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");
  redirect("/personal?ok=1");
}
export async function saveWorkerProfileAction(form:FormData) {
  const actor=await requireActor();
  await run(()=>saveWorkerProfile(actor,value(form,"user_id"),{national_id:value(form,"national_id"),position:value(form,"position"),shift:value(form,"shift"),phone:value(form,"phone")}));
}
export async function createRequirementAction(form:FormData) {
  const actor=await requireActor();
  await run(()=>createRequirement(actor,{client_id:value(form,"client_id"),site_id:value(form,"site_id"),name:value(form,"name"),kind:value(form,"kind"),warning_days:value(form,"warning_days")}));
}
export async function disableRequirementAction(form:FormData) {
  const actor=await requireActor();
  await run(()=>disableRequirement(actor,value(form,"requirement_id"),value(form,"reason")));
}
export async function recordCredentialAction(form:FormData) {
  const actor=await requireActor();
  await run(()=>recordCredential(actor,{user_id:value(form,"user_id"),requirement_id:value(form,"requirement_id"),reference:value(form,"reference"),issued_on:value(form,"issued_on"),expires_on:value(form,"expires_on")}));
}
export async function reviewCredentialAction(form:FormData) {
  const actor=await requireActor();
  await run(()=>reviewCredential(actor,value(form,"credential_id"),value(form,"decision") as "verificada"|"rechazada"|"revocada",value(form,"reason")));
}
