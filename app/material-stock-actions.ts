"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {MaterialStockError,linkReceiptMaterial,postReceiptToMaterialStock,recordMaterialStockAdjustment} from "@/lib/material-stock";

const val=(form:FormData,key:string)=>String(form.get(key)??"");
function errorText(error:unknown){
  if(error instanceof MaterialStockError)return error.message;
  if(error instanceof ZodError)return "Revise material, cantidad, fecha, referencia y motivo.";
  console.error("Movimiento de material",error);
  return "No fue posible registrar el movimiento. Revise los datos.";
}
async function run(path:string,fn:()=>Promise<unknown>):Promise<never>{
  try{await fn();}catch(error){redirect(`${path}?error=${encodeURIComponent(errorText(error))}`);}
  revalidatePath("/","layout");redirect(`${path}?ok=1`);
}
export async function adjustMaterialStockAction(form:FormData){
  const actor=await requireActor();
  await run("/materiales-stock",()=>recordMaterialStockAdjustment(actor,Object.fromEntries(
    ["material_id","kind","quantity_kg","occurred_on","reference","reason"].map(key=>[key,val(form,key)]))));
}
export async function linkReceiptMaterialAction(form:FormData){
  const actor=await requireActor(),id=val(form,"receipt_id");
  await run(`/ingresos/${encodeURIComponent(id)}`,()=>linkReceiptMaterial(actor,id,val(form,"material_id")));
}
export async function postReceiptMaterialAction(form:FormData){
  const actor=await requireActor(),id=val(form,"receipt_id");
  await run(`/ingresos/${encodeURIComponent(id)}`,()=>postReceiptToMaterialStock(actor,id));
}
