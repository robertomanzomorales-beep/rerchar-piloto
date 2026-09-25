"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import {
  ContinuityError, cancelWorkOrder, closeWorkOrder, createMaintenancePlan, createTire, createWorkOrder,
  moveTire, recordAssetReading, registerFuel, reserveForWorkOrder, setAssetDetails, startWorkOrder,
} from "@/lib/continuity";

const value = (form:FormData,key:string) => String(form.get(key)??"");
const orderPath = (id:string) => `/mantenimiento/${encodeURIComponent(id)}`;
function message(error:unknown) {
  if (error instanceof ContinuityError) return error.message;
  if (error instanceof ZodError) return "Revise los campos, fechas, lecturas y cantidades ingresadas.";
  if (typeof error==="object" && error && "code" in error && error.code==="23505") return "Ya existe un registro con este código, posición o plan activo.";
  console.error("Error en continuidad operacional",error);
  return "No se pudo registrar el cambio. Revise los datos e intente nuevamente.";
}
async function run(path:string,operation:()=>Promise<unknown>):Promise<never> {
  try { await operation(); }
  catch (error) { redirect(`${path}?error=${encodeURIComponent(message(error))}`); }
  revalidatePath("/","layout");
  redirect(`${path}?ok=1`);
}

export async function updateAssetAction(form:FormData) {
  const actor=await requireActor();
  await run("/mantenimiento",()=>setAssetDetails(actor,value(form,"asset_id"),{
    brand:value(form,"brand"),model:value(form,"model"),model_year:value(form,"model_year"),reading_unit:value(form,"reading_unit"),
  }));
}
export async function recordReadingAction(form:FormData) {
  const actor=await requireActor();
  await run("/mantenimiento",()=>recordAssetReading(actor,value(form,"asset_id"),{reading:value(form,"reading"),note:value(form,"note")}));
}
export async function createPlanAction(form:FormData) {
  const actor=await requireActor();
  await run("/mantenimiento",()=>createMaintenancePlan(actor,{
    asset_id:value(form,"asset_id"),title:value(form,"title"),frequency_kind:value(form,"frequency_kind"),
    interval_days:value(form,"interval_days"),next_due_date:value(form,"next_due_date"),
    interval_reading:value(form,"interval_reading"),next_due_reading:value(form,"next_due_reading"),
    lead_days:value(form,"lead_days"),lead_reading:value(form,"lead_reading"),
  }));
}
export async function createWorkOrderAction(form:FormData) {
  const actor=await requireActor();
  let id:string;
  try {
    id=await createWorkOrder(actor,{
      asset_id:value(form,"asset_id"),plan_id:value(form,"plan_id"),incident_id:value(form,"incident_id"),kind:value(form,"kind"),
      title:value(form,"title"),description:value(form,"description"),scheduled_for:value(form,"scheduled_for"),blocks_asset:form.get("blocks_asset")==="on",
    });
  } catch (error) { redirect(`/mantenimiento?error=${encodeURIComponent(message(error))}`); }
  revalidatePath("/","layout");
  redirect(`${orderPath(id)}?ok=1`);
}
export async function startWorkOrderAction(form:FormData) {
  const actor=await requireActor(); const id=value(form,"order_id");
  await run(orderPath(id),()=>startWorkOrder(actor,id));
}
export async function reserveWorkOrderAction(form:FormData) {
  const actor=await requireActor(); const id=value(form,"order_id");
  await run(orderPath(id),()=>reserveForWorkOrder(actor,id,{
    item_id:value(form,"item_id"),warehouse_id:value(form,"warehouse_id"),quantity:value(form,"quantity"),reason:value(form,"reason"),
  }));
}
export async function closeWorkOrderAction(form:FormData) {
  const actor=await requireActor(); const id=value(form,"order_id");
  await run(orderPath(id),()=>closeWorkOrder(actor,id,{
    resolution:value(form,"resolution"),supplier:value(form,"supplier"),labor_cost:value(form,"labor_cost"),
    parts_cost:value(form,"parts_cost"),reading:value(form,"reading"),
  }));
}
export async function cancelWorkOrderAction(form:FormData) {
  const actor=await requireActor(); const id=value(form,"order_id");
  await run(orderPath(id),()=>cancelWorkOrder(actor,id,value(form,"reason")));
}
export async function registerFuelAction(form:FormData) {
  const actor=await requireActor();
  await run("/combustible",()=>registerFuel(actor,{
    submission_key:value(form,"submission_key"),asset_id:value(form,"asset_id"),driver_id:value(form,"driver_id"),service_id:value(form,"service_id"),
    fuel_date:value(form,"fuel_date"),liters:value(form,"liters"),cost_clp:value(form,"cost_clp"),reading:value(form,"reading"),
    full_tank:form.get("full_tank")==="on",supplier:value(form,"supplier"),receipt_number:value(form,"receipt_number"),notes:value(form,"notes"),
  }));
}
export async function createTireAction(form:FormData) {
  const actor=await requireActor();
  await run("/mantenimiento",()=>createTire(actor,{code:value(form,"code"),brand:value(form,"brand"),size:value(form,"size")}));
}
export async function moveTireAction(form:FormData) {
  const actor=await requireActor();
  await run("/mantenimiento",()=>moveTire(actor,value(form,"tire_id"),{
    action:value(form,"action"),asset_id:value(form,"asset_id"),position:value(form,"position"),reason:value(form,"reason"),
  }));
}
