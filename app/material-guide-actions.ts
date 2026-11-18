"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {MaterialGuideError,createMaterialGuide,saveMaterialGuideItem,updateMaterialGuide} from "@/lib/material-guides";
import {MaterialStockError} from "@/lib/material-stock";
import {MaterialSaleBillingError,linkMaterialSaleInvoice} from "@/lib/material-sale-billing";
import {guideHeaderFields,guideItemFields,materialGuideDraft,type GuideFormState} from "@/lib/material-guide-form-state";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
const header=guideHeaderFields,item=guideItemFields;
const fields=(form:FormData,keys:readonly string[])=>Object.fromEntries(keys.map(key=>[key,value(form,key)]));
function message(error:unknown){
  if(error instanceof MaterialGuideError||error instanceof MaterialStockError||error instanceof MaterialSaleBillingError)return error.message;
  if(error instanceof ZodError)return "Revise fecha, contraparte, material, pesos y datos de factura.";
  console.error("Error al registrar control de guía",error);
  return "No fue posible guardar la guía. Revise si el número ya existe.";
}

export async function createMaterialGuideAction(_previous:GuideFormState,form:FormData):Promise<GuideFormState>{
  const actor=await requireActor();
  let id:string;
  try{id=await createMaterialGuide(actor,{...fields(form,header),...fields(form,item)});}
  catch(error){return {error:message(error),values:materialGuideDraft("create",form)};}
  revalidatePath("/","layout");
  redirect(`/control-guias/${id}?ok=1`);
}

export async function saveMaterialGuideItemAction(_previous:GuideFormState,form:FormData):Promise<GuideFormState>{
  const actor=await requireActor(),id=value(form,"guide_id");
  const path=`/control-guias/${encodeURIComponent(id)}`;
  try{await saveMaterialGuideItem(actor,id,fields(form,item));}
  catch(error){return {error:message(error),values:materialGuideDraft("item",form)};}
  revalidatePath("/","layout");
  const edited=value(form,"item_id");
  redirect(`${path}?ok=1${edited?`&editar=${encodeURIComponent(edited)}`:""}#material`);
}

export async function updateMaterialGuideAction(_previous:GuideFormState,form:FormData):Promise<GuideFormState>{
  const actor=await requireActor(),id=value(form,"guide_id");
  const path=`/control-guias/${encodeURIComponent(id)}`;
  try{await updateMaterialGuide(actor,id,fields(form,header));}
  catch(error){return {error:message(error),values:materialGuideDraft("header",form)};}
  revalidatePath("/","layout");
  redirect(`${path}?ok=1&general=1#datos-generales`);
}

export async function linkMaterialSaleInvoiceAction(_previous:GuideFormState,form:FormData):Promise<GuideFormState>{
  const actor=await requireActor(),id=value(form,"guide_id");
  const path=`/control-guias/${encodeURIComponent(id)}`;
  try{await linkMaterialSaleInvoice(actor,id,value(form,"item_id"),fields(form,["invoice_number","issued_on","due_on","total_clp"]));}
  catch(error){return {error:message(error),values:materialGuideDraft("billing",form)};}
  revalidatePath("/","layout");
  redirect(`${path}?ok=1#cobranza`);
}
