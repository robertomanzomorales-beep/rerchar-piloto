"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import { createExternalDriver, createRequirement, disableRequirement, PersonnelError, recordCredential, recordExternalCredential, reviewCredential, reviewExternalCredential, saveWorkerProfile } from "@/lib/personnel";
import {personnelAnchor,personnelContextFromForm,personnelDraft,personnelHref,type PersonnelFormKind,type PersonnelFormState} from "@/lib/personnel-form-state";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown) {
  if(error instanceof PersonnelError) return error.message;
  if(error instanceof ZodError) return "Revise las fechas, faena, trabajador y requisitos indicados.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505") return "El RUT ya pertenece a un conductor tercero registrado.";
  console.error("Error en personal",error);
  return "No fue posible registrar este cambio de acreditación.";
}
async function run(kind:PersonnelFormKind,form:FormData,operation:()=>Promise<unknown>):Promise<PersonnelFormState> {
  try{await operation();}catch(error){return {error:message(error),values:personnelDraft(kind,form)};}
  revalidatePath("/","layout");
  redirect(personnelHref(personnelContextFromForm(form),personnelAnchor(kind),{ok:"1"}));
}
export async function saveWorkerProfileAction(_previous:PersonnelFormState,form:FormData):Promise<PersonnelFormState> {
  const actor=await requireActor();
  return run("profile",form,()=>saveWorkerProfile(actor,value(form,"user_id"),{national_id:value(form,"national_id"),position:value(form,"position"),shift:value(form,"shift"),phone:value(form,"phone"),employer:value(form,"employer")}));
}
export async function createRequirementAction(_previous:PersonnelFormState,form:FormData):Promise<PersonnelFormState> {
  const actor=await requireActor();
  return run("requirement",form,()=>createRequirement(actor,{client_id:value(form,"client_id"),site_id:value(form,"site_id"),name:value(form,"name"),kind:value(form,"kind"),warning_days:value(form,"warning_days")}));
}
export async function disableRequirementAction(_previous:PersonnelFormState,form:FormData):Promise<PersonnelFormState> {
  const actor=await requireActor();
  return run("disable",form,()=>disableRequirement(actor,value(form,"requirement_id"),value(form,"reason")));
}
export async function recordCredentialAction(_previous:PersonnelFormState,form:FormData):Promise<PersonnelFormState> {
  const actor=await requireActor();
  return run("credential",form,()=>recordCredential(actor,{user_id:value(form,"user_id"),requirement_id:value(form,"requirement_id"),reference:value(form,"reference"),issued_on:value(form,"issued_on"),expires_on:value(form,"expires_on")}));
}
export async function reviewCredentialAction(_previous:PersonnelFormState,form:FormData):Promise<PersonnelFormState> {
  const actor=await requireActor();
  return run("review",form,()=>reviewCredential(actor,value(form,"credential_id"),value(form,"decision") as "verificada"|"rechazada"|"revocada",value(form,"reason")));
}
export async function createExternalDriverAction(_previous:PersonnelFormState,form:FormData):Promise<PersonnelFormState> {
  const actor=await requireActor();
  return run("external_driver",form,()=>createExternalDriver(actor,{name:value(form,"name"),tax_id:value(form,"tax_id"),
    company_name:value(form,"company_name"),phone:value(form,"phone")}));
}
export async function recordExternalCredentialAction(_previous:PersonnelFormState,form:FormData):Promise<PersonnelFormState> {
  const actor=await requireActor();
  return run("external_credential",form,()=>recordExternalCredential(actor,{external_driver_id:value(form,"external_driver_id"),
    requirement_id:value(form,"requirement_id"),reference:value(form,"reference"),
    issued_on:value(form,"issued_on"),expires_on:value(form,"expires_on")}));
}
export async function reviewExternalCredentialAction(_previous:PersonnelFormState,form:FormData):Promise<PersonnelFormState> {
  const actor=await requireActor();
  return run("external_review",form,()=>reviewExternalCredential(actor,value(form,"credential_id"),
    value(form,"decision") as "verificada"|"rechazada"|"revocada",value(form,"reason")));
}
