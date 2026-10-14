"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {PaymentCalendarError,createBillingCycle,updateBillingCycle,linkBillingStatement} from "@/lib/payment-calendar";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown){
  if(error instanceof PaymentCalendarError)return error.message;
  if(error instanceof ZodError)return "Revise período, fechas y correo de contacto.";
  if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="23505")return "El período ya existe.";
  console.error("Agenda EDP",error);return "No fue posible guardar el calendario.";
}
const data=(form:FormData)=>({period_from:value(form,"period_from"),period_to:value(form,"period_to"),
  cutoff_on:value(form,"cutoff_on"),send_on:value(form,"send_on"),contact_email:value(form,"contact_email"),notes:value(form,"notes")});
async function run(path:string,fn:()=>Promise<unknown>):Promise<never>{
  try{await fn();}catch(error){redirect(`${path}?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`${path}?ok=1`);
}
export async function createBillingCycleAction(form:FormData){
  const actor=await requireActor();let id:string;
  try{id=await createBillingCycle(actor,{...data(form),client_id:value(form,"client_id"),statement_type:value(form,"statement_type")});}
  catch(error){redirect(`/estados-pago/calendario?error=${encodeURIComponent(message(error))}`);}
  revalidatePath("/","layout");redirect(`/estados-pago/calendario/${id}?ok=1`);
}
export async function updateBillingCycleAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id"),path=`/estados-pago/calendario/${encodeURIComponent(id)}`;
  await run(path,()=>updateBillingCycle(actor,id,data(form)));
}
export async function linkBillingStatementAction(form:FormData){
  const actor=await requireActor(),id=value(form,"id"),path=`/estados-pago/calendario/${encodeURIComponent(id)}`;
  await run(path,()=>linkBillingStatement(actor,id,value(form,"statement_id")));
}
