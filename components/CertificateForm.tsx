"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {prepareCertificateDraftAction,revokeCertificateAction} from "@/app/certificate-actions";
import {type CertificateFormKind,type CertificateFormState,type CertificateFormValues} from "@/lib/certificate-form-state";
import {SubmitButton} from "./Transition";

const actions={prepare:prepareCertificateDraftAction,revoke:revokeCertificateAction};
export default function CertificateForm({kind,choices,serviceId="",page=1}:{kind:CertificateFormKind;choices:{id:string;label:string}[];serviceId?:string;page?:number}){
  const permalink=kind==="prepare"?"/certificados":"/certificados?pagina="+page+"&revocar=1#revocar-certificado";
  const [state,action]=useActionState<CertificateFormState,FormData>(actions[kind],{error:"",values:{}},permalink);
  const [fields,setFields]=useState<CertificateFormValues>(()=>({service_id:state.values.service_id??serviceId,
    document_type:state.values.document_type??"servicio",id:state.values.id??"",reason:state.values.reason??""}));
  const input=(name:keyof CertificateFormValues)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setFields(previous=>({...previous,[name]:event.target.value}))});
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error){const details=errorRef.current?.closest("details");if(details)details.open=true;errorRef.current?.focus();}},[state]);
  if(!choices.length&&!state.error)return null;
  const selected=fields[kind==="prepare"?"service_id":"id"],missing=selected&&!choices.some(choice=>choice.id===selected);
  return <form action={action} className="form-grid detail-form certificate-form" data-certificate-form={kind}>
    {kind==="revoke"&&<input type="hidden" name="pagina" value={page}/>}
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo {kind==="prepare"?"guardar el borrador":"revocar el certificado"}.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    <label className={kind==="prepare"?"field-full":undefined}>{kind==="prepare"?"Servicio habilitado":"Certificado"}<select {...input(kind==="prepare"?"service_id":"id")} required>
      <option value="">{kind==="prepare"?"Seleccione un servicio":"Seleccione folio y versión"}</option>
      {missing&&<option value={selected} disabled>La selección anterior ya no está disponible</option>}
      {choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}
    </select></label>
    {kind==="prepare"?<>
      <label className="field-full">Tipo de documento<select {...input("document_type")}><option value="servicio">Certificado de servicio</option><option value="disposicion_final">Certificado de disposición final</option></select></label>
      <p className="helper-text field-full">Para disposición final, la ficha ambiental revisada debe indicar ese tratamiento y debe haber un respaldo del receptor adjunto al servicio, identificado como disposición final. La emisión vuelve a comprobar ambos datos.</p>
    </>:<label>Motivo<input {...input("reason")} minLength={5} maxLength={500} required placeholder="Corrección documentada"/></label>}
    <div className="field-full form-footer"><SubmitButton className={"button "+(kind==="prepare"?"button-primary":"button-outline")}>{kind==="prepare"?"Guardar borrador sin emitir":"Revocar y conservar historial"}</SubmitButton></div>
  </form>;
}
