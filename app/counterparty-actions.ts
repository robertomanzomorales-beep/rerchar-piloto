"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {CounterpartyError,saveCounterparty,uploadCounterpartyDocument,verifyCounterparty} from "@/lib/counterparties";
import {counterpartyFields,counterpartyAreas,counterpartyDraft,counterpartyContext,counterpartyHref,type CounterpartyFormState} from "@/lib/counterparty-form-state";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown){
  if(error instanceof CounterpartyError)return error.message;
  if(error instanceof ZodError)return "Revise RUT, correos, campos obligatorios y datos bancarios.";
  if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="23505")return "Ya existe una ficha para este RUT o cliente.";
  console.error("Ficha cliente/proveedor",error);return "No fue posible guardar la ficha.";
}
export async function saveCounterpartyAction(_previous:CounterpartyFormState,form:FormData){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const contacts=counterpartyAreas.map(area=>({area,
    name:value(form,`${area}_name`),role:value(form,`${area}_role`),phone:value(form,`${area}_phone`),
    email:value(form,`${area}_email`)}));
  let id:string;
  try{id=await saveCounterparty(actor,{...Object.fromEntries(counterpartyFields.map(key=>[key,value(form,key)])),contacts});}
  catch(error){return counterpartyDraft(form,message(error));}
  revalidatePath("/","layout");redirect(counterpartyHref(counterpartyContext({pagina:form.get("pagina")}),id,{ok:"1"}));
}
export async function uploadCounterpartyDocumentAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id"),context=counterpartyContext({pagina:form.get("pagina")});
  try{await uploadCounterpartyDocument(actor,id,value(form,"kind"),form.get("file") as File);}
  catch(error){redirect(counterpartyHref(context,id,{error:message(error)}));}
  revalidatePath("/","layout");redirect(counterpartyHref(context,id,{ok:"1"}));
}
export async function verifyCounterpartyAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id"),context=counterpartyContext({pagina:form.get("pagina")});
  try{await verifyCounterparty(actor,id);}catch(error){redirect(counterpartyHref(context,id,{error:message(error)}));}
  revalidatePath("/","layout");redirect(counterpartyHref(context,id,{ok:"1"}));
}
