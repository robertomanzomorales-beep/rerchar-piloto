"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import { ContainerError, createContainer, moveContainer } from "@/lib/containers";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown) {
  if (error instanceof ContainerError) return error.message;
  if (error instanceof ZodError) return "Revise la capacidad, faena, contenido y motivo del movimiento.";
  if (typeof error==="object" && error && "code" in error && error.code==="23505") return "Este código ya pertenece a otra unidad.";
  console.error("Error en contenedores",error);
  return "No fue posible registrar la unidad o el movimiento.";
}
async function run(operation:()=>Promise<unknown>):Promise<never> {
  try { await operation(); }
  catch(error) { redirect(`/contenedores?error=${encodeURIComponent(message(error))}`); }
  revalidatePath("/","layout");
  redirect("/contenedores?ok=1");
}
export async function createContainerAction(form:FormData) {
  const actor=await requireActor();
  await run(()=>createContainer(actor,{code:value(form,"code"),kind:value(form,"kind"),capacity_m3:value(form,"capacity_m3"),
    location_name:value(form,"location_name"),max_stay_days:value(form,"max_stay_days")}));
}
export async function moveContainerAction(form:FormData) {
  const actor=await requireActor();
  await run(()=>moveContainer(actor,value(form,"container_id"),{action:value(form,"action"),site_id:value(form,"site_id"),
    service_id:value(form,"service_id"),location_name:value(form,"location_name"),waste_type:value(form,"waste_type"),note:value(form,"note")}));
}
