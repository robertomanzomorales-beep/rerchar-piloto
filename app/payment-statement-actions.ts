"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {randomUUID} from "node:crypto";
import {statementDetailDraft,statementDetailFields,statementDetailHref,type StatementDetailKind,type StatementDetailState} from "@/lib/statement-detail-state";
import {requireActor} from "@/lib/auth";
import {statementDraft,type StatementFormState} from "@/lib/statement-form-state";
import {PaymentStatementError,createPaymentStatement,saveStatementCharge,saveStatementOperation,addStatementService,linkStatementInvoice,saveStatementClientOrder,deletePaymentStatementLine,setPaymentStatementStatus,sendPaymentStatement,recordManualStatementDelivery,resolveStatementDelivery} from "@/lib/payment-statements";

const val=(form:FormData,key:string)=>String(form.get(key)??"");
const select=(form:FormData,fields:readonly string[])=>Object.fromEntries(fields.map(key=>[key,val(form,key)]));
function message(error:unknown){
  if(error instanceof PaymentStatementError)return error.message;
  if(error instanceof ZodError)return "Revise las fechas, pesos, montos y campos obligatorios.";
  if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="23505")return "El número de estado de pago o de ítem ya existe para este cliente y período.";
  console.error("Estado de pago",error);return "No fue posible guardar el estado de pago.";
}
function path(id:string){return `/estados-pago/${encodeURIComponent(id)}`;}
async function run(target:string,fn:()=>Promise<unknown>,anchor="control-edp"):Promise<never>{
  try{await fn();}catch(error){redirect(`${target}?error=${encodeURIComponent(message(error))}#${anchor}`);}
  revalidatePath("/","layout");redirect(`${target}?ok=1#${anchor}`);
}

export async function createStatementAction(_previous:StatementFormState,form:FormData):Promise<StatementFormState>{
  const actor=await requireActor();let id:string;
  const fields=["submission_key","client_id","number","period_on","statement_type","client_name","client_tax_id",
    "client_address","client_contact","issuer_contact","contract_manager","contract_reference","notes","cycle_id"];
  const cycleId=val(form,"cycle_id");
  try{id=await createPaymentStatement(actor,select(form,fields));}
  catch(error){return {error:message(error),values:statementDraft(form)};}
  revalidatePath("/","layout");redirect(cycleId?`/estados-pago/calendario/${encodeURIComponent(cycleId)}?ok=1`:`${path(id)}?ok=1`);
}
async function saveDetail(kind:StatementDetailKind,form:FormData):Promise<StatementDetailState>{
  const actor=await requireActor(),id=val(form,"statement_id"),values=select(form,statementDetailFields[kind]);
  let lineId=val(form,"line_id");
  try{
    if(kind==="operation")lineId=await saveStatementOperation(actor,id,values);
    else if(kind==="charge")lineId=await saveStatementCharge(actor,id,values);
    else if(kind==="service")lineId=await addStatementService(actor,id,values);
    else if(kind==="invoice")await linkStatementInvoice(actor,id,values);
    else if(kind==="order")await saveStatementClientOrder(actor,id,values);
    else if(kind==="send")await sendPaymentStatement(actor,id,val(form,"recipient"));
    else if(kind==="manual")await recordManualStatementDelivery(actor,id,values);
    else if(kind==="resolve")await resolveStatementDelivery(actor,id,values);
  }catch(error){return {error:message(error),values:statementDetailDraft(kind,form)};}
  revalidatePath("/","layout");redirect(statementDetailHref(id,kind,lineId,false,randomUUID()));
}
export async function saveStatementOperationAction(_previous:StatementDetailState,form:FormData):Promise<StatementDetailState>{
  return saveDetail("operation",form);
}
export async function addStatementServiceAction(_previous:StatementDetailState,form:FormData):Promise<StatementDetailState>{
  return saveDetail("service",form);
}
export async function saveStatementChargeAction(_previous:StatementDetailState,form:FormData):Promise<StatementDetailState>{
  return saveDetail("charge",form);
}
export async function deleteStatementLineAction(form:FormData){
  const actor=await requireActor(),id=val(form,"statement_id");
  await run(path(id),()=>deletePaymentStatementLine(actor,id,val(form,"kind"),val(form,"line_id")),val(form,"kind")==="operation"?"operaciones-edp":"cobros-edp");
}
export async function setStatementStatusAction(form:FormData){
  const actor=await requireActor(),id=val(form,"statement_id");
  if(val(form,"status")==="enviado")redirect(`${path(id)}?error=${encodeURIComponent("Registre el envío real o la constancia de entrega manual.")}#control-edp`);
  await run(path(id),()=>setPaymentStatementStatus(actor,id,val(form,"status")));
}
export async function sendStatementAction(_previous:StatementDetailState,form:FormData):Promise<StatementDetailState>{
  return saveDetail("send",form);
}
export async function manualStatementDeliveryAction(_previous:StatementDetailState,form:FormData):Promise<StatementDetailState>{
  return saveDetail("manual",form);
}
export async function resolveStatementDeliveryAction(_previous:StatementDetailState,form:FormData):Promise<StatementDetailState>{
  return saveDetail("resolve",form);
}
export async function linkStatementInvoiceAction(_previous:StatementDetailState,form:FormData):Promise<StatementDetailState>{
  return saveDetail("invoice",form);
}
export async function saveStatementClientOrderAction(_previous:StatementDetailState,form:FormData):Promise<StatementDetailState>{
  return saveDetail("order",form);
}
