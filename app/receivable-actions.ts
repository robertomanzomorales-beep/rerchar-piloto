"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {ExtraChargeError,invoiceExtraCharge,registerExtraReceivablePayment,voidExtraReceivableInvoice} from "@/lib/extra-charges";
import type {Company} from "@/lib/companies";
import {receivableAnchor,receivableContextFromForm,receivableDraft,receivableHref,type ReceivableFormKind,type ReceivableFormState} from "@/lib/receivable-form-state";

const v=(form:FormData,key:string)=>String(form.get(key)??"").replace(/\r\n?/g,"\n");
async function run(kind:ReceivableFormKind,form:FormData,operation:()=>Promise<unknown>):Promise<ReceivableFormState>{
  try{await operation();}catch(error){
    const message=error instanceof ExtraChargeError?error.message:error instanceof ZodError?"Revise el monto, las fechas y los campos obligatorios.":"No se pudo registrar la operación.";
    if(!(error instanceof ExtraChargeError||error instanceof ZodError))console.error("Cobranza",error);
    return {error:message,values:receivableDraft(kind,form)};
  }
  revalidatePath("/","layout");const id=v(form,kind==="reconcile"?"id":"invoice_id");
  redirect(receivableHref(receivableContextFromForm(form),receivableAnchor(kind,id),{ok:"1",origen:kind,registro:id}));
}
export async function registerExtraReceivablePaymentAction(_previous:ReceivableFormState,form:FormData):Promise<ReceivableFormState>{
  const actor=await requireActor(),company=receivableContextFromForm(form).empresa as Company;
  return run("payment",form,()=>registerExtraReceivablePayment(actor,v(form,"invoice_id"),{submission_key:v(form,"submission_key"),amount_clp:v(form,"amount_clp"),paid_on:v(form,"paid_on"),reference:v(form,"reference")},company));
}
export async function voidExtraReceivableInvoiceAction(_previous:ReceivableFormState,form:FormData):Promise<ReceivableFormState>{
  const actor=await requireActor(),company=receivableContextFromForm(form).empresa as Company;
  return run("void",form,()=>voidExtraReceivableInvoice(actor,v(form,"invoice_id"),v(form,"reason"),company));
}
export async function reconcileReceivableAction(_previous:ReceivableFormState,form:FormData):Promise<ReceivableFormState>{
  const actor=await requireActor(),company=receivableContextFromForm(form).empresa as Company;
  return run("reconcile",form,()=>invoiceExtraCharge(actor,v(form,"id"),{invoice_number:v(form,"invoice_number"),invoiced_on:v(form,"invoiced_on"),due_on:v(form,"due_on"),total_clp:v(form,"total_clp")},company));
}
