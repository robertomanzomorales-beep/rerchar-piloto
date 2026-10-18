"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {QuotePlanningError,saveQuoteRoute,calculateMapRoute,saveQuoteCosting,applySuggestedQuotePrice,saveQuoteCostRates} from "@/lib/quote-planning";

const v=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown){
  if(error instanceof QuotePlanningError)return error.message;
  if(error instanceof ZodError)return "Revise direcciones, kilómetros y montos. Use números positivos y complete todos los campos requeridos.";
  console.error("Planificación de cotización",error);return "No se pudo guardar la planificación de esta cotización.";
}
function path(id:string){return `/cotizaciones/${encodeURIComponent(id)}`;}
function route(form:FormData){return {origin:v(form,"origin"),pickup:v(form,"pickup"),destination:v(form,"destination"),return_to:v(form,"return_to")};}
export async function saveQuoteRouteAction(form:FormData){
  const actor=await requireActor(),id=v(form,"quote_id");
  try{await saveQuoteRoute(actor,id,{...route(form),pickup_km:v(form,"pickup_km"),destination_km:v(form,"destination_km"),
    return_km:v(form,"return_km"),reviewed_for_truck:form.get("reviewed_for_truck")==="on",correction_reason:v(form,"correction_reason")});}
  catch(error){redirect(`${path(id)}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path(id)}?ok=1`);
}
export async function calculateMapRouteAction(form:FormData){
  const actor=await requireActor(),id=v(form,"quote_id");
  try{await calculateMapRoute(actor,id,route(form));}
  catch(error){redirect(`${path(id)}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path(id)}?ok=1`);
}
export async function saveQuoteCostingAction(form:FormData){
  const actor=await requireActor(),id=v(form,"quote_id");
  const keys=["trips","asset_id","equipment","capacity","capacity_unit","km_per_liter","fuel_price_clp","equipment_cost_clp","tolls_clp",
    "driver_hours","driver_hour_clp","support_hours","support_hour_clp","per_diem_clp","loading_clp","disposal_quantity","disposal_unit",
    "disposal_unit_clp","stay_clp","other_clp","contingency_pct","margin_pct"];
  try{await saveQuoteCosting(actor,id,Object.fromEntries(keys.map(key=>[key,v(form,key)])));}
  catch(error){redirect(`${path(id)}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path(id)}?ok=1`);
}
export async function saveQuoteCostRatesAction(form:FormData){
  const actor=await requireActor(),id=v(form,"quote_id");
  const keys=["km_per_liter","fuel_price_clp","equipment_cost_clp","driver_hour_clp","support_hour_clp",
    "disposal_unit_clp","contingency_pct","margin_pct"];
  try{await saveQuoteCostRates(actor,id,{expected_version:v(form,"expected_version"),rates:Object.fromEntries(keys.map(key=>[key,v(form,key)]))});}
  catch(error){redirect(`${path(id)}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path(id)}?ok=1`);
}
export async function applySuggestedPriceAction(form:FormData){
  const actor=await requireActor(),id=v(form,"quote_id");
  try{await applySuggestedQuotePrice(actor,id);}
  catch(error){redirect(`${path(id)}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path(id)}?ok=1`);
}
