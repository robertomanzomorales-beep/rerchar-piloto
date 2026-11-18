"use client";

import {useActionState,useEffect,useRef,useState} from "react";
import {createQuoteAction} from "@/app/quote-actions";
import type {QuoteFormState} from "@/lib/quote-form-state";
import {SubmitButton} from "./Transition";
import {QuoteDates} from "./QuoteDates";
import QuoteIssuerPresentation from "./QuoteIssuerPresentation";

export default function QuoteCreationForm({clients,clientId,company,start,initialPurchase,submissionKey}:{
  clients:{id:string;name:string;email:string|null}[];clientId:string;company:"rerchar"|"e_y_j"|null;
  start:string;initialPurchase:boolean;submissionKey:string;
}){
  const [state,action]=useActionState<QuoteFormState,FormData>(createQuoteAction,{error:"",values:{}});
  const restored=state.values;
  const [fields,setFields]=useState({client_id:restored.client_id??clientId,title:restored.title??"",
    proposal_objective:restored.proposal_objective??"",vat_rate:restored.vat_rate??"0.19",notes:restored.notes??""});
  const update=(key:keyof typeof fields,value:string)=>setFields(previous=>({...previous,[key]:value}));
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error)errorRef.current?.focus();},[state]);
  return <form action={action} className="form-grid quote-creation-form">
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo iniciar la cotización.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    <input type="hidden" name="submission_key" value={restored.submission_key||submissionKey}/>
    <div className="form-section-title">Identificación de la propuesta</div>
    <div className="quote-identity-grid"><label>Cliente<select name="client_id" value={fields.client_id} onChange={e=>update("client_id",e.target.value)} required><option value="">Seleccione un cliente</option>{clients.map(client=><option key={client.id} value={client.id}>{client.name}{client.email?` · ${client.email}`:""}</option>)}</select></label>
      <QuoteIssuerPresentation company={company} initialPurchase={initialPurchase} values={restored}/>
    </div>
    <div className="form-section-title">Alcance y condiciones</div>
    <label className="field-full">Título / alcance<input name="title" value={fields.title} onChange={e=>update("title",e.target.value)} required minLength={3} maxLength={180} placeholder={company==="e_y_j"?"Arriendo de equipo para faena":"Retiro y valorización de residuos"}/></label>
    <label className="field-full">Objetivo de esta propuesta<textarea name="proposal_objective" value={fields.proposal_objective} onChange={e=>update("proposal_objective",e.target.value)} required minLength={10} maxLength={700} rows={3} placeholder="Explique qué necesita el cliente y qué resultado contempla esta cotización."/></label>
    <QuoteDates start={restored.issued_on??start} initialValidUntil={restored.valid_until} initialCustom={restored.validity_custom==="true"}/>
    <label>IVA general<select name="vat_rate" value={fields.vat_rate} onChange={e=>update("vat_rate",e.target.value)}><option value="0.19">19%</option><option value="0">0%</option></select></label>
    <label className="field-full">Observaciones y condiciones<textarea name="notes" value={fields.notes} onChange={e=>update("notes",e.target.value)} maxLength={1000} rows={3}/></label>
    <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!clients.length}>Iniciar cotización y asignar número</SubmitButton></div>
  </form>;
}
