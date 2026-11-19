"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import {
  ContinuityError, cancelWorkOrder, closeWorkOrder, createHourMaintenancePlan, createMaintenancePlan, createTire, createWorkOrder,
  moveTire, recordAssetReading, registerFuel, reserveForWorkOrder, setAssetDetails, startWorkOrder,
} from "@/lib/continuity";
import {maintenanceAnchor,maintenanceContextFromForm,maintenanceDraft,maintenanceHref,type MaintenanceFormKind,type MaintenanceFormState} from "@/lib/maintenance-form-state";

const value = (form:FormData,key:string) => String(form.get(key)??"");
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

async function maintain(kind:MaintenanceFormKind,form:FormData,operation:()=>Promise<unknown>,scope="maintenance",createdOrder=false):Promise<MaintenanceFormState>{
  let result:unknown;
  try{result=await operation();}catch(error){return {error:message(error),values:maintenanceDraft(kind,form)};}
  revalidatePath("/","layout");
  const anchor=createdOrder||kind==="cancel"?"trabajo-registrado":kind==="start"?"cierre-orden":maintenanceAnchor(kind,value(form,"source_id"));
  redirect(maintenanceHref(maintenanceContextFromForm(form),anchor,{ok:"1"},createdOrder?String(result):scope));
}
export async function updateAssetAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor();
  return maintain("asset",form,()=>setAssetDetails(actor,value(form,"asset_id"),{
    brand:value(form,"brand"),model:value(form,"model"),model_year:value(form,"model_year"),reading_unit:value(form,"reading_unit"),
  }));
}
export async function recordReadingAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor();
  return maintain("reading",form,()=>recordAssetReading(actor,value(form,"asset_id"),{reading:value(form,"reading"),note:value(form,"note")}));
}
export async function createPlanAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor();
  return maintain("plan",form,()=>createMaintenancePlan(actor,{
    asset_id:value(form,"asset_id"),title:value(form,"title"),frequency_kind:value(form,"frequency_kind"),
    interval_days:value(form,"interval_days"),next_due_date:value(form,"next_due_date"),
    interval_reading:value(form,"interval_reading"),next_due_reading:value(form,"next_due_reading"),
    lead_days:value(form,"lead_days"),lead_reading:value(form,"lead_reading"),
  }));
}
export async function createHourPlanAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor();
  return maintain("hour_plan",form,()=>createHourMaintenancePlan(actor,{
    asset_id:value(form,"asset_id"),template_key:value(form,"template_key"),
    next_due_reading:value(form,"next_due_reading"),lead_reading:value(form,"lead_reading"),
  }));
}
export async function createWorkOrderAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor();
  return maintain("order",form,()=>createWorkOrder(actor,{
      asset_id:value(form,"asset_id"),plan_id:value(form,"plan_id"),incident_id:value(form,"incident_id"),kind:value(form,"kind"),
      title:value(form,"title"),description:value(form,"description"),scheduled_for:value(form,"scheduled_for"),blocks_asset:form.get("blocks_asset")==="on",
    }),"maintenance",true);
}
export async function startWorkOrderAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor(); const id=value(form,"order_id");
  return maintain("start",form,()=>startWorkOrder(actor,id),id);
}
export async function reserveWorkOrderAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor(); const id=value(form,"order_id");
  return maintain("reserve",form,()=>reserveForWorkOrder(actor,id,{
    item_id:value(form,"item_id"),warehouse_id:value(form,"warehouse_id"),quantity:value(form,"quantity"),reason:value(form,"reason"),
  }),id);
}
export async function closeWorkOrderAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor(); const id=value(form,"order_id");
  return maintain("close",form,()=>closeWorkOrder(actor,id,{
    resolution:value(form,"resolution"),supplier:value(form,"supplier"),labor_cost:value(form,"labor_cost"),
    parts_cost:value(form,"parts_cost"),reading:value(form,"reading"),
  }),id);
}
export async function cancelWorkOrderAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor(); const id=value(form,"order_id");
  return maintain("cancel",form,()=>cancelWorkOrder(actor,id,value(form,"reason")),id);
}
export async function registerFuelAction(form:FormData) {
  const actor=await requireActor();
  await run("/combustible",()=>registerFuel(actor,{
    submission_key:value(form,"submission_key"),asset_id:value(form,"asset_id"),driver_id:value(form,"driver_id"),service_id:value(form,"service_id"),
    fuel_date:value(form,"fuel_date"),liters:value(form,"liters"),cost_clp:value(form,"cost_clp"),reading:value(form,"reading"),
    full_tank:form.get("full_tank")==="on",supplier:value(form,"supplier"),receipt_number:value(form,"receipt_number"),notes:value(form,"notes"),
  }));
}
export async function createTireAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor();
  return maintain("tire",form,()=>createTire(actor,{code:value(form,"code"),brand:value(form,"brand"),size:value(form,"size"),warehouse_id:value(form,"warehouse_id")}));
}
export async function moveTireAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor=await requireActor();
  return maintain("move_tire",form,()=>moveTire(actor,value(form,"tire_id"),{
    action:value(form,"action"),asset_id:value(form,"asset_id"),position:value(form,"position"),reason:value(form,"reason"),warehouse_id:value(form,"warehouse_id"),
  }));
}
