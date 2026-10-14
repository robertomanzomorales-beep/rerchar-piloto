"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {createQuoteDestination,updateQuoteDestination,DestinationError} from "@/lib/destinations";

const v=(form:FormData,key:string)=>String(form.get(key)??"");
const fields=(form:FormData)=>({name:v(form,"name"),facility_type:v(form,"facility_type"),address:v(form,"address"),
  commune:v(form,"commune"),latitude:v(form,"latitude"),longitude:v(form,"longitude"),location_url:v(form,"location_url")});
const message=(error:unknown)=>{
  if(error instanceof DestinationError)return error.message;
  if(error instanceof ZodError)return "Revise nombre, coordenadas, categorías, autorización y tarifa.";
  console.error("Error en destinos",error);return "No se pudo guardar el destino.";
};
export async function createDestinationAction(form:FormData){
  const actor=await requireActor();
  try{await createQuoteDestination(actor,fields(form));}catch(error){redirect(`/destinos?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/destinos");redirect("/destinos?ok=1");
}
export async function updateDestinationAction(form:FormData){
  const actor=await requireActor();
  const input={...fields(form),status:v(form,"status"),accepted_categories:form.getAll("accepted_categories").map(String),
    authorization_reference:v(form,"authorization_reference"),authorization_valid_until:v(form,"authorization_valid_until"),
    disposal_unit:v(form,"disposal_unit"),disposal_price_clp:v(form,"disposal_price_clp")};
  const file=form.get("authorization_document");
  try{await updateQuoteDestination(actor,v(form,"id"),input,file instanceof File?file:undefined);}
  catch(error){redirect(`/destinos?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/destinos");revalidatePath("/cotizaciones");redirect("/destinos?ok=1");
}
