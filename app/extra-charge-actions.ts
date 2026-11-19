"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import type {Company} from "@/lib/companies";
import {ExtraChargeError,proposeExtraCharge,decideExtraCharge,invoiceExtraCharge} from "@/lib/extra-charges";
import {extraChargeAnchor,extraChargeBoardHref,extraChargeContextFromForm,extraChargeDraft,serviceChargeHref,type ExtraChargeFormKind,type ExtraChargeFormState} from "@/lib/extra-charge-state";
const value=(form:FormData,key:string)=>String(form.get(key)??"").replace(/\r\n?/g,"\n");
async function run(kind:ExtraChargeFormKind,form:FormData,operation:()=>Promise<unknown>):Promise<ExtraChargeFormState>{
  let result:unknown;try{result=await operation();}catch(error){
    const message=error instanceof ExtraChargeError?error.message:error instanceof ZodError?"Revise el parte, los montos, las fechas y los campos obligatorios.":"No fue posible guardar el cargo.";
    if(!(error instanceof ExtraChargeError||error instanceof ZodError))console.error("Cargo extraordinario",error);
    return {error:message,values:extraChargeDraft(kind,form)};
  }
  revalidatePath("/","layout");const context=extraChargeContextFromForm(form),id=typeof result==="string"?result:value(form,"id"),flags={ok:"1",origen_cargo:kind,cargo:id};
  redirect(kind==="propose"?serviceChargeHref(value(form,"service_id"),context,extraChargeAnchor(id),flags):extraChargeBoardHref(context,extraChargeAnchor(id),flags));
}
export async function proposeExtraChargeAction(_previous:ExtraChargeFormState,form:FormData):Promise<ExtraChargeFormState>{
  const actor=await requireActor(),company=extraChargeContextFromForm(form).empresa as Company;
  return run("propose",form,()=>proposeExtraCharge(actor,value(form,"service_id"),{submission_key:value(form,"submission_key"),service_day:value(form,"service_day"),kind:value(form,"kind"),reason:value(form,"reason"),amount_clp:value(form,"amount_clp"),quote_reference:value(form,"quote_reference"),client_order_reference:value(form,"client_order_reference")},company));
}
export async function decideExtraChargeAction(_previous:ExtraChargeFormState,form:FormData):Promise<ExtraChargeFormState>{
  const actor=await requireActor(),company=extraChargeContextFromForm(form).empresa as Company;
  return run("decide",form,()=>decideExtraCharge(actor,value(form,"id"),{status:value(form,"status"),decision_note:value(form,"decision_note"),amount_clp:value(form,"amount_clp")},company));
}
export async function invoiceExtraChargeAction(_previous:ExtraChargeFormState,form:FormData):Promise<ExtraChargeFormState>{
  const actor=await requireActor(),company=extraChargeContextFromForm(form).empresa as Company;
  return run("invoice",form,()=>invoiceExtraCharge(actor,value(form,"id"),{invoice_number:value(form,"invoice_number"),invoiced_on:value(form,"invoiced_on"),due_on:value(form,"due_on"),total_clp:value(form,"total_clp")},company));
}
