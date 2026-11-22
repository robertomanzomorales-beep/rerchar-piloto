"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {randomUUID} from "node:crypto";
import { requireActor, signIn, signOut,type Actor } from "@/lib/auth";
import {
  PilotError, addEvidence, assignService, cancelService, classifyServiceCompany, completeRental, createAsset, createClient, createService, createSite, createUser,getService,
  finishService, handoffService, reportFleetIncident, resolveFleetIncident, saveChecklist, scheduleRental, startService,
} from "@/lib/pilot";
import {updateAsset,updateClient,updateSite,MastersError} from "@/lib/masters";
import {createExternalDriver,PersonnelError} from "@/lib/personnel";
import {setFleetDay,FleetScheduleError} from "@/lib/fleet-schedule";
import {fleetDayContextFromForm,fleetDayDraft,fleetDayHref,type FleetDayFormState} from "@/lib/fleet-day-form-state";
import {reportServiceDay,ServiceDayError} from "@/lib/service-day";
import {evidenceAnchor,evidenceContextFromForm,evidenceDraft,evidenceHref,type EvidenceFormState} from "@/lib/evidence-form-state";
import {serviceDayAnchor,serviceDayContextFromForm,serviceDayHref} from "@/lib/service-day-state";
import type {Company} from "@/lib/companies";
import {requestDraft,type RequestFormState} from "@/lib/request-form-state";
import {serviceOperationAnchors,serviceOperationDraft,type ServiceOperationKind,type ServiceOperationState} from "@/lib/service-operation-state";
import {maintenanceAnchor,maintenanceContextFromForm,maintenanceDraft,maintenanceHref,type MaintenanceFormState} from "@/lib/maintenance-form-state";
import {masterAnchor,masterContextFromForm,masterDraft,masterHref,type MasterFormKind,type MasterFormState} from "@/lib/master-form-state";
import {serviceDriverDraft,serviceDriverHref,type ServiceDriverKind,type ServiceDriverState} from "@/lib/service-driver-state";
import {loginEmail,loginFailureMessage,type LoginState} from "@/lib/login-state";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const servicePath = (id: string) => `/solicitudes/${encodeURIComponent(id)}`;
function message(error: unknown) {
  if (error instanceof PilotError || error instanceof MastersError || error instanceof PersonnelError || error instanceof FleetScheduleError || error instanceof ServiceDayError) return error.message;
  if (error instanceof ZodError) return "Revise los campos obligatorios y sus valores.";
  if (typeof error === "object" && error && "code" in error && error.code === "23505") return "Ya existe un registro con este código, patente o correo.";
  console.error("Error en el piloto", error);
  return "No se pudo guardar el cambio. Revise la información e intente nuevamente.";
}
async function run(path: string, operation: () => Promise<unknown>, success = path): Promise<never> {
  try { await operation(); }
  catch (error) { redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message(error))}`); }
  revalidatePath("/", "layout");
  redirect(`${success}${success.includes("?") ? "&" : "?"}ok=1`);
}

export async function loginAction(_previous:LoginState,form:FormData):Promise<LoginState>{
  const email=loginEmail(form),password=form.get("password");
  try{if(typeof password!=="string"||!await signIn(typeof form.get("email")==="string"?String(form.get("email")):"",password))return {error:loginFailureMessage,email};}
  catch{console.error("No se pudo comprobar el acceso.");return {error:"No fue posible comprobar el acceso en este momento. Intente nuevamente en unos minutos.",email};}
  redirect("/");
}

export async function logoutAction() { await signOut(); redirect("/ingresar"); }

async function runMaster(kind:MasterFormKind,form:FormData,operation:()=>Promise<unknown>):Promise<MasterFormState>{
  try{await operation();}catch(error){return {error:message(error),values:masterDraft(kind,form)};}
  revalidatePath("/","layout");const id=value(form,"id");
  redirect(masterHref(masterContextFromForm(form),masterAnchor(kind,id),{ok:"1",...(id?{formulario:kind,edicion:id}:{})}));
}
export async function createClientAction(_previous:MasterFormState,form: FormData):Promise<MasterFormState> {
  const actor = await requireActor();
  return runMaster("client",form, () => createClient(actor, { name: value(form,"name"), tax_id: value(form,"tax_id"), contact_name: value(form,"contact_name"), email:value(form,"email").trim(), address:value(form,"address") }));
}
export async function createSiteAction(_previous:MasterFormState,form: FormData):Promise<MasterFormState> {
  const actor = await requireActor();
  return runMaster("site",form, () => createSite(actor, { client_id: value(form,"client_id"), name: value(form,"name"), address: value(form,"address") }));
}
export async function createAssetAction(_previous:MasterFormState,form: FormData):Promise<MasterFormState> {
  const actor = await requireActor();
  return runMaster("asset",form, () => createAsset(actor, { code: value(form,"code"), label: value(form,"label"), kind: value(form,"kind"), plate: value(form,"plate") }));
}
export async function updateClientAction(_previous:MasterFormState,form:FormData):Promise<MasterFormState>{
  const actor=await requireActor();
  return runMaster("edit_client",form,()=>updateClient(actor,value(form,"id"),{
    name:value(form,"name"),tax_id:value(form,"tax_id"),contact_name:value(form,"contact_name"),email:value(form,"email").trim(),address:value(form,"address"),
  }));
}
export async function updateSiteAction(_previous:MasterFormState,form:FormData):Promise<MasterFormState>{
  const actor=await requireActor();
  return runMaster("edit_site",form,()=>updateSite(actor,value(form,"id"),{
    name:value(form,"name"),address:value(form,"address"),
  }));
}
export async function updateAssetAction(_previous:MasterFormState,form:FormData):Promise<MasterFormState>{
  const actor=await requireActor();
  return runMaster("edit_asset",form,()=>updateAsset(actor,value(form,"id"),{
    label:value(form,"label"),plate:value(form,"plate"),
  }));
}
async function serviceDriverRegistration(kind:ServiceDriverKind,actor:Actor,form:FormData):Promise<ServiceDriverState>{
  const id=value(form,"id");let created:string;
  try{
    const service=await getService(actor,id);
    if(service.service_type==="arriendo"||!["solicitada","programada"].includes(service.status))throw new PilotError("El servicio cambió de etapa. Revise su estado antes de registrar recursos desde despacho.");
    created=kind==="account"?await createUser(actor,{name:value(form,"name"),email:value(form,"email").trim(),password:value(form,"password"),role:"conductor",client_id:""}):await createExternalDriver(actor,{name:value(form,"name"),tax_id:value(form,"tax_id"),company_name:value(form,"company_name"),phone:value(form,"phone")});
  }catch(error){
    const duplicate=typeof error==="object"&&error&&"code" in error&&error.code==="23505";
    return {error:duplicate?kind==="account"?"Ya existe una cuenta con este correo. Revísela en Usuarios o seleccione el conductor si ya está registrado.":"Ya existe un conductor con este RUT. Revise el selector de conductores o su ficha en Personal.":message(error),values:serviceDriverDraft(kind,form)};
  }
  revalidatePath("/","layout");redirect(serviceDriverHref(id,kind,serviceDayContextFromForm(form),created));
}
export async function createDriverForServiceAction(_previous:ServiceDriverState,form:FormData):Promise<ServiceDriverState>{
  return serviceDriverRegistration("account",await requireActor(),form);
}
export async function createExternalDriverForServiceAction(_previous:ServiceDriverState,form:FormData):Promise<ServiceDriverState>{
  return serviceDriverRegistration("external",await requireActor(),form);
}
export async function createServiceAction(_previous:RequestFormState,form:FormData):Promise<RequestFormState> {
  const actor = await requireActor();
  let id: string;
  try {
    id = await createService(actor, {
      submission_key: value(form,"submission_key"), client_id: value(form,"client_id"), site_id: value(form,"site_id"),
      new_site_name:value(form,"new_site_name"),new_site_address:value(form,"new_site_address"),
      operating_company:value(form,"operating_company"),quote_id:value(form,"quote_id"),material_id:value(form,"material_id"),
      request_category:value(form,"request_category"),service_type: value(form,"service_type"), waste_type: value(form,"waste_type"),
      estimated_kg: value(form,"estimated_kg"), origin: value(form,"origin"), destination: value(form,"destination"),
      rental_from:value(form,"rental_from"),rental_to:value(form,"rental_to"),
      priority: value(form,"priority"), notes: value(form,"notes"),
    });
  } catch (error) {
    return {error:message(error),values:requestDraft(form)};
  }
  revalidatePath("/", "layout");
  redirect(`${servicePath(id)}?ok=1`);
}

export async function classifyServiceCompanyAction(form:FormData) {
  const actor=await requireActor(),id=value(form,"id");
  await run(servicePath(id),()=>classifyServiceCompany(actor,id,value(form,"operating_company")));
}

async function serviceOperation(kind:ServiceOperationKind,id:string,form:FormData,operation:()=>Promise<unknown>):Promise<ServiceOperationState>{
  try{await operation();}
  catch(error){return {error:message(error),values:serviceOperationDraft(kind,form)};}
  revalidatePath("/","layout");
  if(kind==="day")redirect(serviceDayHref(id,{...serviceDayContextFromForm(form),parte:value(form,"day"),nuevo_parte:undefined},serviceDayAnchor(value(form,"day")),{ok:"1"}));
  const anchor=kind==="finish"?"cierre":kind==="cancel"?"":serviceOperationAnchors[kind];
  redirect(`${servicePath(id)}?ok=1${anchor?"#"+anchor:""}`);
}
export async function scheduleRentalAction(_previous:ServiceOperationState,form:FormData):Promise<ServiceOperationState>{
  const actor=await requireActor(),id=value(form,"id");
  return serviceOperation("rental",id,form,()=>scheduleRental(actor,id,{asset_id:value(form,"asset_id")}));
}
export async function completeRentalAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id");
  await run(servicePath(id),()=>completeRental(actor,id));
}

export async function assignServiceAction(_previous:ServiceOperationState,form:FormData):Promise<ServiceOperationState> {
  const actor = await requireActor(); const id = value(form,"id");
  const selection=value(form,"driver_selection");
  return serviceOperation("plan",id,form,() => assignService(actor, id, {
    asset_id: value(form,"asset_id"), ramp_asset_id: value(form,"ramp_asset_id"),
    driver_id: selection.startsWith("cuenta:")?selection.slice(7):"",
    external_driver_id:selection.startsWith("tercero:")?selection.slice(8):"",
    scheduled_for: value(form,"scheduled_for"),
  }));
}
export async function setFleetDayAction(_previous:FleetDayFormState,form:FormData):Promise<FleetDayFormState>{
  const actor=await requireActor();
  const context=fleetDayContextFromForm(form);
  try{
    await setFleetDay(actor,{asset_id:value(form,"asset_id"),day:value(form,"day"),kind:value(form,"kind"),detail:value(form,"detail")});
  }catch(error){return {error:message(error),values:fleetDayDraft(form)};}
  revalidatePath("/agenda");
  redirect(fleetDayHref(context,randomUUID()));
}
export async function reportServiceDayAction(_previous:ServiceOperationState,form:FormData):Promise<ServiceOperationState>{
  const actor=await requireActor(),id=value(form,"id");
  return serviceOperation("day",id,form,()=>reportServiceDay(actor,id,{
    day:value(form,"day"),outcome:value(form,"outcome"),observation:value(form,"observation").replace(/\r\n?/g,"\n"),expected_revision:value(form,"expected_revision"),
  },value(form,"parte_empresa")?value(form,"parte_empresa") as Company:undefined));
}
export async function cancelServiceAction(_previous:ServiceOperationState,form:FormData):Promise<ServiceOperationState> {
  const actor = await requireActor(); const id = value(form,"id");
  return serviceOperation("cancel",id,form,() => cancelService(actor, id, value(form,"reason")));
}
async function fleetOperation(kind:"report"|"resolve",form:FormData,operation:()=>Promise<unknown>):Promise<MaintenanceFormState>{
  try{await operation();}catch(error){return {error:message(error),values:maintenanceDraft(kind,form)};}
  revalidatePath("/","layout");
  redirect(maintenanceHref(maintenanceContextFromForm(form),maintenanceAnchor(kind),{ok:"1"},"fleet"));
}
export async function reportFleetIncidentAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor = await requireActor();
  return fleetOperation("report",form, () => reportFleetIncident(actor, {
    asset_id: value(form,"asset_id"), description: value(form,"description"), severity: value(form,"severity"),observed_on:value(form,"observed_on"),
  }));
}
export async function resolveFleetIncidentAction(_previous:MaintenanceFormState,form:FormData):Promise<MaintenanceFormState> {
  const actor = await requireActor();
  return fleetOperation("resolve",form, () => resolveFleetIncident(actor, value(form,"id"), value(form,"resolution")));
}
export async function saveChecklistAction(_previous:ServiceOperationState,form:FormData):Promise<ServiceOperationState> {
  const actor = await requireActor(); const id = value(form,"id");
  return serviceOperation("checklist",id,form,() => saveChecklist(actor, id, {
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
export async function finishServiceAction(_previous:ServiceOperationState,form:FormData):Promise<ServiceOperationState> {
  const actor = await requireActor(); const id = value(form,"id");
  return serviceOperation("finish",id,form,() => finishService(actor, id, {
    gross_kg: value(form,"gross_kg"), tare_kg: value(form,"tare_kg"), guide_number: value(form,"guide_number"),
    confirm_guide:form.get("confirm_guide")==="on",confirm_sheet:form.get("confirm_sheet")==="on",
    confirm_ticket:form.get("confirm_ticket")==="on",confirm_material:form.get("confirm_material")==="on",
    confirm_weight:form.get("confirm_weight")==="on",confirm_impurities:form.get("confirm_impurities")==="on",
    material_name:value(form,"material_name"),impurity_kg:value(form,"impurity_kg"),
    missing_ticket_reason:value(form,"missing_ticket_reason"),review_note:value(form,"review_note"),
  }));
}
export async function addEvidenceAction(_previous:EvidenceFormState,form:FormData):Promise<EvidenceFormState> {
  const actor=await requireActor(),id=value(form,"id"),file=form.get("file");let created:string;
  try{created=await addEvidence(actor,id,value(form,"description").replace(/\r\n?/g,"\n"),file as File,value(form,"document_kind")||"evidencia",{submissionKey:value(form,"submission_key"),company:value(form,"documento_empresa")?value(form,"documento_empresa") as Company:undefined});}
  catch(error){return {error:message(error),values:evidenceDraft(form),filename:file&&typeof file!=="string"?file.name.slice(0,160):undefined};}
  revalidatePath("/","layout");redirect(evidenceHref(id,evidenceContextFromForm(form),evidenceAnchor(created),{ok:"1",archivo:created}));
}
