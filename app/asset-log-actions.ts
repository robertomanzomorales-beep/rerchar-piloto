"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import { AssetLogError,addAssetEquipment,recordAssetMaintenance,removeAssetEquipment,updateAssetEquipment } from "@/lib/asset-log";
import { PilotError,reportFleetIncident,resolveFleetIncident } from "@/lib/pilot";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
const path=(id:string)=>`/flota/${encodeURIComponent(id)}`;
function errorMessage(error:unknown) {
  if(error instanceof AssetLogError||error instanceof PilotError) return error.message;
  if(error instanceof ZodError) return "Revise fecha, cantidades y campos requeridos.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505") return "Este elemento ya existe en el inventario del activo.";
  console.error("Ficha del activo",error);
  return "No se pudo guardar el cambio. Revise los datos e intente nuevamente.";
}
async function run(assetId:string,operation:()=>Promise<unknown>):Promise<never> {
  try { await operation(); }
  catch(error) { redirect(`${path(assetId)}?error=${encodeURIComponent(errorMessage(error))}`); }
  revalidatePath("/","layout");
  redirect(`${path(assetId)}?ok=1`);
}

export async function reportAssetIncidentAction(form:FormData) {
  const actor=await requireActor();const assetId=value(form,"asset_id");
  await run(assetId,()=>reportFleetIncident(actor,{asset_id:assetId,severity:value(form,"severity"),
    description:value(form,"description"),observed_on:value(form,"observed_on")}));
}
export async function resolveAssetIncidentAction(form:FormData) {
  const actor=await requireActor();
  await run(value(form,"asset_id"),()=>resolveFleetIncident(actor,value(form,"incident_id"),value(form,"resolution")));
}
export async function addAssetEquipmentAction(form:FormData) {
  const actor=await requireActor();const assetId=value(form,"asset_id");
  await run(assetId,()=>addAssetEquipment(actor,{asset_id:assetId,name:value(form,"name"),quantity:value(form,"quantity"),
    condition:value(form,"condition"),expires_on:value(form,"expires_on"),note:value(form,"note")}));
}
export async function updateAssetEquipmentAction(form:FormData) {
  const actor=await requireActor();
  await run(value(form,"asset_id"),()=>updateAssetEquipment(actor,value(form,"item_id"),{
    quantity:value(form,"quantity"),condition:value(form,"condition"),expires_on:value(form,"expires_on"),note:value(form,"note")}));
}
export async function removeAssetEquipmentAction(form:FormData) {
  const actor=await requireActor();
  await run(value(form,"asset_id"),()=>removeAssetEquipment(actor,value(form,"item_id")));
}
export async function recordAssetMaintenanceAction(form:FormData) {
  const actor=await requireActor();const assetId=value(form,"asset_id");
  await run(assetId,()=>recordAssetMaintenance(actor,{asset_id:assetId,title:value(form,"title"),
    performed_on:value(form,"performed_on"),kind:value(form,"kind"),description:value(form,"description"),reading:value(form,"reading")}));
}
