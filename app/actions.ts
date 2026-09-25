"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActor, signIn, signOut } from "@/lib/auth";
import {
  PilotError, addEvidence, assignService, cancelService, createAsset, createClient, createService, createSite, createUser,
  finishService, reportFleetIncident, resolveFleetIncident, saveChecklist, startService,
} from "@/lib/pilot";
import {updateAsset,updateClient,updateSite,MastersError} from "@/lib/masters";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const servicePath = (id: string) => `/solicitudes/${encodeURIComponent(id)}`;
function message(error: unknown) {
  if (error instanceof PilotError || error instanceof MastersError) return error.message;
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
  await run("/maestros", () => createClient(actor, { name: value(form,"name"), tax_id: value(form,"tax_id"), contact_name: value(form,"contact_name") }));
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
    name:value(form,"name"),tax_id:value(form,"tax_id"),contact_name:value(form,"contact_name"),
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
export async function createServiceAction(form: FormData) {
  const actor = await requireActor();
  let id: string;
  try {
    id = await createService(actor, {
      submission_key: value(form,"submission_key"), client_id: value(form,"client_id"), site_id: value(form,"site_id"),
      service_type: value(form,"service_type"), waste_type: value(form,"waste_type"),
      estimated_kg: value(form,"estimated_kg"), origin: value(form,"origin"), destination: value(form,"destination"),
      priority: value(form,"priority"), notes: value(form,"notes"),
    });
  } catch (error) { redirect(`/solicitudes/nueva?error=${encodeURIComponent(message(error))}`); }
  revalidatePath("/", "layout");
  redirect(`${servicePath(id)}?ok=1`);
}

export async function assignServiceAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  await run(servicePath(id), () => assignService(actor, id, {
    asset_id: value(form,"asset_id"), ramp_asset_id: value(form,"ramp_asset_id"), driver_id: value(form,"driver_id"),
    scheduled_for: value(form,"scheduled_for"), guide_number: value(form,"guide_number"),
  }));
}
export async function cancelServiceAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  await run(servicePath(id), () => cancelService(actor, id, value(form,"reason")));
}
export async function reportFleetIncidentAction(form: FormData) {
  const actor = await requireActor();
  await run("/flota", () => reportFleetIncident(actor, {
    asset_id: value(form,"asset_id"), description: value(form,"description"), severity: value(form,"severity"),
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
    comment: value(form,"comment"),
  }));
}
export async function startServiceAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  await run(servicePath(id), () => startService(actor, id));
}
export async function finishServiceAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  await run(servicePath(id), () => finishService(actor, id, {
    gross_kg: value(form,"gross_kg"), tare_kg: value(form,"tare_kg"), guide_number: value(form,"guide_number"),
  }));
}
export async function addEvidenceAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"id");
  await run(servicePath(id), () => addEvidence(actor, id, value(form,"description"), form.get("file") as File));
}
