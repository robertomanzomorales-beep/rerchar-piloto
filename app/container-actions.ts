"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import { ContainerError, createContainer, moveContainer,recordContainerService,uploadServiceContainerPhoto } from "@/lib/containers";
import {containerAnchors,containerContextFromForm,containerDraft,containerHref,type ContainerFormKind,type ContainerFormState} from "@/lib/container-form-state";

const value=(form:FormData,key:string)=>String(form.get(key)??"").replace(/\r\n?/g,"\n");
function message(error:unknown) {
  if (error instanceof ContainerError) return error.message;
  if (error instanceof ZodError) return "Revise los campos obligatorios, las fechas y los límites indicados en el formulario.";
  if (typeof error==="object" && error && "code" in error && error.code==="23505") return "Este código ya pertenece a otra unidad.";
  console.error("Error en contenedores",error);
  return "No fue posible registrar la unidad o el movimiento.";
}
async function run(kind:ContainerFormKind,form:FormData,operation:()=>Promise<unknown>):Promise<ContainerFormState> {
  try { await operation(); }
  catch(error) {
    const values=containerDraft(kind,form),file=form.get("installation_photo");
    const hasPhoto=kind==="move"&&values.omit_photo!=="on"&&["instalar","reubicar"].includes(values.action??"")&&file instanceof File&&file.size>0;
    if(hasPhoto)values.photo_retry="on";
    return {error:message(error),values,...(hasPhoto?{photoName:file.name.replace(/[\x00-\x1f\x7f]/g,"_").slice(0,160)}:{})};
  }
  revalidatePath("/","layout");
  redirect(containerHref(containerContextFromForm(form),containerAnchors[kind],{ok:"1"}));
}
export async function createContainerAction(_previous:ContainerFormState,form:FormData):Promise<ContainerFormState> {
  const actor=await requireActor();
  return run("create",form,()=>createContainer(actor,{code:value(form,"code"),kind:value(form,"kind"),capacity_m3:value(form,"capacity_m3"),
    location_name:value(form,"location_name"),max_stay_days:value(form,"max_stay_days")}));
}
export async function moveContainerAction(_previous:ContainerFormState,form:FormData):Promise<ContainerFormState> {
  const actor=await requireActor();
  return run("move",form,async()=>{
    const file=form.get("installation_photo"),omit=value(form,"omit_photo")==="on";
    if(value(form,"photo_retry")==="on"&&!omit&&["instalar","reubicar"].includes(value(form,"action"))&&(!(file instanceof File)||!file.size))
      throw new ContainerError("Vuelva a seleccionar la foto o elija expresamente continuar sin ella.");
    await moveContainer(actor,value(form,"container_id"),{action:value(form,"action"),site_id:value(form,"site_id"),
      service_id:value(form,"service_id"),location_name:value(form,"location_name"),waste_type:value(form,"waste_type"),note:value(form,"note")},
      !omit&&file instanceof File?file:null);
  });
}
export async function recordContainerServiceAction(_previous:ContainerFormState,form:FormData):Promise<ContainerFormState>{
  const actor=await requireActor();
  return run("record",form,()=>recordContainerService(actor,{container_id:value(form,"container_id"),service_id:value(form,"service_id"),kind:value(form,"kind"),
    record_date:value(form,"record_date"),kilometers:value(form,"kilometers"),description:value(form,"description"),cost_clp:value(form,"cost_clp"),
    mark_out_of_service:value(form,"mark_out_of_service")==="on",workshop_location:value(form,"workshop_location")}));
}
export async function uploadServiceContainerPhotoAction(form:FormData){
  const actor=await requireActor(),serviceId=value(form,"service_id");
  const path=/^[0-9a-f-]{36}$/i.test(serviceId)?`/solicitudes/${serviceId}`:"/solicitudes";
  try{
    const file=form.get("installation_photo");
    if(!(file instanceof File))throw new ContainerError("Seleccione una foto de instalación.");
    await uploadServiceContainerPhoto(actor,serviceId,value(form,"container_id"),file);
  }catch(error){redirect(`${path}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath(path);
  revalidatePath("/contenedores");
  redirect(`${path}?ok=1`);
}
