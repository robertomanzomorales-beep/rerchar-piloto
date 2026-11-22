"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {SupplierTransferError,requestSupplierTransfer,decideSupplierTransfer,executeSupplierTransfer,verifySupplierTransfer} from "@/lib/supplier-transfers";
import {supplierInvoiceDetailDraft,supplierInvoiceDetailFields,supplierInvoiceDetailHref,type SupplierInvoiceDetailKind,type SupplierInvoiceDetailState} from "@/lib/supplier-invoice-detail-state";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown){
  if(error instanceof SupplierTransferError)return error.message;
  if(error instanceof ZodError)return "Revise monto, cuenta, fecha, referencia y campos obligatorios.";
  console.error("Transferencia de proveedor",error);return "No se pudo guardar la transferencia. Revise la factura e inténtelo nuevamente.";
}
async function save(kind:SupplierInvoiceDetailKind,form:FormData):Promise<SupplierInvoiceDetailState>{
  const actor=await requireActor(),invoiceId=value(form,"invoice_id"),transferId=value(form,"transfer_id"),values=Object.fromEntries(supplierInvoiceDetailFields[kind].map(key=>[key,value(form,key)]));
  try{
    if(kind==="request")await requestSupplierTransfer(actor,invoiceId,values);
    else if(kind==="approve"||kind==="reject")await decideSupplierTransfer(actor,transferId,kind==="approve"?"aprobada":"rechazada",values.note??"");
    else if(kind==="execute")await executeSupplierTransfer(actor,transferId,values,form.get("proof") as File);
    else if(kind==="verify")await verifySupplierTransfer(actor,transferId,values);
  }catch(error){return {error:message(error),values:supplierInvoiceDetailDraft(kind,form)};}
  revalidatePath("/","layout");redirect(supplierInvoiceDetailHref(invoiceId,kind,transferId));
}
export async function requestSupplierTransferAction(_previous:SupplierInvoiceDetailState,form:FormData){return save("request",form);}
export async function approveSupplierTransferAction(_previous:SupplierInvoiceDetailState,form:FormData){return save("approve",form);}
export async function rejectSupplierTransferAction(_previous:SupplierInvoiceDetailState,form:FormData){return save("reject",form);}
export async function executeSupplierTransferAction(_previous:SupplierInvoiceDetailState,form:FormData){return save("execute",form);}
export async function verifySupplierTransferAction(_previous:SupplierInvoiceDetailState,form:FormData){return save("verify",form);}
