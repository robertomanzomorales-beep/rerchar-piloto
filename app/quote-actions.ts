"use server";

import {randomUUID} from "node:crypto";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {QuoteError,createQuote,addQuoteLine,recordQuoteDecision,resolveQuoteSending,sendQuote} from "@/lib/quotes";

const v=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown){if(error instanceof QuoteError)return error.message;if(error instanceof ZodError)return "Revise cliente, fechas, descripción, cantidad y precio.";console.error("Error en cotizaciones",error);return "No se pudo guardar esta cotización.";}
export async function createQuoteAction(form:FormData){
  const actor=await requireActor();let id:string;
  try{id=await createQuote(actor,{submission_key:v(form,"submission_key")||randomUUID(),client_id:v(form,"client_id"),issuer:v(form,"issuer"),title:v(form,"title"),
    notes:v(form,"notes"),issued_on:v(form,"issued_on"),valid_until:v(form,"valid_until"),vat_rate:v(form,"vat_rate"),
    line:{description:v(form,"description"),quantity:v(form,"quantity"),unit:v(form,"unit"),unit_price_clp:v(form,"unit_price_clp"),taxable:form.get("taxable")==="on"}});}
  catch(error){redirect(`/cotizaciones/nueva?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`/cotizaciones/${id}?ok=1`);
}
export async function addQuoteLineAction(form:FormData){
  const actor=await requireActor();const id=v(form,"quote_id"),path=`/cotizaciones/${encodeURIComponent(id)}`;
  try{await addQuoteLine(actor,id,{description:v(form,"description"),quantity:v(form,"quantity"),unit:v(form,"unit"),unit_price_clp:v(form,"unit_price_clp"),taxable:form.get("taxable")==="on"});}
  catch(error){redirect(`${path}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path}?ok=1`);
}
export async function sendQuoteAction(form:FormData){
  const actor=await requireActor();const id=v(form,"quote_id"),path=`/cotizaciones/${encodeURIComponent(id)}`;
  try{await sendQuote(actor,id);}catch(error){redirect(`${path}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path}?ok=1`);
}
export async function quoteDecisionAction(form:FormData){
  const actor=await requireActor();const id=v(form,"quote_id"),path=`/cotizaciones/${encodeURIComponent(id)}`;
  try{await recordQuoteDecision(actor,id,v(form,"decision") as "aceptada"|"rechazada");}catch(error){redirect(`${path}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path}?ok=1`);
}
export async function resolveQuoteSendingAction(form:FormData){
  const actor=await requireActor();const id=v(form,"quote_id"),path=`/cotizaciones/${encodeURIComponent(id)}`;
  try{await resolveQuoteSending(actor,id,v(form,"outcome") as "borrador"|"enviada",v(form,"reason"));}
  catch(error){redirect(`${path}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path}?ok=1`);
}
