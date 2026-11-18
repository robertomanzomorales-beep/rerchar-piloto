"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import type {Worker,Requirement} from "@/lib/personnel";
import {createExternalDriverAction,createRequirementAction,disableRequirementAction,recordCredentialAction,recordExternalCredentialAction,reviewCredentialAction,reviewExternalCredentialAction,saveWorkerProfileAction} from "@/app/personnel-actions";
import {personnelAnchor,personnelFields,personnelHref,type PersonnelContext,type PersonnelFormKind,type PersonnelFormState,type PersonnelValues} from "@/lib/personnel-form-state";
import {SubmitButton} from "./Transition";

type Profile=Pick<Worker,"id"|"name"|"role"|"national_id"|"position"|"shift"|"phone"|"employer">;
const actions={profile:saveWorkerProfileAction,requirement:createRequirementAction,external_driver:createExternalDriverAction,credential:recordCredentialAction,external_credential:recordExternalCredentialAction,review:reviewCredentialAction,external_review:reviewExternalCredentialAction,disable:disableRequirementAction};
const labels={profile:"Guardar ficha",requirement:"Agregar requisito",external_driver:"Registrar tercero",credential:"Registrar para revisión",external_credential:"Registrar para revisión",review:"Guardar revisión",external_review:"Guardar revisión",disable:"Guardar"};
export function PersonnelForm({kind,context={},id="",decision="verificada",workers=[],clients=[],sites=[],requirements=[],externalDrivers=[]}:{kind:PersonnelFormKind;context?:PersonnelContext;id?:string;decision?:"verificada"|"rechazada"|"revocada";
  workers?:Profile[];clients?:{id:string;name:string}[];sites?:{id:string;client_id:string;name:string}[];requirements?:Pick<Requirement,"id"|"name"|"client_name"|"site_name">[];externalDrivers?:{id:string;name:string;company_name:string}[];
}){
  const permalink=personnelHref(context,personnelAnchor(kind,id,true),{origen:kind,...(id?{edicion:id}:{}),...((kind==="review"||kind==="external_review")?{accion:decision}:{})});
  const [state,action]=useActionState<PersonnelFormState,FormData>(actions[kind],{error:"",values:{}},permalink);
  const [fields,setFields]=useState<PersonnelValues>(()=>Object.fromEntries(personnelFields[kind].map(key=>[key,state.values[key]??(key==="employer"?"rerchar":key==="kind"?"licencia":key==="warning_days"?"30":"")])));
  const input=(name:keyof PersonnelValues)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setFields(previous=>({...previous,[name]:event.target.value}))});
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error){const details=errorRef.current?.closest("details");if(details)details.open=true;errorRef.current?.focus();}},[state]);
  const worker=workers.find(item=>item.id===fields.user_id),availableSites=sites.filter(site=>site.client_id===fields.client_id);
  const own=kind==="credential",registration=own||kind==="external_credential",review=kind==="review"||kind==="external_review";
  const workerChoices=own?workers.filter(item=>item.role==="conductor"):workers;
  function unavailable(name:keyof PersonnelValues,ids:string[]){const value=fields[name];return value&&!ids.includes(value)?<option value={value}>Selección anterior no disponible</option>:null;}
  return <form action={action} className={review&&decision==="verificada"?"personnel-verification-form":"form-stack compact personnel-mutation-form"} data-personnel-form={kind}>
    {Object.entries(context).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
    {review&&<><input type="hidden" name="credential_id" value={id}/><input type="hidden" name="decision" value={decision}/></>}
    {kind==="disable"&&<input type="hidden" name="requirement_id" value={id}/>}
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo guardar el cambio.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    {kind==="profile"&&<>
      <label>Trabajador<select name="user_id" value={fields.user_id??""} onChange={event=>{const selected=workers.find(item=>item.id===event.target.value);setFields(previous=>({...previous,user_id:event.target.value,national_id:selected?.national_id??"",position:selected?.position??"",shift:selected?.shift??"",phone:selected?.phone??"",employer:selected?.employer??"rerchar"}));}} required disabled={!workers.length}><option value="">Seleccione</option>{unavailable("user_id",workers.map(x=>x.id))}{workers.map(item=><option key={item.id} value={item.id}>{item.name} · {item.role==="conductor"?"Conductor":"Operaciones"}</option>)}</select></label>
      <fieldset className="profile-fields" disabled={!worker}>
        <label>Empresa empleadora<select {...input("employer")}><option value="rerchar">RERCHAR Chile SpA</option><option value="e_y_j">E y J Limitada</option></select></label>
        <div className="two-fields"><label>Identificación<input {...input("national_id")} maxLength={20}/></label><label>Cargo<input {...input("position")} maxLength={120}/></label></div>
        <div className="two-fields"><label>Turno<input {...input("shift")} maxLength={80}/></label><label>Teléfono<input {...input("phone")} type="tel" maxLength={40}/></label></div>
      </fieldset>
      <p className="helper-text" role="status">{!workers.length?"No hay trabajadores activos de operaciones o conducción.":worker?"La ficha muestra los datos actuales del trabajador seleccionado.":"Seleccione un trabajador para cargar su ficha actual."}</p>
    </>}
    {kind==="requirement"&&<>
      <label>Cliente<select name="client_id" value={fields.client_id??""} onChange={event=>setFields(previous=>({...previous,client_id:event.target.value,site_id:""}))} required><option value="">Seleccione</option>{unavailable("client_id",clients.map(x=>x.id))}{clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Faena (opcional)<select {...input("site_id")} disabled={!fields.client_id}><option value="">{fields.client_id?"Todas las faenas del cliente":"Seleccione primero un cliente"}</option>{unavailable("site_id",availableSites.map(x=>x.id))}{availableSites.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <p className="helper-text">{!fields.client_id?"Las faenas se cargan al seleccionar el cliente.":!availableSites.length?"Este cliente aún no tiene faenas registradas. El requisito se aplicará a todas sus faenas.":"Puede elegir una faena o aplicar el requisito a todas las del cliente."}</p>
      <label>Documento o habilitación requerida<input {...input("name")} minLength={3} maxLength={150} required placeholder="Licencia clase A5, examen, inducción…"/></label>
      <div className="two-fields"><label>Tipo<select {...input("kind")}><option value="licencia">Licencia</option><option value="curso">Curso</option><option value="examen">Examen</option><option value="acreditacion">Acreditación</option><option value="otro">Otro</option></select></label><label>Advertir con días de anticipación<input {...input("warning_days")} type="number" min="0" max="365" required/></label></div>
    </>}
    {kind==="external_driver"&&<>
      <label>Nombre y apellido<input {...input("name")} required minLength={2} maxLength={120}/></label>
      <div className="two-fields"><label>RUT del conductor<input {...input("tax_id")} required maxLength={20} placeholder="12.345.678-5"/></label><label>Teléfono (opcional)<input {...input("phone")} type="tel" maxLength={40}/></label></div>
      <label>Transportista<input {...input("company_name")} required minLength={2} maxLength={160}/></label>
    </>}
    {registration&&<>
      <label>Conductor<select {...input(own?"user_id":"external_driver_id")} required><option value="">Seleccione</option>{unavailable(own?"user_id":"external_driver_id",own?workerChoices.map(x=>x.id):externalDrivers.map(x=>x.id))}{own?workerChoices.map(item=><option key={item.id} value={item.id}>{item.name}</option>):externalDrivers.map(item=><option key={item.id} value={item.id}>{item.name} · {item.company_name}</option>)}</select></label>
      <label>Requisito<select {...input("requirement_id")} required><option value="">Seleccione</option>{unavailable("requirement_id",requirements.map(x=>x.id))}{requirements.map(item=><option key={item.id} value={item.id}>{item.name} · {item.client_name}{item.site_name?` / ${item.site_name}`:""}</option>)}</select></label>
      <label>Folio o referencia<input {...input("reference")} required minLength={2} maxLength={160}/></label>
      <div className="two-fields"><label>Fecha de emisión<input {...input("issued_on")} type="date" required/></label><label>Vencimiento<input {...input("expires_on")} type="date" required min={fields.issued_on||undefined}/></label></div>
    </>}
    {(kind==="disable"||review&&decision!=="verificada")&&<label>{kind==="disable"?"Motivo para desactivar":decision==="rechazada"?"Motivo de rechazo":"Motivo de revocación"}<input {...input("reason")} required minLength={5} maxLength={500} placeholder="Explique el motivo"/></label>}
    <SubmitButton className="button button-outline" disabled={kind==="profile"?!worker:kind==="requirement"?!fields.client_id:registration?!requirements.length||!(own?workerChoices.length:externalDrivers.length):false}>{review?decision==="verificada"?"Verificar":decision==="rechazada"?"Rechazar":"Confirmar":labels[kind]}</SubmitButton>
  </form>;
}
