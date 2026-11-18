"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {CertificateError,issueCertificate,saveCertificateDraft,revokeCertificate} from "@/lib/certificates";
import {certificateFormDraft,type CertificateFormState} from "@/lib/certificate-form-state";
import {recordPage} from "@/lib/record-pagination";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function errorText(error:unknown){
  if(error instanceof CertificateError)return error.message;
  if(error instanceof ZodError)return "Revise el servicio o la explicación ingresada.";
  console.error("Certificados",error);
  return "No se pudo registrar el certificado. Revise los datos e intente nuevamente.";
}
export async function issueCertificateAction(form:FormData){
  const actor=await requireActor();
  let id:string;
  try{id=await issueCertificate(actor,value(form,"service_id"),value(form,"confirmation"));}
  catch(error){redirect(`/certificados?error=${encodeURIComponent(errorText(error))}`);}
  revalidatePath("/","layout");
  redirect(`/certificados?ok=1&certificado=${id}`);
}
export async function saveCertificateDraftAction(form:FormData){
  const actor=await requireActor();
  try{await saveCertificateDraft(actor,value(form,"service_id"),value(form,"document_type")||"servicio");}
  catch(error){redirect(`/certificados?error=${encodeURIComponent(errorText(error))}`);}
  revalidatePath("/","layout");
  redirect("/certificados?borrador=1#borradores-certificados");
}
export async function prepareCertificateDraftAction(_previous:CertificateFormState,form:FormData):Promise<CertificateFormState>{
  const actor=await requireActor();
  try{await saveCertificateDraft(actor,value(form,"service_id"),value(form,"document_type")||"servicio");}
  catch(error){return {error:errorText(error),values:certificateFormDraft("prepare",form)};}
  revalidatePath("/","layout");
  redirect("/certificados?borrador=1#borradores-certificados");
}
export async function revokeCertificateAction(_previous:CertificateFormState,form:FormData):Promise<CertificateFormState>{
  const actor=await requireActor();const page=recordPage(value(form,"pagina"));
  try{await revokeCertificate(actor,value(form,"id"),value(form,"reason"));}
  catch(error){return {error:errorText(error),values:certificateFormDraft("revoke",form)};}
  revalidatePath("/","layout");
  redirect(`/certificados?ok=1&pagina=${page}#historial-certificados`);
}
