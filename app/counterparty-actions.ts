"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {CounterpartyError,saveCounterparty,uploadCounterpartyDocument,verifyCounterparty} from "@/lib/counterparties";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
const path=(id:string)=>`/fichas/${encodeURIComponent(id)}`;
function message(error:unknown){
  if(error instanceof CounterpartyError)return error.message;
  if(error instanceof ZodError)return "Revise RUT, correos, campos obligatorios y datos bancarios.";
  if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="23505")return "Ya existe una ficha para este RUT o cliente.";
  console.error("Ficha cliente/proveedor",error);return "No fue posible guardar la ficha.";
}
export async function saveCounterpartyAction(form:FormData){
  const actor=await requireActor(),current=value(form,"id"),target=current?path(current):"/fichas/nueva";
  const fields=["id","client_id","kind","legal_name","trade_name","tax_id","business_activity","industry",
    "legal_address","locality","phone","general_email","website","tax_status","legal_representative",
    "invoice_email","payment_terms","requires_oc","requires_hes","requires_edp","edp_email","bank_name",
    "account_type","account_number","account_holder","account_holder_tax_id","currency","proof_email",
    "swift_iban","bank_notes"];
  const contacts=["compras","servicios","contabilidad","operaciones","prevencion"].map(area=>({area,
    name:value(form,`${area}_name`),role:value(form,`${area}_role`),phone:value(form,`${area}_phone`),
    email:value(form,`${area}_email`)}));
  let id:string;
  try{id=await saveCounterparty(actor,{...Object.fromEntries(fields.map(key=>[key,value(form,key)])),contacts});}
  catch(error){redirect(`${target}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path(id)}?ok=1`);
}
export async function uploadCounterpartyDocumentAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id"),target=path(id);
  try{await uploadCounterpartyDocument(actor,id,value(form,"kind"),form.get("file") as File);}
  catch(error){redirect(`${target}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${target}?ok=1`);
}
export async function verifyCounterpartyAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id"),target=path(id);
  try{await verifyCounterparty(actor,id);}catch(error){redirect(`${target}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${target}?ok=1`);
}
