"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {GuideError,saveGuideControl} from "@/lib/guides";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
export async function saveGuideControlAction(form:FormData){
  const actor=await requireActor();
  const id=value(form,"service_id");
  const path=`/solicitudes/${encodeURIComponent(id)}/guias`;
  const fields=["guide_number","movement_date","movement_type","origin_ticket","destination_ticket","return_ticket",
    "origin_kg","complementary_kg","arrival_kg","returned_impurities_kg","return_weight_kg","destination_impurities_kg",
    "invoice_kg","invoice_number","valued_guide_number","notes","departure_ticket","driver_name","truck_plate",
    "material_name","agreed_price_clp","invoice_price_clp","invoice_issued_on","payment_on","freight_company",
    "freight_invoice_number","freight_guide_reference","freight_payment_required"] as const;
  const data=Object.fromEntries(fields.map(key=>[key,value(form,key)]));
  try {await saveGuideControl(actor,id,data);}
  catch(error){
    const message=error instanceof GuideError?error.message:error instanceof ZodError?"Revise fechas, identificadores y pesos en kg.":"No fue posible guardar este control de guía.";
    if(!(error instanceof GuideError || error instanceof ZodError))console.error("Error al guardar guía",error);
    redirect(`${path}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/","layout");
  redirect(`${path}?ok=1`);
}
