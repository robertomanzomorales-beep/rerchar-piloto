"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {ComplianceError,observeWasteRecord,recordExternalDeclaration,reviewWasteRecord,saveWasteRecord} from "@/lib/compliance";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function errorText(error:unknown){
  if(error instanceof ComplianceError)return error.message;
  if(error instanceof ZodError)return "Revise los campos y fechas del registro.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505")return "El servicio o referencia externa ya tiene un registro.";
  console.error("Registro ambiental",error);
  return "No se pudo guardar el registro. Revise los datos e inténtelo de nuevo.";
}
async function run(path:string,operation:()=>Promise<unknown>):Promise<never>{
  try{await operation();}catch(error){redirect(`${path}?error=${encodeURIComponent(errorText(error))}`);}
  revalidatePath("/","layout");
  redirect(`${path}?ok=1`);
}
export async function saveWasteAction(form:FormData){
  const actor=await requireActor();
  let id:string;
  try{id=await saveWasteRecord(actor,{
    service_id:value(form,"service_id"),category:value(form,"category"),classification:value(form,"classification"),
    generator_name:value(form,"generator_name"),transporter_name:value(form,"transporter_name"),receiver_name:value(form,"receiver_name"),
    treatment:value(form,"treatment"),guide_number:value(form,"guide_number"),
  });}catch(error){redirect(`/cumplimiento?error=${encodeURIComponent(errorText(error))}`);}
  revalidatePath("/","layout");
  redirect(`/cumplimiento/${id}?ok=1`);
}
export async function reviewWasteAction(form:FormData){
  const actor=await requireActor();const id=value(form,"id");
  await run(`/cumplimiento/${id}`,()=>reviewWasteRecord(actor,id));
}
export async function observeWasteAction(form:FormData){
  const actor=await requireActor();const id=value(form,"id");
  await run(`/cumplimiento/${id}`,()=>observeWasteRecord(actor,id,value(form,"reason")));
}
export async function recordDeclarationAction(form:FormData){
  const actor=await requireActor();const id=value(form,"id");
  await run(`/cumplimiento/${id}`,()=>recordExternalDeclaration(actor,id,{
    external_reference:value(form,"external_reference"),reported_on:value(form,"reported_on"),
  }));
}
