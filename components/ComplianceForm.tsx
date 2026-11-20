"use client";
import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {saveWasteAction,reviewWasteAction,observeWasteAction,recordDeclarationAction} from "@/app/compliance-actions";
import {complianceContext,complianceHref,type ComplianceContext,type ComplianceKind,type ComplianceFormState} from "@/lib/compliance-state";
import {SubmitButton} from "./Transition";
const actions={save:saveWasteAction,review:reviewWasteAction,observe:observeWasteAction,declare:recordDeclarationAction};
export default function ComplianceForm({kind,id="",context={},defaults={},services=[],disabled=false,system="SINADER"}:{kind:ComplianceKind;id?:string;context?:ComplianceContext;defaults?:Record<string,string>;services?:{id:string;label:string}[];disabled?:boolean;system?:string}){
  const[state,action,pending]=useActionState<ComplianceFormState,FormData>(actions[kind],{error:"",values:{}},complianceHref(context,id,kind));
  const[fields,setFields]=useState<Record<string,string>>(()=>state.error?state.values:defaults),errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error){setFields(state.values);errorRef.current?.focus();}},[state]);
  const input=(name:string)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setFields(previous=>({...previous,[name]:event.target.value}))});
  const labels=[['classification','Clasificación / descripción',120],['generator_name','Generador',160],['transporter_name','Transportista real',160],['receiver_name','Receptor',160],['treatment','Tratamiento o destino',160],['guide_number','Guía / documento de respaldo',80]]as const;
  return <form action={action} id={`ambiental-${kind}`} className="compliance-form form-stack" data-compliance-form={kind}>
    <input type="hidden" name="id" value={id}/>{Object.entries(complianceContext(context)).map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo guardar el cambio.</strong><span>{state.error}</span><small>Los datos ingresados se conservan.</small></div>}
    {disabled&&<p className="helper-text">El estado actual de la ficha no permite esta acción. Los datos se conservan para su revisión.</p>}
    <fieldset className={`compliance-fields ${kind==="save"||kind==="declare"?"form-grid":"form-stack"}`} disabled={disabled||pending}>
      {kind==="save"&&<>{id?<input type="hidden" name="service_id" value={fields.service_id??""}/>:<label className="field-full">Servicio cerrado<select {...input("service_id")} required><option value="">Seleccione un folio</option>{fields.service_id&&!services.some(service=>service.id===fields.service_id)&&<option value={fields.service_id}>Servicio seleccionado ya no disponible</option>}{services.map(service=><option value={service.id} key={service.id}>{service.label}</option>)}</select></label>}
        <label>Categoría informada<select {...input("category")} required><option value="no_peligroso">No peligroso</option><option value="peligroso">Peligroso</option></select></label>
        {labels.map(([key,label,max])=><label key={key}>{label}<input {...input(key)} required minLength={2} maxLength={max}/></label>)}
      </>}
      {kind==="review"&&<p className="helper-text">Compruebe clasificación, pesaje, guía, receptor y evidencia antes de marcar la ficha como revisada.</p>}
      {kind==="observe"&&<label>Motivo de corrección u observación<textarea {...input("reason")} required minLength={5} maxLength={500} rows={3}/></label>}
      {kind==="declare"&&<><p className="field-full helper-text">Ingrese el folio después de registrar la declaración en {system}. Esta constancia manual no realiza un envío al portal.</p><label>Referencia externa<input {...input("external_reference")} minLength={2} maxLength={120} required/></label><label>Fecha de declaración<input {...input("reported_on")} type="date" required/></label></>}
      <div className="field-full form-footer"><SubmitButton className={kind==="observe"?"button button-outline":"button button-primary"} disabled={kind==="save"&&!id&&!services.length}>{kind==="save"?id?"Guardar cambios":"Guardar borrador":kind==="review"?"Marcar revisado":kind==="observe"?"Observar y abrir corrección":"Registrar constancia manual"}</SubmitButton></div>
    </fieldset>
  </form>;
}
