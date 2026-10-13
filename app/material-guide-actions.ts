"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {MaterialGuideError,createMaterialGuide,saveMaterialGuideItem,updateMaterialGuide} from "@/lib/material-guides";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
const header=["submission_key","guide_number","movement_on","movement_type","counterparty_id","movement_detail","origin","destination",
  "driver_name","truck_plate","trailer_plate","freight_company","freight_cost_clp","freight_invoice_number",
  "freight_guide_reference","freight_payment_required","freight_invoice_status","guide_notes"] as const;
const item=["item_id","line_number","material_name","origin_ticket","origin_kg","stock_kg","departure_ticket",
  "destination_ticket","arrival_kg","returned_kg","return_ticket","return_kg","destination_impurity_kg",
  "invoice_kg","agreed_price_clp","invoice_price_clp","invoice_number","invoice_issued_on","invoice_status",
  "payment_on","valued_guide_number","notes"] as const;
const fields=(form:FormData,keys:readonly string[])=>Object.fromEntries(keys.map(key=>[key,value(form,key)]));
function message(error:unknown){
  if(error instanceof MaterialGuideError)return error.message;
  if(error instanceof ZodError)return "Revise fecha, contraparte, material, pesos y datos de factura.";
  console.error("Error al registrar control de guía",error);
  return "No fue posible guardar la guía. Revise si el número ya existe.";
}
function notify(path:string,error:unknown):never{redirect(`${path}${path.includes("?")?"&":"?"}error=${encodeURIComponent(message(error))}`);}

export async function createMaterialGuideAction(form:FormData){
  const actor=await requireActor();
  let id:string;
  try{id=await createMaterialGuide(actor,{...fields(form,header),...fields(form,item)});}
  catch(error){notify("/control-guias/nueva",error);}
  revalidatePath("/","layout");
  redirect(`/control-guias/${id}?ok=1`);
}

export async function saveMaterialGuideItemAction(form:FormData){
  const actor=await requireActor(),id=value(form,"guide_id");
  const path=`/control-guias/${encodeURIComponent(id)}`;
  try{await saveMaterialGuideItem(actor,id,fields(form,item));}
  catch(error){notify(path,error);}
  revalidatePath("/","layout");
  redirect(`${path}?ok=1`);
}

export async function updateMaterialGuideAction(form:FormData){
  const actor=await requireActor(),id=value(form,"guide_id");
  const path=`/control-guias/${encodeURIComponent(id)}`;
  try{await updateMaterialGuide(actor,id,fields(form,header));}
  catch(error){notify(path,error);}
  revalidatePath("/","layout");
  redirect(`${path}?ok=1`);
}
