"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import { addServiceCost, createContract, createTariff, FinanceError, registerInvoice, registerPayment, valueService, voidInvoice } from "@/lib/finance";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
const detail=(id:string)=>`/finanzas/${encodeURIComponent(id)}`;
function message(error:unknown){
  if(error instanceof FinanceError)return error.message;
  if(error instanceof ZodError)return "Revise la tarifa, monto, folio y fechas ingresadas.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505")return "El folio ya existe o este servicio ya tiene ese registro financiero.";
  console.error("Error en finanzas internas",error);
  return "No fue posible guardar el cambio financiero.";
}
async function run(path:string,fn:()=>Promise<unknown>):Promise<never>{
  try{await fn();}catch(error){redirect(`${path}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");
  redirect(`${path}?ok=1`);
}
export async function createContractAction(form:FormData){const actor=await requireActor();await run("/finanzas",()=>createContract(actor,{
  client_id:value(form,"client_id"),site_id:value(form,"site_id"),code:value(form,"code"),starts_on:value(form,"starts_on"),
  ends_on:value(form,"ends_on"),notes:value(form,"notes")}));}
export async function createTariffAction(form:FormData){const actor=await requireActor();await run("/finanzas",()=>createTariff(actor,{
  contract_id:value(form,"contract_id"),service_type:value(form,"service_type"),waste_type:value(form,"waste_type"),unit:value(form,"unit"),
  unit_price_clp:value(form,"unit_price_clp"),valid_from:value(form,"valid_from"),valid_until:value(form,"valid_until")}));}
export async function valueServiceAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>valueService(actor,id,{
  tariff_id:value(form,"tariff_id"),client_order_reference:value(form,"client_order_reference")}));}
export async function registerInvoiceAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>registerInvoice(actor,id,{
  invoice_number:value(form,"invoice_number"),issued_on:value(form,"issued_on"),due_on:value(form,"due_on")}));}
export async function voidInvoiceAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>voidInvoice(actor,value(form,"invoice_id"),value(form,"reason")));}
export async function registerPaymentAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>registerPayment(actor,value(form,"invoice_id"),{
  submission_key:value(form,"submission_key"),amount_clp:value(form,"amount_clp"),paid_on:value(form,"paid_on"),
  method:value(form,"method"),reference:value(form,"reference")}));}
export async function addCostAction(form:FormData){const actor=await requireActor();const id=value(form,"service_id");await run(detail(id),()=>addServiceCost(actor,id,{
  submission_key:value(form,"submission_key"),category:value(form,"category"),amount_clp:value(form,"amount_clp"),description:value(form,"description")}));}
