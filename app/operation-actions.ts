"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {MaterialError,createMaterialReceipt,updateMaterialGuideFollowup,updateMaterialPayment,updateMaterialReferences,recordMaterialClosureNotification} from "@/lib/materials";
import {MaterialStockError} from "@/lib/material-stock";
import {SupplierInvoiceError,createSupplierInvoice,registerSupplierPayment,updateSupplierInvoiceDueDate,reviewSupplierInvoice} from "@/lib/supplier-invoices";
import {LedgerError,saveGuideFollowup,saveCommercialDetails} from "@/lib/service-ledger";
import {OperationFileError,addOperationFile} from "@/lib/operation-files";
import {supplierInvoiceDraft,type SupplierInvoiceFormState} from "@/lib/supplier-invoice-form-state";
import {materialReceiptDraft,materialReceiptFields,type MaterialReceiptFormState} from "@/lib/material-receipt-form-state";
import {materialFollowupAnchors,materialFollowupDraft,materialFollowupFields,type MaterialFollowupFormState,type MaterialFollowupKind} from "@/lib/material-followup-form-state";

const val=(form:FormData,key:string)=>String(form.get(key)??"");
function message(error:unknown){
  if(error instanceof MaterialError||error instanceof MaterialStockError||error instanceof SupplierInvoiceError||error instanceof LedgerError||error instanceof OperationFileError)return error.message;
  if(error instanceof ZodError)return "Revise fechas, montos y campos obligatorios.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505")return "El registro ya existe.";
  console.error("Registro operativo",error);
  return "No fue posible guardar. Compruebe los datos.";
}
async function run(path:string,fn:()=>Promise<unknown>):Promise<never>{
  try{await fn();}catch(e){redirect(`${path}?error=${encodeURIComponent(message(e))}`);}
  revalidatePath("/","layout");redirect(`${path}?ok=1`);
}
export async function createMaterialAction(_previous:MaterialReceiptFormState,form:FormData):Promise<MaterialReceiptFormState>{
  const actor=await requireActor();let id:string;
  try{id=await createMaterialReceipt(actor,Object.fromEntries(materialReceiptFields.map(field=>[field,val(form,field)])));}
  catch(e){return {error:message(e),values:materialReceiptDraft(form)};}
  revalidatePath("/","layout");redirect(`/ingresos/${id}?ok=1`);
}
async function saveMaterialFollowup(kind:MaterialFollowupKind,form:FormData):Promise<MaterialFollowupFormState>{
  const actor=await requireActor(),id=val(form,"id");
  const operations={guide:updateMaterialGuideFollowup,references:updateMaterialReferences,payment:updateMaterialPayment,notice:recordMaterialClosureNotification};
  try{await operations[kind](actor,id,Object.fromEntries(materialFollowupFields[kind].map(field=>[field,val(form,field)])));}
  catch(e){return {error:message(e),values:materialFollowupDraft(kind,form)};}
  revalidatePath("/","layout");redirect(`/ingresos/${encodeURIComponent(id)}?ok=1#${materialFollowupAnchors[kind]}`);
}
export async function updateMaterialPaymentAction(_previous:MaterialFollowupFormState,form:FormData):Promise<MaterialFollowupFormState>{
  return saveMaterialFollowup("payment",form);
}
export async function updateMaterialReferencesAction(_previous:MaterialFollowupFormState,form:FormData):Promise<MaterialFollowupFormState>{
  return saveMaterialFollowup("references",form);
}
export async function recordMaterialClosureNotificationAction(_previous:MaterialFollowupFormState,form:FormData):Promise<MaterialFollowupFormState>{
  return saveMaterialFollowup("notice",form);
}
export async function updateMaterialGuideFollowupAction(_previous:MaterialFollowupFormState,form:FormData):Promise<MaterialFollowupFormState>{
  return saveMaterialFollowup("guide",form);
}
export async function createSupplierInvoiceAction(_previous:SupplierInvoiceFormState,form:FormData):Promise<SupplierInvoiceFormState>{
  const actor=await requireActor();let id:string;
  const fields=["issuer","supplier_profile_id","supplier_tax_id","supplier_name","invoice_number","issued_on","due_on","description",
    "net_clp","vat_clp","total_clp","cost_area","purchase_id","service_id","notes"];
  try{id=await createSupplierInvoice(actor,Object.fromEntries(fields.map(field=>[field,val(form,field)])));}
  catch(e){return {error:message(e),values:supplierInvoiceDraft(form)};}
  revalidatePath("/","layout");redirect(`/facturas-recibidas/${id}?ok=1`);
}
export async function registerSupplierPaymentAction(form:FormData){
  const actor=await requireActor(),id=val(form,"id");
  await run(`/facturas-recibidas/${encodeURIComponent(id)}`,()=>registerSupplierPayment(actor,id,{
    submission_key:val(form,"submission_key"),amount_clp:val(form,"amount_clp"),paid_on:val(form,"paid_on"),reference:val(form,"reference")}));
}
export async function reviewSupplierInvoiceAction(form:FormData){
  const actor=await requireActor(),id=val(form,"id");
  await run(`/facturas-recibidas/${encodeURIComponent(id)}`,
    ()=>reviewSupplierInvoice(actor,id,{decision:val(form,"decision"),note:val(form,"note")}));
}
export async function updateSupplierInvoiceDueDateAction(form:FormData){
  const actor=await requireActor(),id=val(form,"id");
  await run(`/facturas-recibidas/${encodeURIComponent(id)}`,
    ()=>updateSupplierInvoiceDueDate(actor,id,{due_on:val(form,"due_on"),reason:val(form,"reason")}));
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
    requested_on:val(form,"requested_on"),due_on:val(form,"due_on"),
    responsible_user_id:val(form,"responsible_user_id"),received_on:val(form,"received_on"),
    documents_sent_on:val(form,"documents_sent_on"),notes:val(form,"notes"),
    dispatch_guide_status:val(form,"dispatch_guide_status")}));
}
export async function saveCommercialAction(form:FormData){
  const actor=await requireActor(),id=val(form,"service_id");
  const fields=["quote_reference","quote_on","order_reference","order_on","service_sheet","eyj_guide","client_guide",
    "sidrep","rental_days","quantity","service_value_clp","notes"];
  await run(`/solicitudes/${encodeURIComponent(id)}/seguimiento`,()=>saveCommercialDetails(actor,id,
    Object.fromEntries(fields.map(field=>[field,val(form,field)]))));
}
