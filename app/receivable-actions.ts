"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {ExtraChargeError,registerExtraReceivablePayment,voidExtraReceivableInvoice} from "@/lib/extra-charges";

const v=(form:FormData,key:string)=>String(form.get(key)??"");
const page=(form:FormData)=>`/cobranzas?empresa=${v(form,"company")==="e_y_j"?"e_y_j":"rerchar"}`;
async function run(path:string,fn:()=>Promise<unknown>):Promise<never>{
  try{await fn();}catch(error){
    const message=error instanceof ExtraChargeError?error.message:error instanceof ZodError?"Revise monto, fecha y referencia.":"No se pudo registrar la operación.";
    if(!(error instanceof ExtraChargeError||error instanceof ZodError))console.error("Cobranza",error);
    redirect(`${path}&error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/","layout");redirect(`${path}&ok=1`);
}
export async function registerExtraReceivablePaymentAction(form:FormData){
  const actor=await requireActor();await run(page(form),()=>registerExtraReceivablePayment(actor,v(form,"invoice_id"),{
    submission_key:v(form,"submission_key"),amount_clp:v(form,"amount_clp"),paid_on:v(form,"paid_on"),reference:v(form,"reference"),
  }));
}
export async function voidExtraReceivableInvoiceAction(form:FormData){
  const actor=await requireActor();await run(page(form),()=>voidExtraReceivableInvoice(actor,v(form,"invoice_id"),v(form,"reason")));
}
