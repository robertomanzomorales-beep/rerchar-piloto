"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {registerSupplierPaymentAction,reviewSupplierInvoiceAction,updateSupplierInvoiceDueDateAction,addSupplierInvoiceFileAction} from "@/app/operation-actions";
import {requestSupplierTransferAction,approveSupplierTransferAction,rejectSupplierTransferAction,executeSupplierTransferAction,verifySupplierTransferAction} from "@/app/supplier-transfer-actions";
import {supplierInvoiceDetailHref,type SupplierInvoiceDetailKind,type SupplierInvoiceDetailState,type SupplierInvoiceDetailValues} from "@/lib/supplier-invoice-detail-state";
import {SubmitButton} from "./Transition";

const actions={review:reviewSupplierInvoiceAction,due:updateSupplierInvoiceDueDateAction,payment:registerSupplierPaymentAction,attachment:addSupplierInvoiceFileAction,
  request:requestSupplierTransferAction,approve:approveSupplierTransferAction,reject:rejectSupplierTransferAction,execute:executeSupplierTransferAction,verify:verifySupplierTransferAction};
const labels={review:"Guardar revisión",due:"Guardar corrección",payment:"Guardar pago manual",attachment:"Guardar archivo",request:"Solicitar transferencia",approve:"Aprobar solicitud",reject:"Rechazar solicitud",execute:"Registrar transferencia ejecutada",verify:"Verificar y aplicar pago"};
export default function SupplierInvoiceDetailForm({kind,invoiceId,transferId="",nonce="",today,issuedOn,dueOn="",maximum="0",legacyBank=false,disabled=false}:{kind:SupplierInvoiceDetailKind;invoiceId:string;transferId?:string;nonce?:string;today:string;issuedOn:string;dueOn?:string;maximum?:string;legacyBank?:boolean;disabled?:boolean}){
  const [state,action]=useActionState<SupplierInvoiceDetailState,FormData>(actions[kind],{error:"",values:{}},supplierInvoiceDetailHref(invoiceId,kind,transferId,true));
  const [fields,setFields]=useState<SupplierInvoiceDetailValues>(()=>({submission_key:nonce,due_on:dueOn,account_type:"corriente",kind:"factura",...state.values}));
  const error=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error)error.current?.focus();},[state]);
  const input=(name:keyof SupplierInvoiceDetailValues)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>{const value=event.target.value;setFields(previous=>({...previous,[name]:value}));}});
  const upload=kind==="execute"||kind==="attachment";
  return <form action={action} className="form-grid detail-form" data-supplier-invoice-form={kind} data-transfer-id={transferId||undefined}>
    <input type="hidden" name="invoice_id" value={invoiceId}/>{transferId&&<input type="hidden" name="transfer_id" value={transferId}/>}
    {(kind==="payment"||kind==="request")&&<input type="hidden" name="submission_key" value={fields.submission_key??nonce}/>}
    {state.error&&<div ref={error} role="alert" tabIndex={-1} className="notice notice-error request-form-error"><strong>No se pudo guardar el registro.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.{upload?" Vuelva a seleccionar el archivo antes de enviar.":""}</small></div>}
    {kind==="review"&&<><label>Resultado<select {...input("decision")} required><option value="">Seleccione</option><option value="aceptada">Aceptada para pago</option><option value="disputada">Disputada; requiere corrección</option></select></label><label className="field-full">Detalle o motivo de disputa<textarea {...input("note")} minLength={fields.decision==="disputada"?8:undefined} maxLength={500} required={fields.decision==="disputada"} rows={2} placeholder="Indique la discrepancia si corresponde"/></label></>}
    {kind==="due"&&<><label>Fecha de vencimiento<input {...input("due_on")} type="date" min={issuedOn} required/></label><label>Motivo de corrección<input {...input("reason")} minLength={5} maxLength={300} required placeholder="Ej. Error de digitación"/></label></>}
    {(kind==="payment"||kind==="request")&&<label>{kind==="request"?"Monto solicitado ($)":"Monto ($)"}<input {...input("amount_clp")} type="number" min="0.01" max={maximum} step="0.01" required/></label>}
    {kind==="payment"&&<><label>Fecha<input {...input("paid_on")} type="date" required/></label><label className="field-full">Referencia comprobante<input {...input("reference")} minLength={2} maxLength={160} required/></label></>}
    {kind==="request"&&legacyBank&&<><label>Banco destino<input {...input("bank_name")} minLength={2} maxLength={100} required/></label><label>Tipo de cuenta<select {...input("account_type")}><option value="corriente">Corriente</option><option value="vista">Vista</option><option value="ahorro">Ahorro</option><option value="otro">Otra</option></select></label><label>Número de cuenta<input {...input("account_number")} minLength={4} maxLength={60} required/></label></>}
    {(kind==="approve"||kind==="reject")&&<label className="field-full">{kind==="approve"?"Nota de revisión":"Motivo del rechazo"}<input {...input("note")} minLength={kind==="reject"?5:undefined} maxLength={500} required={kind==="reject"} placeholder={kind==="approve"?"Opcional":undefined}/></label>}
    {kind==="execute"&&<><label>Fecha en banco<input {...input("paid_on")} type="date" min={issuedOn} max={today} required/></label><label>Referencia bancaria<input {...input("bank_reference")} minLength={4} maxLength={160} required/></label><label className="field-full">Comprobante PDF o imagen<input name="proof" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required/></label></>}
    {kind==="verify"&&<><label>Monto comprobado ($)<input {...input("checked_amount_clp")} type="number" min="0.01" step="0.01" required/></label><label>Referencia comprobada<input {...input("checked_reference")} minLength={4} maxLength={160} required/></label><label className="field-full">Detalle de la revisión<input {...input("verification_note")} minLength={5} maxLength={500} required placeholder="Comprobante y monto contrastados con la factura"/></label></>}
    {kind==="attachment"&&<><label>Tipo<select {...input("kind")}><option value="factura">Factura</option><option value="comprobante">Comprobante de pago</option><option value="guia">Guía</option><option value="otro">Otro</option></select></label><label className="field-full">Archivo PDF o imagen<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required/></label></>}
    {upload&&<p className="helper-text field-full">PDF, JPG, PNG o WebP, hasta 4 MB.</p>}
    {disabled&&<p className="helper-text field-full">El estado actual del registro no permite esta operación. Revise la factura y las transferencias en curso.</p>}
    <div className="field-full form-footer"><SubmitButton className={"button "+(["due","payment","attachment","reject"].includes(kind)?"button-outline":"button-primary")} disabled={disabled}>{labels[kind]}</SubmitButton></div>
  </form>;
}
