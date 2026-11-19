"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {assignServiceAction,scheduleRentalAction,cancelServiceAction,reportServiceDayAction,saveChecklistAction,finishServiceAction} from "@/app/actions";
import {serviceOperationFields,serviceOperationAnchors,type ServiceOperationKind,type ServiceOperationValues,type ServiceOperationState} from "@/lib/service-operation-state";
import {serviceDayHref,serviceDayContext,type ServiceDayContext} from "@/lib/service-day-state";
import type {Company} from "@/lib/companies";
import {DocumentReader,type DocumentSource} from "./DocumentReader";
import {SubmitButton} from "./Transition";

export type ServiceResourceChoice={value:string;label:string};
const actions={plan:assignServiceAction,rental:scheduleRentalAction,cancel:cancelServiceAction,day:reportServiceDayAction,checklist:saveChecklistAction,finish:finishServiceAction};
const labels={plan:"Programar servicio",rental:"Programar arriendo",cancel:"Confirmar cancelación",day:"Guardar parte del día",checklist:"Guardar checklist",finish:"Validar y cerrar servicio"};
export default function ServiceOperationForm({kind,id,values={},assets=[],ramps=[],drivers=[],externalDrivers=[],updating=false,purchase=false,ticketReady=false,disabled=false,minDay,maxDay,sources=[],dayContext={},company}:{
  kind:ServiceOperationKind;id:string;values?:ServiceOperationValues;assets?:ServiceResourceChoice[];ramps?:ServiceResourceChoice[];drivers?:ServiceResourceChoice[];externalDrivers?:ServiceResourceChoice[];
  updating?:boolean;purchase?:boolean;ticketReady?:boolean;disabled?:boolean;minDay?:string;maxDay?:string;sources?:DocumentSource[];dayContext?:ServiceDayContext;company?:Company|null;
}){
  const permalink=kind==="day"?serviceDayHref(id,dayContext,"parte-diario",{formulario:"day"}):`/solicitudes/${encodeURIComponent(id)}?formulario=${kind}#${serviceOperationAnchors[kind]}`;
  const [state,action]=useActionState<ServiceOperationState,FormData>(actions[kind],{error:"",values:{}},permalink);
  const [fields,setFields]=useState<ServiceOperationValues>(()=>Object.fromEntries(serviceOperationFields[kind].map(key=>[key,state.values[key]??values[key]??""])));
  const input=(name:keyof ServiceOperationValues)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setFields(previous=>({...previous,[name]:event.target.value}))});
  const check=(name:keyof ServiceOperationValues)=>({name,type:"checkbox" as const,checked:fields[name]==="on",onChange:(event:ChangeEvent<HTMLInputElement>)=>setFields(previous=>({...previous,[name]:event.target.checked?"on":""}))});
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error){const details=errorRef.current?.closest("details");if(details)details.open=true;errorRef.current?.focus();}},[state]);
  function unavailable(name:keyof ServiceOperationValues,choices:ServiceResourceChoice[]){const value=fields[name];return value&&!choices.some(choice=>choice.value===value)?<option value={value}>Selección anterior no disponible · elija otra opción</option>:null;}
  const stacked=kind==="checklist"||kind==="cancel";
  const gross=Number(fields.gross_kg),tare=Number(fields.tare_kg),hasWeights=Boolean(fields.gross_kg&&fields.tare_kg)&&Number.isFinite(gross)&&Number.isFinite(tare);
  return <form action={action} className={`${stacked?"form-stack":"form-grid detail-form"} service-operation-form`} data-service-operation={kind}>
    <input type="hidden" name="id" value={id}/>
    {kind==="day"&&<><input type="hidden" name="expected_revision" value={fields.expected_revision??""}/><input type="hidden" name="parte_empresa" value={company??""}/>{Object.entries(serviceDayContext(dayContext)).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}</>}
    {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo guardar el cambio.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small>{kind==="day"&&<a href={serviceDayHref(id,{...dayContext,parte:fields.day,nuevo_parte:undefined},"editar-parte")} onClick={event=>{const target=new URL(event.currentTarget.href);if(target.pathname===window.location.pathname&&target.search===window.location.search){event.preventDefault();window.location.hash=target.hash;window.location.reload();}}}>Reabrir el parte guardado</a>}</div>}
    {kind==="plan"&&<>
      <label>Fecha y hora (Chile)<input {...input("scheduled_for")} type="datetime-local" required/></label>
      <label>Camión<select {...input("asset_id")} required><option value="">Seleccione un camión</option>{unavailable("asset_id",assets)}{assets.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Conductor propio o tercero<select {...input("driver_selection")} required><option value="">Seleccione un conductor</option>{unavailable("driver_selection",[...drivers,...externalDrivers])}{drivers.length>0&&<optgroup label="Equipo con acceso al sistema">{drivers.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>}{externalDrivers.length>0&&<optgroup label="Transportistas terceros · sin cuenta">{externalDrivers.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>}</select></label>
      <label>Rampla (si corresponde)<select {...input("ramp_asset_id")}><option value="">Sin rampla</option>{unavailable("ramp_asset_id",ramps)}{ramps.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <p className="helper-text field-full">Si cambia fecha, hora, camión, rampla o conductor, deberá completar nuevamente el checklist antes de iniciar la ruta.</p>
    </>}
    {kind==="rental"&&<label>Equipo propio (opcional)<select {...input("asset_id")}><option value="">Equipo descrito en la solicitud</option>{unavailable("asset_id",assets)}{assets.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
    {kind==="cancel"&&<label>Motivo de la cancelación<textarea {...input("reason")} rows={2} minLength={5} maxLength={500} required placeholder="Explique por qué no continuará el servicio"/></label>}
    {kind==="day"&&<>
      <p className="helper-text field-full">{updating?"Está corrigiendo un parte existente. Se conservan su fecha, camión y conductor originales.":"Registre el resultado de una fecha sin parte. Para corregir una fecha ya registrada, ábrala desde el historial."}</p>
      <label>Fecha del trabajo<input {...input("day")} type="date" min={minDay} max={maxDay} readOnly={updating} required/></label>
      <label>Resultado<select {...input("outcome")}><option value="completado">Realizado</option><option value="incompleto">Incompleto</option><option value="suspendido">Suspendido</option></select></label>
      <label className="field-full">Observación o causa<textarea {...input("observation")} rows={3} maxLength={1000} minLength={fields.outcome!=="completado"?5:undefined} required={fields.outcome!=="completado"} placeholder="Explique lo pendiente o el motivo de suspensión"/></label>
    </>}
    {kind==="checklist"&&<>
      <div className="check-grid">{([["vehicle_ok","Vehículo inspeccionado"],["documents_ok","Documentos y guía revisados"],["containment_ok","Carga y contención verificada"],["ppe_ok","Elementos de protección disponibles"]] as const).map(([name,label])=><label key={name} className="check-row"><input {...check(name)}/><span>{label}</span></label>)}</div>
      <label className="check-row"><input {...check("vehicle_failure")}/> Detecté una falla del camión que requiere mantenimiento</label>
      <label>Observaciones<textarea {...input("comment")} rows={3} maxLength={1000} minLength={fields.vehicle_failure==="on"?5:undefined} required={fields.vehicle_failure==="on"} placeholder="Si el camión presenta una falla, descríbala aquí"/></label>
      <p className="helper-text">Si detectó una falla del camión, márquela arriba, desmarque «Vehículo inspeccionado» y describa el hallazgo: se enviará a Mantenimiento y detendrá la salida hasta resolverlo. Puede adjuntar fotos abajo, en Documentación del servicio.</p>
    </>}
    {kind==="finish"&&<>
      {purchase&&<>
        <label className="check-row field-full"><input {...check("confirm_guide")} required/> Cotejé la Guía de Traslado adjunta con el retiro</label>
        <label className="check-row field-full"><input {...check("confirm_sheet")} required/> Cotejé la Hoja de Servicio adjunta con el retiro</label>
        {ticketReady?<label className="check-row field-full"><input {...check("confirm_ticket")} required/> Cotejé el ticket de pesaje adjunto</label>:<label className="field-full">Motivo de ausencia del ticket<input {...input("missing_ticket_reason")} required minLength={5} maxLength={500} placeholder="Ej.: El cliente no entregó ticket"/></label>}
        <label>Material realmente recibido<input {...input("material_name")} data-document-controlled required minLength={2} maxLength={160}/></label>
        <label>Impurezas detectadas (kg)<input {...input("impurity_kg")} data-document-controlled type="number" min="0" step="0.01" required/></label>
        <label className="check-row field-full"><input {...check("confirm_material")} required/> Confirmé tipo de material y cantidad recibida</label>
        <label className="check-row field-full"><input {...check("confirm_weight")} required/> Verifiqué peso bruto, tara y peso neto</label>
        <label className="check-row field-full"><input {...check("confirm_impurities")} required/> Revisé impurezas y diferencias; las anoté abajo si corresponde</label>
        <label className="field-full">Observaciones de recepción<textarea {...input("review_note")} rows={3} maxLength={1000} minLength={Number(fields.impurity_kg)>0?5:undefined} required={Number(fields.impurity_kg)>0} placeholder="Describa impurezas, discrepancias o condiciones del material"/></label>
      </>}
      <DocumentReader fields={["gross_kg","tare_kg","guide_number",...(purchase?["material_name","impurity_kg"] as const:[])]} aliases={{guide_number:["origin_guide","transfer_guide"]}} sources={sources} onApply={selected=>setFields(previous=>({...previous,...selected}))}/>
      <label>Peso bruto validado (kg)<input {...input("gross_kg")} data-document-controlled type="number" min="0.01" step="0.01" required/></label>
      <label>Tara validada (kg)<input {...input("tare_kg")} data-document-controlled type="number" min="0" max={fields.gross_kg||undefined} step="0.01" required/></label>
      {hasWeights&&<p className="helper-text field-full" role="status">{gross>=tare?`Peso neto calculado: ${(gross-tare).toLocaleString("es-CL",{maximumFractionDigits:2})} kg.`:"El peso bruto debe ser igual o mayor que la tara."}</p>}
      <label className="field-full">Número de guía recibido<input {...input("guide_number")} data-document-controlled maxLength={50} required={purchase}/></label>
    </>}
    <div className={stacked?"form-footer":"field-full form-footer"}><SubmitButton className={"button "+(["plan","rental","finish"].includes(kind)?"button-primary":"button-outline")} disabled={disabled}>{updating&&kind==="plan"?"Actualizar planificación":updating&&kind==="rental"?"Actualizar reserva":updating&&kind==="day"?"Guardar corrección del parte":labels[kind]}</SubmitButton></div>
  </form>;
}
