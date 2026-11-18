"use client";

import {useState} from "react";
import type {Worker} from "@/lib/personnel";
import {createRequirementAction,saveWorkerProfileAction} from "@/app/personnel-actions";
import {SubmitButton} from "./Transition";

type Profile=Pick<Worker,"id"|"name"|"role"|"national_id"|"position"|"shift"|"phone"|"employer">;
const roleName=(role:string)=>role==="conductor"?"Conductor":"Operaciones";
export function WorkerProfileForm({workers}:{workers:Profile[]}){
  const [workerId,setWorkerId]=useState("");
  const worker=workers.find(item=>item.id===workerId);
  return <form action={saveWorkerProfileAction} className="form-stack compact">
    <label>Trabajador<select name="user_id" value={workerId} onChange={event=>setWorkerId(event.target.value)} required disabled={!workers.length}><option value="">Seleccione</option>{workers.map(item=><option key={item.id} value={item.id}>{item.name} · {roleName(item.role)}</option>)}</select></label>
    <fieldset className="profile-fields" key={workerId} disabled={!worker}>
      <label>Empresa empleadora<select name="employer" defaultValue={worker?.employer??"rerchar"}><option value="rerchar">RERCHAR Chile SpA</option><option value="e_y_j">E y J Limitada</option></select></label>
      <div className="two-fields"><label>Identificación<input name="national_id" maxLength={20} defaultValue={worker?.national_id??""}/></label><label>Cargo<input name="position" maxLength={120} defaultValue={worker?.position??""}/></label></div>
      <div className="two-fields"><label>Turno<input name="shift" maxLength={80} defaultValue={worker?.shift??""}/></label><label>Teléfono<input name="phone" type="tel" maxLength={40} defaultValue={worker?.phone??""}/></label></div>
    </fieldset>
    <p className="helper-text" role="status">{!workers.length?"No hay trabajadores activos de operaciones o conducción.":worker?"La ficha muestra los datos actuales del trabajador seleccionado.":"Seleccione un trabajador para cargar su ficha actual."}</p>
    <SubmitButton className="button button-outline" disabled={!worker}>Guardar ficha</SubmitButton>
  </form>;
}

export function RequirementForm({clients,sites}:{clients:{id:string;name:string}[];sites:{id:string;client_id:string;name:string}[]}){
  const [clientId,setClientId]=useState("");
  const [siteId,setSiteId]=useState("");
  const availableSites=sites.filter(site=>site.client_id===clientId);
  return <form action={createRequirementAction} className="form-stack compact">
    <label>Cliente<select name="client_id" value={clientId} onChange={event=>{setClientId(event.target.value);setSiteId("");}} required><option value="">Seleccione</option>{clients.map(client=><option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
    <label>Faena (opcional)<select name="site_id" value={siteId} onChange={event=>setSiteId(event.target.value)} disabled={!clientId}><option value="">{clientId?"Todas las faenas del cliente":"Seleccione primero un cliente"}</option>{availableSites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
    <p className="helper-text">{!clientId?"Las faenas se cargan al seleccionar el cliente.":!availableSites.length?"Este cliente aún no tiene faenas registradas. El requisito se aplicará a todas sus faenas.":"Puede elegir una faena o aplicar el requisito a todas las del cliente."}</p>
    <label>Documento o habilitación requerida<input name="name" minLength={3} maxLength={150} required placeholder="Licencia clase A5, examen, inducción…"/></label>
    <div className="two-fields"><label>Tipo<select name="kind" defaultValue="licencia"><option value="licencia">Licencia</option><option value="curso">Curso</option><option value="examen">Examen</option><option value="acreditacion">Acreditación</option><option value="otro">Otro</option></select></label><label>Advertir con días de anticipación<input name="warning_days" type="number" min="0" max="365" defaultValue="30" required/></label></div>
    <SubmitButton className="button button-outline" disabled={!clientId}>Agregar requisito</SubmitButton>
  </form>;
}

export function CredentialDates(){
  const [issued,setIssued]=useState("");
  return <div className="two-fields"><label>Fecha de emisión<input name="issued_on" type="date" required value={issued} onChange={event=>setIssued(event.target.value)}/></label><label>Vencimiento<input name="expires_on" type="date" required min={issued||undefined}/></label></div>;
}
