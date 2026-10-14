"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActor, signIn, signOut } from "@/lib/auth";
import {
  PilotError, addEvidence, assignService, cancelService, classifyServiceCompany, completeRental, createAsset, createClient, createService, createSite, createUser,
  finishService, handoffService, reportFleetIncident, resolveFleetIncident, saveChecklist, scheduleRental, startService,
} from "@/lib/pilot";
import {updateAsset,updateClient,updateSite,MastersError} from "@/lib/masters";
import {createExternalDriver,PersonnelError} from "@/lib/personnel";
import {setFleetDay,FleetScheduleError} from "@/lib/fleet-schedule";
import {reportServiceDay,ServiceDayError} from "@/lib/service-day";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const servicePath = (id: string) => `/solicitudes/${encodeURIComponent(id)}`;
function message(error: unknown) {
  if (error instanceof PilotError || error instanceof MastersError || error instanceof PersonnelError || error instanceof FleetScheduleError || error instanceof ServiceDayError) return error.message;
  if (error instanceof ZodError) return "Revise los campos obligatorios y sus valores.";
  if (typeof error === "object" && error && "code" in error && error.code === "23505") return "Ya existe un registro con este código o correo.";
  console.error("Error en el piloto", error);
  return "No se pudo guardar el cambio. Revise la información e intente nuevamente.";
}
async function run(path: string, operation: () => Promise<unknown>, success = path): Promise<never> {
  try { await operation(); }
  catch (error) { redirect(`${path}?error=${encodeURIComponent(message(error))}`); }
  revalidatePath("/", "layout");
  redirect(`${success}${success.includes("?") ? "&" : "?"}ok=1`);
}

export async function loginAction(form: FormData) {
  const email = value(form, "email");
  const password = value(form, "password");
  const success = await signIn(email, password);
  if (!success) redirect("/ingresar?error=1");
  redirect("/");
}

export async function logoutAction() { await signOut(); redirect("/ingresar"); }

export async function createClientAction(form: FormData) {
  const actor = await requireActor();
  await run("/maestros", () => createClient(actor, { name: value(form,"name"), tax_id: value(form,"tax_id"), contact_name: value(form,"contact_name"), email:value(form,"email"), address:value(form,"address") }));
}
export async function createSiteAction(form: FormData) {
  const actor = await requireActor();
  await run("/maestros", () => createSite(actor, { client_id: value(form,"client_id"), name: value(form,"name"), address: value(form,"address") }));
}
export async function createAssetAction(form: FormData) {
  const actor = await requireActor();
  await run("/maestros", () => createAsset(actor, { code: value(form,"code"), label: value(form,"label"), kind: value(form,"kind"), plate: value(form,"plate") }));
}
export async function updateClientAction(form:FormData){
  const actor=await requireActor();
  await run("/maestros",()=>updateClient(actor,value(form,"id"),{
    name:value(form,"name"),tax_id:value(form,"tax_id"),contact_name:value(form,"contact_name"),email:value(form,"email"),address:value(form,"address"),
  }));
}
export async function updateSiteAction(form:FormData){
  const actor=await requireActor();
  await run("/maestros",()=>updateSite(actor,value(form,"id"),{
    name:value(form,"name"),address:value(form,"address"),
  }));
}
export async function updateAssetAction(form:FormData){
  const actor=await requireActor();
  await run("/maestros",()=>updateAsset(actor,value(form,"id"),{
    label:value(form,"label"),plate:value(form,"plate"),
  }));
}
export async function createDriverForServiceAction(form: FormData) {
  const actor = await requireActor();
  const id = value(form, "id");
  await run(servicePath(id), () => createUser(actor, {
    name: value(form, "name"), email: value(form, "email"), password: value(form, "password"),
    role: "conductor", client_id: "",
  }));
}
export async function createExternalDriverForServiceAction(form: FormData) {
  const actor=await requireActor(),id=value(form,"id");
  await run(servicePath(id),()=>createExternalDriver(actor,{
    name:value(form,"name"),tax_id:value(form,"tax_id"),company_name:value(form,"company_name"),phone:value(form,"phone"),
  }));
}
export async function createServiceAction(form: FormData) {
  const actor = await requireActor();
  let id: string;
  try {
    id = await createService(actor, {
      submission_key: value(form,"submission_key"), client_id: value(form,"client_id"), site_id: value(form,"site_id"),
      operating_company:value(form,"operating_company"),quote_id:value(form,"quote_id"),material_id:value(form,"material_id"),
      request_category:value(form,"request_category"),service_type: value(form,"service_type"), waste_type: value(form,"waste_type"),
      estimated_kg: value(form,"estimated_kg"), origin: value(form,"origin"), destination: value(form,"destination"),
      rental_from:value(form,"rental_from"),rental_to:value(form,"rental_to"),
      priority: value(form,"priority"), notes: value(form,"notes"),
    });
  } catch (error) {
    const params=new URLSearchParams({error:message(error)});
    if(value(form,"quote_id"))params.set("cotizacion",value(form,"quote_id"));
    params.set("tipo",value(form,"service_type"));
    redirect(`/solicitudes/nueva?${params.toString()}`);
  }
  revalidatePath("/", "layout");
  redirect(`${servicePath(id)}?ok=1`);
}

