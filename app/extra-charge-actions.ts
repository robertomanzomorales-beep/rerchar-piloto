"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {ExtraChargeError,proposeExtraCharge,decideExtraCharge,invoiceExtraCharge} from "@/lib/extra-charges";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
const servicePath=(id:string)=>`/solicitudes/${encodeURIComponent(id)}`;
const boardPath=(company:string)=>`/cobros-extraordinarios?empresa=${company==="e_y_j"?"e_y_j":"rerchar"}`;
async function run(path:string,action:()=>Promise<unknown>):Promise<never>{
  const separator=path.includes("?")?"&":"?";
  try{await action();}catch(error){
    const message=error instanceof ExtraChargeError?error.message:error instanceof ZodError?"Revise el día, concepto, monto y referencias.":"No fue posible guardar el cargo.";
    if(!(error instanceof ExtraChargeError||error instanceof ZodError))console.error("Cargo extraordinario",error);
    redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/","layout");
  redirect(`${path}${separator}ok=1`);
}
export async function proposeExtraChargeAction(form:FormData){
  const actor=await requireActor(),serviceId=value(form,"service_id");
  await run(servicePath(serviceId),()=>proposeExtraCharge(actor,serviceId,{
    submission_key:value(form,"submission_key"),service_day:value(form,"service_day"),kind:value(form,"kind"),
    reason:value(form,"reason"),amount_clp:value(form,"amount_clp"),quote_reference:value(form,"quote_reference"),
    client_order_reference:value(form,"client_order_reference"),
  }));
}
export async function decideExtraChargeAction(form:FormData){
  const actor=await requireActor();
  await run(boardPath(value(form,"company")),()=>decideExtraCharge(actor,value(form,"id"),{
    status:value(form,"status"),decision_note:value(form,"decision_note"),amount_clp:value(form,"amount_clp"),
  }));
}
export async function invoiceExtraChargeAction(form:FormData){
  const actor=await requireActor();
  await run(boardPath(value(form,"company")),()=>invoiceExtraCharge(actor,value(form,"id"),{
    invoice_number:value(form,"invoice_number"),invoiced_on:value(form,"invoiced_on"),due_on:value(form,"due_on"),total_clp:value(form,"total_clp"),
  }));
}
