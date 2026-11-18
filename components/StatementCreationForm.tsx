"use client";

import {useActionState,useEffect,useRef,useState} from "react";
import {createStatementAction} from "@/app/payment-statement-actions";
import type {StatementFormState} from "@/lib/statement-form-state";
import StatementHeaderForm from "./StatementHeaderForm";
import {SubmitButton} from "./Transition";

type Client={id:string;name:string;tax_id:string|null;address:string|null;email:string|null};
export default function StatementCreationForm({clients,clientId,period,statementType,cycleId,submissionKey}:{
  clients:Client[];clientId:string;period:string;statementType:"residuos"|"arriendo";cycleId:string;submissionKey:string;
}){
  const [state,action]=useActionState<StatementFormState,FormData>(createStatementAction,{error:"",values:{}});
  const restored=state.values;
  const [fields,setFields]=useState({statement_type:restored.statement_type??statementType,number:restored.number??"",
    period_on:restored.period_on??period,contract_reference:restored.contract_reference??"",
    issuer_contact:restored.issuer_contact??"",contract_manager:restored.contract_manager??"",notes:restored.notes??""});
  const update=(key:keyof typeof fields,value:string)=>setFields(previous=>({...previous,[key]:value}));
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error)errorRef.current?.focus();},[state]);
  return <form action={action} className="form-grid statement-creation-form">
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo crear el estado de pago.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    <input type="hidden" name="submission_key" value={restored.submission_key||submissionKey}/>
    <input type="hidden" name="cycle_id" value={restored.cycle_id??cycleId}/>
    <label>Formato<select name="statement_type" value={fields.statement_type} onChange={e=>update("statement_type",e.target.value)}><option value="residuos">Transporte y disposición final</option><option value="arriendo">Arriendo de excavadora u otro equipo</option></select></label>
    <label>N° estado de pago<input name="number" required maxLength={40} placeholder="01" value={fields.number} onChange={e=>update("number",e.target.value)}/></label>
    <label>Período<input name="period_on" type="date" required value={fields.period_on} onChange={e=>update("period_on",e.target.value)}/></label>
    <label>Referencia contrato (opcional)<input name="contract_reference" maxLength={100} value={fields.contract_reference} onChange={e=>update("contract_reference",e.target.value)}/></label>
    <label>Contacto de E y J (opcional)<input name="issuer_contact" maxLength={160} placeholder="Correo o teléfono del emisor" value={fields.issuer_contact} onChange={e=>update("issuer_contact",e.target.value)}/></label>
    <label>Administrador de contrato (opcional)<input name="contract_manager" maxLength={160} placeholder="Nombre según contrato" value={fields.contract_manager} onChange={e=>update("contract_manager",e.target.value)}/></label>
    <div className="form-section-title field-full">Datos del cliente que quedarán en el documento</div>
    <StatementHeaderForm clients={clients} defaultClientId={restored.client_id??clientId} values={restored}/>
    <label className="field-full">Observaciones<textarea name="notes" rows={2} maxLength={1000} value={fields.notes} onChange={e=>update("notes",e.target.value)}/></label>
    <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!clients.length}>Crear borrador</SubmitButton></div>
  </form>;
}
