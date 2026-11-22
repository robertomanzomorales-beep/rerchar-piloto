"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {setFleetDayAction} from "@/app/actions";
import {fleetDayHref,type FleetDayContext,type FleetDayFormState,type FleetDayValues} from "@/lib/fleet-day-form-state";
import {SubmitButton} from "./Transition";

const kinds=[{value:"nota",label:"Observación"},{value:"mantencion",label:"Mantención"},
  {value:"indisponible",label:"Fuera de servicio"},{value:"sin_conductor",label:"Sin conductor"},
  {value:"despejado",label:"Borrar novedad del día"}];

export default function FleetDayForm({trucks,context,firstDay,lastDay}:{
  trucks:{id:string;code:string;plate:string|null;label:string}[];context:FleetDayContext;firstDay:string;lastDay:string;
}){
  const [state,action]=useActionState<FleetDayFormState,FormData>(setFleetDayAction,{error:"",values:{}},fleetDayHref(context));
  const [values,setValues]=useState<FleetDayValues>(()=>({asset_id:"",day:firstDay,kind:"nota",detail:"",...state.values}));
  const notice=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error)notice.current?.focus();},[state]);
  const input=(name:keyof FleetDayValues)=>({name,value:values[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setValues(previous=>({...previous,[name]:event.target.value}))});
  const available=trucks.some(truck=>truck.id===values.asset_id),validKind=kinds.some(kind=>kind.value===values.kind);
  return <form action={action} className="form-stack" data-fleet-day-form="note">
    <input type="hidden" name="inicio" value={context.inicio??""}/><input type="hidden" name="empresa" value={context.empresa??""}/>
    {context.partes==="pendientes"&&<><input type="hidden" name="partes" value="pendientes"/><input type="hidden" name="pagina" value={context.pagina??"1"}/></>}
    {state.error&&<div ref={notice} role="alert" tabIndex={-1} className="notice notice-error request-form-error"><strong>No se pudo guardar la novedad.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    <label>Camión<select {...input("asset_id")} required><option value="">Seleccione camión</option>{values.asset_id&&!available&&<option value={values.asset_id} disabled>Selección anterior no disponible</option>}{trucks.map(truck=><option key={truck.id} value={truck.id}>{truck.plate||truck.code} · {truck.label}</option>)}</select></label>
    <label>Día<input {...input("day")} type="date" min={firstDay} max={lastDay} required/></label>
    <label>Tipo<select {...input("kind")} required>{!validKind&&<option value={values.kind} disabled>Selección anterior no disponible</option>}{kinds.map(kind=><option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
    <label>Detalle<textarea {...input("detail")} required={values.kind!=="despejado"} minLength={values.kind!=="despejado"?2:undefined} maxLength={500} rows={3} placeholder="Qué ocurrió o por qué se bloquea"/></label>
    {values.asset_id&&!available&&<p className="helper-text">El camión seleccionado ya no está disponible. Seleccione otro camión antes de guardar.</p>}
    {!trucks.length&&<p className="helper-text">No hay camiones registrados para agregar una novedad.</p>}
    <SubmitButton className="button button-primary" disabled={!available||!validKind}>Guardar novedad</SubmitButton>
  </form>;
}
