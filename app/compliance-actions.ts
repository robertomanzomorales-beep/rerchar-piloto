"use server";
import {randomUUID} from "node:crypto";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {ComplianceError,observeWasteRecord,recordExternalDeclaration,reviewWasteRecord,saveWasteRecord} from "@/lib/compliance";
import {complianceDraft,complianceFields,complianceFormContext,complianceHref,type ComplianceFormState,type ComplianceKind} from "@/lib/compliance-state";
const value=(form:FormData,key:string)=>String(form.get(key)??"");
function errorText(error:unknown){
  if(error instanceof ComplianceError)return error.message;if(error instanceof ZodError)return "Revise los campos y fechas del registro.";
  if(typeof error==="object"&&error&&"code"in error&&error.code==="23505")return "El servicio o referencia externa ya tiene un registro.";
  console.error("Registro ambiental",error);return "No se pudo guardar el registro. Revise los datos e inténtelo de nuevo.";
}
async function run(kind:ComplianceKind,form:FormData):Promise<ComplianceFormState>{
  const actor=await requireActor();let id=value(form,"id");
  try{
    if(kind==="save")id=await saveWasteRecord(actor,{...Object.fromEntries(complianceFields.save.map(field=>[field,value(form,field)])),record_id:id});
    else if(kind==="review")await reviewWasteRecord(actor,id);
    else if(kind==="observe")await observeWasteRecord(actor,id,value(form,"reason"));
    else await recordExternalDeclaration(actor,id,{external_reference:value(form,"external_reference"),reported_on:value(form,"reported_on")});
  }catch(error){return{error:errorText(error),values:complianceDraft(kind,form)};}
  revalidatePath("/","layout");redirect(complianceHref(complianceFormContext(form),id,kind,randomUUID()));
}
export async function saveWasteAction(_previous:ComplianceFormState,form:FormData){return run("save",form);}
export async function reviewWasteAction(_previous:ComplianceFormState,form:FormData){return run("review",form);}
export async function observeWasteAction(_previous:ComplianceFormState,form:FormData){return run("observe",form);}
export async function recordDeclarationAction(_previous:ComplianceFormState,form:FormData){return run("declare",form);}
