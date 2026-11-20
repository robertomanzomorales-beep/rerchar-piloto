"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {saveCommercialAction,saveGuideFollowupAction} from "@/app/operation-actions";
import {ledgerAnchor,ledgerContext,ledgerHref,ledgerNumberLimits,type LedgerContext,type LedgerFormState,type LedgerKind,type LedgerValues} from "@/lib/service-ledger-state";
import {SubmitButton} from "./Transition";

export default function ServiceLedgerForm({id,kind,isEyj,context={},defaults={},managers=[],responsibleName=""}:{
  id:string;kind:LedgerKind;isEyj:boolean;context?:LedgerContext;defaults?:LedgerValues;managers?:{id:string;name:string}[];responsibleName?:string;
}){
  const [state,action,pending]=useActionState<LedgerFormState,FormData>(kind==="guide"?saveGuideFollowupAction:saveCommercialAction,{error:"",values:{}},ledgerHref(id,context,kind));
  const [fields,setFields]=useState<LedgerValues>(()=>state.error?state.values:defaults),errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error){setFields(state.values);errorRef.current?.focus();}},[state]);
  const input=(name:keyof LedgerValues)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setFields(previous=>({...previous,[name]:event.target.value}))});
  const oldOwner=fields.responsible_user_id&&!managers.some(manager=>manager.id===fields.responsible_user_id);
  return <form action={action} id={ledgerAnchor(kind)} className="form-stack service-ledger-form" data-ledger-form={kind}>
    <input type="hidden" name="service_id" value={id}/>{Object.entries(ledgerContext(context)).map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}
    {state.error&&<div ref={errorRef} tabIndex={-1} className="notice notice-error request-form-error" role="alert"><strong>No se pudo guardar {kind==="guide"?"el seguimiento":"la ficha comercial"}.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    <fieldset className="form-stack service-ledger-fields" disabled={pending}>
      {kind==="guide"?<>
        <label>Envío de guía de despacho<select {...input("dispatch_guide_status")}><option value="">Sin registrar</option><option value="pendiente">Pendiente</option><option value="enviada">Enviada</option><option value="no_aplica">No aplica</option></select></label>
        {!isEyj&&<><div className="two-fields"><label>Guía valorizada solicitada<input {...input("requested_on")} type="date"/></label><label>Plazo acordado de recepción<input {...input("due_on")} type="date" min={fields.requested_on||undefined}/></label></div>
          <label>Responsable de seguimiento<select {...input("responsible_user_id")}><option value="">Sin asignar</option>{oldOwner&&<option value={fields.responsible_user_id}>Responsable anterior: {fields.responsible_user_id===defaults.responsible_user_id&&responsibleName?responsibleName:"no disponible"}</option>}{managers.map(manager=><option value={manager.id} key={manager.id}>{manager.name}</option>)}</select></label>
          <p className="helper-text">Seleccione un responsable activo cuando registre un plazo. Las guías anteriores sin plazo se muestran por completar.</p>
          <label>Guía valorizada recibida<input {...input("received_on")} type="date" min={fields.requested_on||undefined}/></label>
        </>}
        <label>Documentos enviados al cierre<input {...input("documents_sent_on")} type="date" min={!isEyj?fields.received_on||undefined:undefined}/></label>
        <label>Notas<textarea {...input("notes")} rows={3} maxLength={500}/></label>
      </>:<>
        <div className="two-fields"><label>Cotización / propuesta<input {...input("quote_reference")} maxLength={100}/></label><label>Fecha de cotización<input {...input("quote_on")} type="date"/></label></div>
        <div className="two-fields"><label>Orden de compra del cliente<input {...input("order_reference")} maxLength={100}/></label><label>Fecha de la orden<input {...input("order_on")} type="date"/></label></div>
        <div className="two-fields"><label>Hoja de servicio<input {...input("service_sheet")} maxLength={100}/></label><label>Guía E y J<input {...input("eyj_guide")} maxLength={100}/></label></div>
        <div className="two-fields"><label>Guía del cliente<input {...input("client_guide")} maxLength={100}/></label><label>SIDREP<input {...input("sidrep")} maxLength={100}/></label></div>
        <div className="two-fields"><label>Días de arriendo<input {...input("rental_days")} type="number" min="0" max={ledgerNumberLimits.rental_days} step="0.01"/></label><label>Cantidad<input {...input("quantity")} type="number" min="0" max={ledgerNumberLimits.quantity} step="0.001"/></label></div>
        <label>Valor del servicio (CLP)<input {...input("service_value_clp")} type="number" min="0" max={ledgerNumberLimits.service_value_clp} step="0.01"/></label>
        <label>Notas<textarea {...input("notes")} rows={3} maxLength={700}/></label>
      </>}
      <div className="form-footer"><SubmitButton className="button button-primary">{kind==="guide"?"Guardar seguimiento":"Guardar datos comerciales"}</SubmitButton></div>
    </fieldset>
  </form>;
}
