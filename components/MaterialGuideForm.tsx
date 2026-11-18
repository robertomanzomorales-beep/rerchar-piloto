"use client";

import {useActionState,useEffect,useRef,useState} from "react";
import {createMaterialGuideAction,saveMaterialGuideItemAction,updateMaterialGuideAction,linkMaterialSaleInvoiceAction} from "@/app/material-guide-actions";
import type {GuideDraft,GuideField,GuideFormKind,GuideFormState} from "@/lib/material-guide-form-state";
import type {CatalogMaterial} from "@/lib/material-stock";
import {GuideHeaderFields,GuideItemFields,type GuideFieldBinder} from "./MaterialGuideForms";
import {SubmitButton} from "./Transition";

const actions={create:createMaterialGuideAction,item:saveMaterialGuideItemAction,header:updateMaterialGuideAction,billing:linkMaterialSaleInvoiceAction};
export default function MaterialGuideForm({kind,guideId,values,clients=[],catalog=[],billingLinked=false,movementOn,today}:{
  kind:GuideFormKind;guideId?:string;values:GuideDraft;clients?:{id:string;name:string}[];catalog?:CatalogMaterial[];
  billingLinked?:boolean;movementOn?:string;today?:string;
}){
  const [state,action]=useActionState<GuideFormState,FormData>(actions[kind],{error:"",values:{}},kind==="header"?`/control-guias/${guideId}?general=1#datos-generales`:undefined);
  const [fields,setFields]=useState<GuideDraft>(()=>({...values,...state.values}));
  const update=(name:GuideField,value:string)=>setFields(previous=>({...previous,[name]:value}));
  const bind:GuideFieldBinder=name=>({name,value:fields[name]??"",onChange:event=>update(name,event.target.value)});
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error){const details=errorRef.current?.closest("details");if(details)details.open=true;errorRef.current?.focus();}},[state]);
  const label=kind==="create"?"Registrar guía y material":kind==="header"?"Guardar datos generales":kind==="billing"?"Vincular a Cobranza":fields.item_id?"Guardar cambios del material":"Agregar material";
  return <form action={action} className={`form-grid material-guide-form${kind==="header"?" guide-header-edit":""}`} data-guide-form={kind}>
    {guideId&&<input type="hidden" name="guide_id" value={guideId}/>}
    {kind==="create"&&<input type="hidden" name="submission_key" value={fields.submission_key??""}/>}
    {(kind==="create"||kind==="item"||kind==="billing")&&<input type="hidden" name="item_id" value={fields.item_id??""}/>}
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo guardar la guía.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    {(kind==="create"||kind==="header")&&<GuideHeaderFields editing={kind==="header"} clients={clients} bind={bind}/>}
    {(kind==="create"||kind==="item")&&<GuideItemFields values={fields} bind={bind} catalog={catalog} billingLinked={billingLinked}/>}
    {kind==="billing"&&<>
      <label>Folio factura<input {...bind("invoice_number")} required minLength={2} maxLength={80}/></label>
      <label>Emisión<input {...bind("issued_on")} type="date" min={movementOn} max={today} required/></label>
      <label>Vencimiento<input {...bind("due_on")} type="date" min={fields.issued_on||movementOn} required/></label>
      <label>Total real del documento (CLP)<input {...bind("total_clp")} type="number" min="0.01" max="100000000000" step="0.01" required/></label>
    </>}
    <div className="field-full form-footer"><SubmitButton className={`button ${kind==="header"?"button-outline":"button-primary"}`}>{label}</SubmitButton></div>
  </form>;
}
