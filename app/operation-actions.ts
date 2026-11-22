"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {randomUUID} from "node:crypto";
import {requireActor} from "@/lib/auth";
import {MaterialError,createMaterialReceipt,updateMaterialGuideFollowup,updateMaterialPayment,updateMaterialReferences,recordMaterialClosureNotification} from "@/lib/materials";
import {MaterialStockError} from "@/lib/material-stock";
import {SupplierInvoiceError,createSupplierInvoice,registerSupplierPayment,updateSupplierInvoiceDueDate,reviewSupplierInvoice} from "@/lib/supplier-invoices";
import {LedgerError,saveGuideFollowup,saveCommercialDetails} from "@/lib/service-ledger";
import {OperationFileError,addOperationFile} from "@/lib/operation-files";
import {supplierInvoiceDraft,type SupplierInvoiceFormState} from "@/lib/supplier-invoice-form-state";
import {materialReceiptDraft,materialReceiptFields,type MaterialReceiptFormState} from "@/lib/material-receipt-form-state";
import {materialFollowupAnchors,materialFollowupDraft,materialFollowupFields,type MaterialFollowupFormState,type MaterialFollowupKind} from "@/lib/material-followup-form-state";
import {ledgerContextFromForm,ledgerDraft,ledgerFields,ledgerHref,type LedgerFormState,type LedgerKind} from "@/lib/service-ledger-state";
import {supplierInvoiceDetailDraft,supplierInvoiceDetailFields,supplierInvoiceDetailHref,type SupplierInvoiceDetailKind,type SupplierInvoiceDetailState} from "@/lib/supplier-invoice-detail-state";

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
async function saveSupplierInvoiceDetail(kind:SupplierInvoiceDetailKind,form:FormData):Promise<SupplierInvoiceDetailState>{
  const actor=await requireActor(),id=val(form,"invoice_id"),values=Object.fromEntries(supplierInvoiceDetailFields[kind].map(key=>[key,val(form,key)]));
  try{
    if(kind==="payment")await registerSupplierPayment(actor,id,values);
    else if(kind==="review")await reviewSupplierInvoice(actor,id,values);
    else if(kind==="due")await updateSupplierInvoiceDueDate(actor,id,values);
    else if(kind==="attachment")await addOperationFile(actor,"invoice",id,val(form,"kind"),form.get("file") as File);
  }catch(e){return {error:message(e),values:supplierInvoiceDetailDraft(kind,form)};}
  revalidatePath("/","layout");redirect(supplierInvoiceDetailHref(id,kind));
}
export async function registerSupplierPaymentAction(_previous:SupplierInvoiceDetailState,form:FormData):Promise<SupplierInvoiceDetailState>{
  return saveSupplierInvoiceDetail("payment",form);
}
export async function reviewSupplierInvoiceAction(_previous:SupplierInvoiceDetailState,form:FormData):Promise<SupplierInvoiceDetailState>{
  return saveSupplierInvoiceDetail("review",form);
}
export async function updateSupplierInvoiceDueDateAction(_previous:SupplierInvoiceDetailState,form:FormData):Promise<SupplierInvoiceDetailState>{
  return saveSupplierInvoiceDetail("due",form);
}
export async function addSupplierInvoiceFileAction(_previous:SupplierInvoiceDetailState,form:FormData):Promise<SupplierInvoiceDetailState>{
  return saveSupplierInvoiceDetail("attachment",form);
}
export async function addOperationFileAction(form:FormData){
  const actor=await requireActor(),id=val(form,"id");
  const target=val(form,"target")==="invoice"?"invoice":"receipt";
  const path=target==="invoice"?`/facturas-recibidas/${encodeURIComponent(id)}`:`/ingresos/${encodeURIComponent(id)}`;
  await run(path,()=>addOperationFile(actor,target,id,val(form,"kind"),form.get("file") as File));
}
async function saveLedger(kind:LedgerKind,form:FormData):Promise<LedgerFormState>{
  const actor=await requireActor(),id=val(form,"service_id"),operation=kind==="guide"?saveGuideFollowup:saveCommercialDetails;
  try{await operation(actor,id,Object.fromEntries(ledgerFields[kind].map(field=>[field,val(form,field)])));}
  catch(error){return {error:message(error),values:ledgerDraft(kind,form)};}
  revalidatePath("/","layout");redirect(ledgerHref(id,ledgerContextFromForm(form),kind,randomUUID()));
}
export async function saveGuideFollowupAction(_previous:LedgerFormState,form:FormData){
  return saveLedger("guide",form);
}
export async function saveCommercialAction(_previous:LedgerFormState,form:FormData){
  return saveLedger("commercial",form);
}
