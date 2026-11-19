"use client";
import {useActionState,useEffect,useRef,useState} from "react";
import {addEvidenceAction} from "@/app/actions";
import {evidenceHref,evidenceLabels,type EvidenceContext,type EvidenceFormState,type EvidenceKind,type EvidenceSlot} from "@/lib/evidence-form-state";
import {serviceDayContext} from "@/lib/service-day-state";
import {SubmitButton} from "./Transition";
export default function EvidenceUploadForm({id,slot,kinds,nonce,company,context,limit,disabled=false,hasFiles=false}:{id:string;slot:EvidenceSlot;kinds:EvidenceKind[];nonce:string;company:string|null;context:EvidenceContext;limit:number;disabled?:boolean;hasFiles?:boolean}){
  const [state,action]=useActionState<EvidenceFormState,FormData>(addEvidenceAction,{error:"",values:{}},evidenceHref(id,context,`carga-${slot}`,{documento_form:slot}));
  const [kind,setKind]=useState(()=>kinds.length===1?kinds[0]:state.values.document_kind||kinds[0]),[description,setDescription]=useState(()=>state.values.description??""),[localError,setLocalError]=useState(""),[filename,setFilename]=useState("");
  useEffect(()=>{if(state.error)setFilename("");},[state]);
  const alert=useRef<HTMLDivElement>(null);useEffect(()=>{if(state.error||localError){const details=alert.current?.closest("details");if(details)details.open=true;alert.current?.focus();}},[state,localError]);
  const images=kind==="foto_area",error=localError||state.error;
  return <form id={`carga-${slot}`} action={action} className="form-stack compact evidence-upload-form" data-evidence-form={slot} onSubmit={event=>{if(localError)event.preventDefault();}}>
    <input type="hidden" name="id" value={id}/><input type="hidden" name="submission_key" value={state.values.submission_key??nonce}/><input type="hidden" name="documento_form" value={slot}/><input type="hidden" name="documento_empresa" value={company??""}/>{Object.entries(serviceDayContext(context)).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
    {error&&<div ref={alert} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo guardar el documento.</strong><span>{error}</span><small>El tipo y las observaciones se conservan. Seleccione nuevamente el archivo para reintentar.{state.filename?` Archivo anterior: ${state.filename}.`:""}</small></div>}
    {kinds.length===1?<input type="hidden" name="document_kind" value={kind}/>:<label>Tipo de documento<select name="document_kind" value={kind} onChange={e=>setKind(e.target.value)}>{!kinds.includes(kind as EvidenceKind)&&<option value={kind}>Selección anterior no disponible</option>}{kinds.map(value=><option key={value} value={value}>{evidenceLabels[value]}</option>)}</select></label>}
    <label>Observaciones<textarea name="description" rows={2} maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Detalle del respaldo, si corresponde"/></label>
    <label>Archivo<input name="file" type="file" required accept={images?".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp":".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"} onChange={e=>{const file=e.target.files?.[0];setFilename(file?.name??"");setLocalError(file&&file.size>limit*1024*1024?`El archivo supera ${limit} MB. Seleccione uno de menor tamaño.`:"");}}/></label><p className="helper-text">{images?"JPG, PNG o WebP":"PDF, JPG, PNG o WebP"} · máximo {limit} MB.{filename?` Seleccionado: ${filename}`:""}</p>
    {disabled&&<p className="helper-text">El estado actual del servicio no admite esta carga. Sus observaciones se conservan para revisión.</p>}
    <div className="form-footer"><SubmitButton className="button button-outline" disabled={disabled||Boolean(localError)}>{hasFiles?"Agregar otro archivo":"Guardar documento"}</SubmitButton></div>
  </form>;
}
