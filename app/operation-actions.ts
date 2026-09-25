"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {MaterialError,createMaterialReceipt,updateMaterialPayment} from "@/lib/materials";
import {SupplierInvoiceError,createSupplierInvoice,registerSupplierPayment} from "@/lib/supplier-invoices";
import {LedgerError,saveGuideFollowup,saveCommercialDetails} from "@/lib/service-ledger";
import {OperationFileError,addOperationFile} from "@/lib/operation-files";

const val=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown){
  if(error instanceof MaterialError||error instanceof SupplierInvoiceError||error instanceof LedgerError||error instanceof OperationFileError)return error.message;
  if(error instanceof ZodError)return "Revise fechas, montos y campos obligatorios.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505")return "El registro ya existe.";
  console.error("Registro operativo",error);
  return "No fue posible guardar. Compruebe los datos.";
}
async function run(path:string,fn:()=>Promise<unknown>):Promise<never>{
  try{await fn();}catch(e){redirect(`${path}?error=${encodeURIComponent(message(e))}`);}
  revalidatePath("/","layout");redirect(`${path}?ok=1`);
}
export async function createMaterialAction(form:FormData){
  const actor=await requireActor();let id:string;
  const fields=["client_id","service_id","kind","movement_on","site_name","origin","destination","driver_name",
    "driver_tax_id","truck_plate","trailer_plate","weighing_ticket","material_name","supplier_kg","rerchar_kg",
    "impurity_kg","net_basis","net_reported_kg","impurity_report","origin_guide","transfer_guide","entry_sheet",
    "valued_guide","certificate_number","act_number","invoice_number","unit_price_clp","payment_status","paid_on","notes"];
  try{id=await createMaterialReceipt(actor,Object.fromEntries(fields.map(field=>[field,val(form,field)])));}
  catch(e){redirect(`/ingresos?error=${encodeURIComponent(message(e))}`);}
  revalidatePath("/","layout");redirect(`/ingresos/${id}?ok=1`);
}
export async function updateMaterialPaymentAction(form:FormData){
  const actor=await requireActor(),id=val(form,"id");
  await run(`/ingresos/${encodeURIComponent(id)}`,()=>updateMaterialPayment(actor,id,{payment_status:val(form,"payment_status"),paid_on:val(form,"paid_on")}));
}
export async function createSupplierInvoiceAction(form:FormData){
  const actor=await requireActor();let id:string;
  const fields=["issuer","supplier_tax_id","supplier_name","invoice_number","issued_on","due_on","description",
    "net_clp","vat_clp","total_clp","cost_area","purchase_id","service_id","notes"];
  try{id=await createSupplierInvoice(actor,Object.fromEntries(fields.map(field=>[field,val(form,field)])));}
  catch(e){redirect(`/facturas-recibidas?error=${encodeURIComponent(message(e))}`);}
  revalidatePath("/","layout");redirect(`/facturas-recibidas/${id}?ok=1`);
}
export async function registerSupplierPaymentAction(form:FormData){
  const actor=await requireActor(),id=val(form,"id");
  await run(`/facturas-recibidas/${encodeURIComponent(id)}`,()=>registerSupplierPayment(actor,id,{
    submission_key:val(form,"submission_key"),amount_clp:val(form,"amount_clp"),paid_on:val(form,"paid_on"),reference:val(form,"reference")}));
}
export async function addOperationFileAction(form:FormData){
  const actor=await requireActor(),id=val(form,"id");
  const target=val(form,"target")==="invoice"?"invoice":"receipt";
  const path=target==="invoice"?`/facturas-recibidas/${encodeURIComponent(id)}`:`/ingresos/${encodeURIComponent(id)}`;
  await run(path,()=>addOperationFile(actor,target,id,val(form,"kind"),form.get("file") as File));
}
export async function saveGuideFollowupAction(form:FormData){
  const actor=await requireActor(),id=val(form,"service_id");
  await run(`/solicitudes/${encodeURIComponent(id)}/seguimiento`,()=>saveGuideFollowup(actor,id,{
    requested_on:val(form,"requested_on"),received_on:val(form,"received_on"),
    documents_sent_on:val(form,"documents_sent_on"),notes:val(form,"notes")}));
}
export async function saveCommercialAction(form:FormData){
  const actor=await requireActor(),id=val(form,"service_id");
  const fields=["quote_reference","quote_on","order_reference","order_on","service_sheet","eyj_guide","client_guide",
    "sidrep","rental_days","quantity","service_value_clp","notes"];
  await run(`/solicitudes/${encodeURIComponent(id)}/seguimiento`,()=>saveCommercialDetails(actor,id,
    Object.fromEntries(fields.map(field=>[field,val(form,field)]))));
}
