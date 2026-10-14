"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {SupplierTransferError,requestSupplierTransfer,decideSupplierTransfer,executeSupplierTransfer,verifySupplierTransfer} from "@/lib/supplier-transfers";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
const path=(invoiceId:string)=>`/facturas-recibidas/${encodeURIComponent(invoiceId)}`;
function message(error:unknown){
  if(error instanceof SupplierTransferError)return error.message;
  if(error instanceof ZodError)return error.issues[0]?.message??"Revise monto, cuenta, fecha y referencia.";
  console.error("Transferencia de proveedor",error);return "No se pudo guardar la transferencia. Revise la factura e inténtelo nuevamente.";
}
function fail(invoiceId:string,error:unknown):never{redirect(`${path(invoiceId)}?error=${encodeURIComponent(message(error))}#transferencias`);}
function done(invoiceId:string):never{revalidatePath("/","layout");redirect(`${path(invoiceId)}?ok=1#transferencias`);}
export async function requestSupplierTransferAction(form:FormData){
  const actor=await requireActor(),invoiceId=value(form,"invoice_id");
  try{await requestSupplierTransfer(actor,invoiceId,{submission_key:value(form,"submission_key"),amount_clp:value(form,"amount_clp"),
    bank_name:value(form,"bank_name"),account_type:value(form,"account_type"),account_number:value(form,"account_number")});}
  catch(error){fail(invoiceId,error);}
  done(invoiceId);
}
export async function decideSupplierTransferAction(form:FormData){
  const actor=await requireActor(),invoiceId=value(form,"invoice_id");
  try{await decideSupplierTransfer(actor,value(form,"transfer_id"),value(form,"decision")==="aprobada"?"aprobada":"rechazada",value(form,"note"));}
  catch(error){fail(invoiceId,error);}
  done(invoiceId);
}
export async function executeSupplierTransferAction(form:FormData){
  const actor=await requireActor(),invoiceId=value(form,"invoice_id");
  try{await executeSupplierTransfer(actor,value(form,"transfer_id"),{paid_on:value(form,"paid_on"),bank_reference:value(form,"bank_reference")},
    form.get("proof") as File);}
  catch(error){fail(invoiceId,error);}
  done(invoiceId);
}
export async function verifySupplierTransferAction(form:FormData){
  const actor=await requireActor(),invoiceId=value(form,"invoice_id");
  try{await verifySupplierTransfer(actor,value(form,"transfer_id"),{checked_amount_clp:value(form,"checked_amount_clp"),
    checked_reference:value(form,"checked_reference"),verification_note:value(form,"verification_note")});}
  catch(error){fail(invoiceId,error);}
  done(invoiceId);
}
