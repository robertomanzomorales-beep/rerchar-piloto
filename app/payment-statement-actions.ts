"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {PaymentStatementError,createPaymentStatement,saveStatementCharge,saveStatementOperation,deletePaymentStatementLine,setPaymentStatementStatus} from "@/lib/payment-statements";

const val=(form:FormData,key:string)=>String(form.get(key)??"");
const select=(form:FormData,fields:readonly string[])=>Object.fromEntries(fields.map(key=>[key,val(form,key)]));
function message(error:unknown){
  if(error instanceof PaymentStatementError)return error.message;
  if(error instanceof ZodError)return "Revise las fechas, pesos, montos y campos obligatorios.";
  if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="23505")return "El número de estado de pago o de ítem ya existe para este cliente y período.";
  console.error("Estado de pago",error);return "No fue posible guardar el estado de pago.";
}
function path(id:string){return `/estados-pago/${encodeURIComponent(id)}`;}
async function run(target:string,fn:()=>Promise<unknown>):Promise<never>{
  try{await fn();}catch(error){redirect(`${target}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${target}?ok=1`);
}

export async function createStatementAction(form:FormData){
  const actor=await requireActor();let id:string;
  const fields=["submission_key","client_id","number","period_on","statement_type","client_name","client_tax_id",
    "client_address","client_contact","issuer_contact","contract_manager","contract_reference","notes"];
  try{id=await createPaymentStatement(actor,select(form,fields));}
  catch(error){redirect(`/estados-pago/nuevo?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path(id)}?ok=1`);
}
export async function saveStatementOperationAction(form:FormData){
  const actor=await requireActor(),id=val(form,"statement_id");
  const fields=["line_id","line_number","description","operation_on","weight_kg","weighing_ticket","service_sheet",
    "guide_number","sidrep","rental_from","rental_to","is_disposal"];
  await run(path(id),()=>saveStatementOperation(actor,id,select(form,fields)));
}
export async function saveStatementChargeAction(form:FormData){
  const actor=await requireActor(),id=val(form,"statement_id");
  const fields=["line_id","line_number","description","pricing","unit_value","quantity","uf_value_clp","uf_on"];
  await run(path(id),()=>saveStatementCharge(actor,id,select(form,fields)));
}
export async function deleteStatementLineAction(form:FormData){
  const actor=await requireActor(),id=val(form,"statement_id");
  await run(path(id),()=>deletePaymentStatementLine(actor,id,val(form,"kind"),val(form,"line_id")));
}
export async function setStatementStatusAction(form:FormData){
  const actor=await requireActor(),id=val(form,"statement_id");
  await run(path(id),()=>setPaymentStatementStatus(actor,id,val(form,"status")));
}
