"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {CertificateError,issueCertificate,revokeCertificate} from "@/lib/certificates";

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
  try{id=await issueCertificate(actor,value(form,"service_id"));}
  catch(error){redirect(`/certificados?error=${encodeURIComponent(errorText(error))}`);}
  revalidatePath("/","layout");
  redirect(`/certificados?ok=1&certificado=${id}`);
}
export async function revokeCertificateAction(form:FormData){
  const actor=await requireActor();
  try{await revokeCertificate(actor,value(form,"id"),value(form,"reason"));}
  catch(error){redirect(`/certificados?error=${encodeURIComponent(errorText(error))}`);}
  revalidatePath("/","layout");
  redirect("/certificados?ok=1");
}
