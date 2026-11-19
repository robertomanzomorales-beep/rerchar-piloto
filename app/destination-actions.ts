"use server";

import {randomUUID} from "node:crypto";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {createQuoteDestination,updateQuoteDestination,DestinationError} from "@/lib/destinations";
import {destinationContext,destinationDraft,destinationHref,type DestinationFormState} from "@/lib/destination-form-state";

const v=(form:FormData,key:string)=>String(form.get(key)??"");
const fields=(form:FormData)=>({name:v(form,"name"),facility_type:v(form,"facility_type"),address:v(form,"address"),
  commune:v(form,"commune"),latitude:v(form,"latitude"),longitude:v(form,"longitude"),location_url:v(form,"location_url")});
const message=(error:unknown)=>{
  if(error instanceof DestinationError)return error.message;
  if(error instanceof ZodError)return "Revise nombre, coordenadas, categorías, autorización y tarifa.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505")return "Ya existe un destino con ese nombre.";
  console.error("Error en destinos",error);return "No se pudo guardar el destino. Revise los datos e inténtelo de nuevo.";
};
export async function createDestinationAction(_previous:DestinationFormState,form:FormData){
  const actor=await requireActor();let id:string;
  try{id=await createQuoteDestination(actor,fields(form));}catch(error){return destinationDraft("create",form,message(error));}
  revalidatePath("/","layout");redirect(destinationHref(destinationContext({empresa:form.get("empresa")}),"create",id,randomUUID()));
}
export async function updateDestinationAction(_previous:DestinationFormState,form:FormData){
  const actor=await requireActor(),id=v(form,"id");
  const input={...fields(form),status:v(form,"status"),accepted_categories:form.getAll("accepted_categories").map(String),
    authorization_reference:v(form,"authorization_reference"),authorization_valid_until:v(form,"authorization_valid_until"),
    disposal_unit:v(form,"disposal_unit"),disposal_price_clp:v(form,"disposal_price_clp")};
  const file=form.get("authorization_document");
  try{await updateQuoteDestination(actor,id,input,file instanceof File?file:undefined);}
  catch(error){return destinationDraft("update",form,message(error));}
  revalidatePath("/","layout");redirect(destinationHref(destinationContext({empresa:form.get("empresa")}),"update",id,randomUUID()));
}
