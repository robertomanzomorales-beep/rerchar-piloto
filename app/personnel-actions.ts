"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import { createExternalDriver, createRequirement, disableRequirement, PersonnelError, recordCredential, recordExternalCredential, reviewCredential, reviewExternalCredential, saveWorkerProfile } from "@/lib/personnel";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown) {
  if(error instanceof PersonnelError) return error.message;
  if(error instanceof ZodError) return "Revise las fechas, faena, trabajador y requisitos indicados.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505") return "El RUT ya pertenece a un conductor tercero registrado.";
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
  await run(()=>saveWorkerProfile(actor,value(form,"user_id"),{national_id:value(form,"national_id"),position:value(form,"position"),shift:value(form,"shift"),phone:value(form,"phone"),employer:value(form,"employer")}));
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
export async function createExternalDriverAction(form:FormData) {
  const actor=await requireActor();
  await run(()=>createExternalDriver(actor,{name:value(form,"name"),tax_id:value(form,"tax_id"),
    company_name:value(form,"company_name"),phone:value(form,"phone")}));
}
export async function recordExternalCredentialAction(form:FormData) {
  const actor=await requireActor();
  await run(()=>recordExternalCredential(actor,{external_driver_id:value(form,"external_driver_id"),
    requirement_id:value(form,"requirement_id"),reference:value(form,"reference"),
    issued_on:value(form,"issued_on"),expires_on:value(form,"expires_on")}));
}
export async function reviewExternalCredentialAction(form:FormData) {
  const actor=await requireActor();
  await run(()=>reviewExternalCredential(actor,value(form,"credential_id"),
    value(form,"decision") as "verificada"|"rechazada"|"revocada",value(form,"reason")));
}