export async function classifyServiceCompanyAction(form:FormData) {
  const actor=await requireActor(),id=value(form,"id");
  await run(servicePath(id),()=>classifyServiceCompany(actor,id,value(form,"operating_company")));
}

export async function scheduleRentalAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id");
  await run(servicePath(id),()=>scheduleRental(actor,id,{asset_id:value(form,"asset_id")}));
}
export async function completeRentalAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id");
  await run(servicePath(id),()=>completeRental(actor,id));
}

export async function assignServiceAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  const selection=value(form,"driver_selection");
  await run(servicePath(id), () => assignService(actor, id, {
    asset_id: value(form,"asset_id"), ramp_asset_id: value(form,"ramp_asset_id"),
    driver_id: selection.startsWith("cuenta:")?selection.slice(7):"",
    external_driver_id:selection.startsWith("tercero:")?selection.slice(8):"",
    scheduled_for: value(form,"scheduled_for"),
  }));
}
export async function setFleetDayAction(form:FormData){
  const actor=await requireActor();
  const start=value(form,"inicio"),company=value(form,"empresa");
  const qs=new URLSearchParams();
  if(/^\d{4}-\d{2}-\d{2}$/.test(start))qs.set("inicio",start);
  if(company==="rerchar"||company==="e_y_j")qs.set("empresa",company);
  const target=`/agenda?${qs.toString()}`;
  try{
    await setFleetDay(actor,{asset_id:value(form,"asset_id"),day:value(form,"day"),kind:value(form,"kind"),detail:value(form,"detail")});
  }catch(error){qs.set("error",message(error));redirect(`/agenda?${qs.toString()}`);}
  revalidatePath("/agenda");
  qs.set("ok","1");redirect(`/agenda?${qs.toString()}`);
}
export async function reportServiceDayAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id");
  await run(servicePath(id),()=>reportServiceDay(actor,id,{
    day:value(form,"day"),outcome:value(form,"outcome"),observation:value(form,"observation"),
  }));
}
export async function cancelServiceAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  await run(servicePath(id), () => cancelService(actor, id, value(form,"reason")));
}
export async function reportFleetIncidentAction(form: FormData) {
  const actor = await requireActor();
  await run("/flota", () => reportFleetIncident(actor, {
    asset_id: value(form,"asset_id"), description: value(form,"description"), severity: value(form,"severity"),observed_on:value(form,"observed_on"),
  }));
}
export async function resolveFleetIncidentAction(form: FormData) {
  const actor = await requireActor();
  await run("/flota", () => resolveFleetIncident(actor, value(form,"id"), value(form,"resolution")));
}
export async function saveChecklistAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  await run(servicePath(id), () => saveChecklist(actor, id, {
    vehicle_ok: form.get("vehicle_ok") === "on", documents_ok: form.get("documents_ok") === "on",
    containment_ok: form.get("containment_ok") === "on", ppe_ok: form.get("ppe_ok") === "on",
    vehicle_failure: form.get("vehicle_failure") === "on",
    comment: value(form,"comment"),
  }));
}
export async function startServiceAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  await run(servicePath(id), () => startService(actor, id));
}
export async function handoffServiceAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id");
  await run(servicePath(id),()=>handoffService(actor,id));
}
export async function finishServiceAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  await run(servicePath(id), () => finishService(actor, id, {
    gross_kg: value(form,"gross_kg"), tare_kg: value(form,"tare_kg"), guide_number: value(form,"guide_number"),
  }));
}
export async function addEvidenceAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  await run(servicePath(id), () => addEvidence(actor, id, value(form,"description"), form.get("file") as File,value(form,"document_kind")||"evidencia"));
}
