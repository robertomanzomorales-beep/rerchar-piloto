"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {recordMaterialClosureNotificationAction,updateMaterialPaymentAction,updateMaterialReferencesAction,updateMaterialGuideFollowupAction} from "@/app/operation-actions";
import {materialFollowupFields,type MaterialFollowupFormState,type MaterialFollowupKind,type MaterialFollowupValues} from "@/lib/material-followup-form-state";
import {SubmitButton} from "./Transition";

const actions={guide:updateMaterialGuideFollowupAction,references:updateMaterialReferencesAction,payment:updateMaterialPaymentAction,notice:recordMaterialClosureNotificationAction};
const labels={guide:"Guardar seguimiento",references:"Guardar factura y referencias",payment:"Guardar estado de pago",notice:"Registrar aviso enviado"};
export default function MaterialFollowupForm({kind,id,values,disabled=false,minimumNoticeDate}:{kind:MaterialFollowupKind;id:string;
  values:MaterialFollowupValues;disabled?:boolean;minimumNoticeDate?:string;
}){
  const [state,action]=useActionState<MaterialFollowupFormState,FormData>(actions[kind],{error:"",values:{}});
  const [fields,setFields]=useState<MaterialFollowupValues>(()=>Object.fromEntries(materialFollowupFields[kind].map(key=>[key,state.values[key]??values[key]??""])));
  const input=(name:keyof MaterialFollowupValues)=>({name,value:fields[name]??"",onChange:(e:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setFields(previous=>({...previous,[name]:e.target.value}))});
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error)errorRef.current?.focus();},[state]);
  const paid=fields.payment_status==="pagado"||fields.payment_status==="parcial";
  return <form action={action} className={`${kind==="guide"||kind==="references"?"form-grid":"form-stack"} material-followup-form`} data-followup={kind}>
    <input type="hidden" name="id" value={id}/>
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo guardar el seguimiento.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    {kind==="guide"&&<>
      <label>Fecha en que se solicitó<input {...input("requested_on")} type="date" required={Boolean(fields.received_on||fields.valued_guide)} disabled={disabled}/></label>
      <label>Fecha de recepción<input {...input("received_on")} type="date" min={fields.requested_on||undefined} required={Boolean(fields.valued_guide)} disabled={disabled}/></label>
      <label>Número de guía valorizada<input {...input("valued_guide")} maxLength={80} required={Boolean(fields.received_on)} disabled={disabled}/></label>
    </>}
    {kind==="references"&&<>
      <label>N° hoja de ingreso<input {...input("entry_sheet")} maxLength={80}/></label>
      <label>N° factura<input {...input("invoice_number")} maxLength={80} required={Boolean(fields.invoice_direction)}/></label>
      <label>Dirección de la factura<select {...input("invoice_direction")}><option value="">Por confirmar con administración</option><option value="emitida">Emitida por RERCHAR</option><option value="recibida">Recibida por RERCHAR</option></select></label>
      <label>Fecha de factura<input {...input("invoice_issued_on")} type="date" required={Boolean(fields.invoice_direction)}/></label>
      <label>N° certificado, si corresponde<input {...input("certificate_number")} maxLength={80}/></label>
    </>}
    {kind==="payment"&&<>
      <label>Estado<select name="payment_status" value={fields.payment_status??"pendiente"} onChange={e=>{const status=e.target.value;setFields(previous=>({...previous,payment_status:status,...(["pendiente","no_aplica"].includes(status)?{paid_on:"",payment_reference:""}:{})}));}}><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagado">Pagado</option><option value="no_aplica">No aplica</option></select></label>
      <label>Fecha del pago o abono<input {...input("paid_on")} type="date" required={paid}/></label>
      <label>Referencia de comprobante<input {...input("payment_reference")} maxLength={120} required={paid}/></label>
    </>}
    {kind==="notice"&&<>
      <label>Fecha del aviso<input {...input("notified_on")} type="date" min={minimumNoticeDate||undefined} required/></label>
      <label>Destinatario real (correo o nombre)<input {...input("recipient")} minLength={3} maxLength={180} required/></label>
      <label>Medio y observaciones<textarea {...input("note")} rows={2} maxLength={500}/></label>
    </>}
    <div className={kind==="guide"||kind==="references"?"field-full form-footer":"form-footer"}><SubmitButton className="button button-outline" disabled={disabled}>{labels[kind]}</SubmitButton></div>
  </form>;
}
