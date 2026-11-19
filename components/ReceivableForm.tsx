"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {reconcileReceivableAction,registerExtraReceivablePaymentAction,voidExtraReceivableInvoiceAction} from "@/app/receivable-actions";
import {receivableAnchor,receivableHref,type ReceivableContext,type ReceivableFormKind,type ReceivableFormState,type ReceivableValues} from "@/lib/receivable-form-state";
import {financialMoney} from "@/lib/financial-detail-state";
import {SubmitButton} from "./Transition";
const actions={payment:registerExtraReceivablePaymentAction,void:voidExtraReceivableInvoiceAction,reconcile:reconcileReceivableAction};
export function ReceivableForm({kind,sourceId,context,today,nonce="",defaults={},minimum,remaining="0",disabled=false}:{kind:ReceivableFormKind;sourceId:string;context:ReceivableContext;today:string;nonce?:string;defaults?:ReceivableValues;minimum?:string;remaining?:string;disabled?:boolean}){
  const [state,action]=useActionState<ReceivableFormState,FormData>(actions[kind],{error:"",values:{}},receivableHref(context,receivableAnchor(kind,sourceId),{formulario:kind,registro:sourceId}));
  const [fields,setFields]=useState<ReceivableValues>(()=>({submission_key:nonce,paid_on:today,...defaults,...state.values}));
  const error=useRef<HTMLDivElement>(null);useEffect(()=>{if(state.error){const details=error.current?.closest("details");if(details)details.open=true;error.current?.focus();}},[state]);
  const input=(name:keyof ReceivableValues)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>{const value=event.target.value;setFields(previous=>({...previous,[name]:value}));}});
  return <form action={action} className="form-stack compact receivable-form" data-receivable-form={kind} data-source-id={sourceId}>
    {Object.entries(context).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}<input type="hidden" name={kind==="reconcile"?"id":"invoice_id"} value={sourceId}/>
    {kind==="payment"&&<input type="hidden" name="submission_key" value={fields.submission_key??nonce}/>}
    {state.error&&<div ref={error} role="alert" tabIndex={-1} className="notice notice-error request-form-error"><strong>No se pudo guardar el cambio.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    {kind==="payment"&&<><p className="helper-text">Saldo de esta factura: <strong>${financialMoney(remaining)}</strong>.</p><div className="two-fields"><label>Monto abonado ($ CLP)<input {...input("amount_clp")} type="number" min="0.01" max={Number(remaining)>0?remaining:"0"} step="0.01" required/></label><label>Fecha del pago<input {...input("paid_on")} type="date" min={minimum} max={today} required/></label></div><label>Referencia del comprobante<input {...input("reference")} minLength={2} maxLength={120} required/></label></>}
    {kind==="void"&&<><label>Motivo de anulación<textarea {...input("reason")} minLength={5} maxLength={500} required rows={3}/></label><p className="helper-text">La anulación queda registrada y desvincula los cargos, EDP o guías asociados para su revisión.</p></>}
    {kind==="reconcile"&&<><label>Folio de factura<input {...input("invoice_number")} minLength={2} maxLength={80} required/></label><div className="two-fields"><label>Fecha de emisión<input {...input("invoiced_on")} type="date" min={minimum} max={today} required/></label><label>Vencimiento<input {...input("due_on")} type="date" min={fields.invoiced_on||minimum} required/></label></div><label>Total según documento externo ($ CLP)<input {...input("total_clp")} type="number" min="0.01" max="100000000000" step="0.01" required/></label><p className="helper-text">Verifique folio, vencimiento y total contra el documento emitido.</p></>}
    {disabled&&<p className="helper-text">El estado actual del registro ya no admite esta operación. Los datos se mantienen para su revisión.</p>}
    <div className="form-footer"><SubmitButton className={`button ${kind==="payment"?"button-primary":"button-outline"}`} disabled={disabled}>{kind==="payment"?"Guardar abono":kind==="void"?"Confirmar anulación":"Conciliar factura externa"}</SubmitButton></div>
  </form>;
}
