"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import { addServiceCost, classifyContractCompany, confirmServiceInvoiceTotal, createContract, createTariff, FinanceError, recordTariffNotice, registerInvoice, registerPayment, reviseTariff, updateClientOrderReference, valueService, voidInvoice } from "@/lib/finance";
import {financeCatalogAnchor,financeCatalogContextFromForm,financeCatalogDraft,financeCatalogHref,isFinanceId,type FinanceCatalogKind,type FinanceCatalogState} from "@/lib/finance-catalog-state";

const value=(form:FormData,key:string)=>String(form.get(key)??"").replace(/\r\n?/g,"\n");
const detail=(id:string)=>`/finanzas/${encodeURIComponent(id)}`;
function message(error:unknown){
  if(error instanceof FinanceError)return error.message;
  if(error instanceof ZodError)return "Revise la tarifa, monto, folio y fechas ingresadas.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505")return "El folio ya existe o este servicio ya tiene ese registro financiero.";
  console.error("Error en finanzas internas",error);
  return "No fue posible guardar el cambio financiero.";
}
async function run(path:string,fn:()=>Promise<unknown>):Promise<never>{
  const separator=path.includes("?")?"&":"?";
  try{await fn();}catch(error){redirect(`${path}${separator}error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");
  redirect(`${path}${separator}ok=1`);
}
async function runCatalog(kind:FinanceCatalogKind,form:FormData,operation:()=>Promise<unknown>):Promise<FinanceCatalogState>{
  let result:unknown;
  try{result=await operation();}catch(error){return {error:message(error),values:financeCatalogDraft(kind,form)};}
  const context=financeCatalogContextFromForm(form),company=value(form,"operating_company");
  if(kind==="contract"&&(company==="rerchar"||company==="e_y_j"))context.empresa=company;
  const sourceId=value(form,kind==="notice"?"notice_id":kind==="revise"?"tariff_id":"id"),id=typeof result==="string"&&isFinanceId(result)?result:sourceId;
  revalidatePath("/","layout");
  redirect(financeCatalogHref(context,financeCatalogAnchor(kind,id),{ok:"1",origen:kind,edicion:id}));
}
export async function createContractAction(_previous:FinanceCatalogState,form:FormData):Promise<FinanceCatalogState>{const actor=await requireActor();return runCatalog("contract",form,()=>createContract(actor,{
  client_id:value(form,"client_id"),site_id:value(form,"site_id"),operating_company:value(form,"operating_company"),code:value(form,"code"),starts_on:value(form,"starts_on"),
  ends_on:value(form,"ends_on"),notes:value(form,"notes")}));}
export async function classifyContractCompanyAction(_previous:FinanceCatalogState,form:FormData):Promise<FinanceCatalogState>{const actor=await requireActor();return runCatalog("classify",form,()=>classifyContractCompany(actor,value(form,"id"),value(form,"operating_company")));}
export async function createTariffAction(_previous:FinanceCatalogState,form:FormData):Promise<FinanceCatalogState>{const actor=await requireActor();return runCatalog("tariff",form,()=>createTariff(actor,{
  contract_id:value(form,"contract_id"),service_type:value(form,"service_type"),waste_type:value(form,"waste_type"),unit:value(form,"unit"),
  unit_price_clp:value(form,"unit_price_clp"),valid_from:value(form,"valid_from"),valid_until:value(form,"valid_until")}));}
export async function reviseTariffAction(_previous:FinanceCatalogState,form:FormData):Promise<FinanceCatalogState>{const actor=await requireActor();return runCatalog("revise",form,()=>reviseTariff(actor,value(form,"tariff_id"),{
  unit_price_clp:value(form,"unit_price_clp"),valid_from:value(form,"valid_from"),reason:value(form,"reason")}));}
export async function recordTariffNoticeAction(_previous:FinanceCatalogState,form:FormData):Promise<FinanceCatalogState>{const actor=await requireActor();return runCatalog("notice",form,()=>recordTariffNotice(actor,value(form,"notice_id"),{
  channel:value(form,"channel"),recipient:value(form,"recipient"),notified_on:value(form,"notified_on"),reference:value(form,"reference")}));}
export async function valueServiceAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>valueService(actor,id,{
  tariff_id:value(form,"tariff_id"),client_order_reference:value(form,"client_order_reference")}));}
export async function updateClientOrderReferenceAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>updateClientOrderReference(actor,id,{
  client_order_reference:value(form,"client_order_reference"),reason:value(form,"reason")}));}
export async function registerInvoiceAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>registerInvoice(actor,id,{
  invoice_number:value(form,"invoice_number"),issued_on:value(form,"issued_on"),due_on:value(form,"due_on"),total_clp:value(form,"total_clp")}));}
export async function confirmServiceInvoiceTotalAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>confirmServiceInvoiceTotal(actor,value(form,"invoice_id"),{
  total_clp:value(form,"total_clp"),reason:value(form,"reason")}));}
export async function voidInvoiceAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>voidInvoice(actor,value(form,"invoice_id"),value(form,"reason")));}
export async function registerPaymentAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>registerPayment(actor,value(form,"invoice_id"),{
  submission_key:value(form,"submission_key"),amount_clp:value(form,"amount_clp"),paid_on:value(form,"paid_on"),
  method:value(form,"method"),reference:value(form,"reference")}));}
export async function addCostAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>addServiceCost(actor,id,{
  submission_key:value(form,"submission_key"),category:value(form,"category"),amount_clp:value(form,"amount_clp"),description:value(form,"description")}));}
