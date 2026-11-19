"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import Link from "next/link";
import {registerFuelAction} from "@/app/continuity-actions";
import type {AssetBrief,FuelService} from "@/lib/continuity";
import {serviceFolio} from "@/lib/companies";
import {fuelHref,type FuelContext,type FuelFormState,type FuelValues} from "@/lib/fuel-form-state";
import {SubmitButton} from "./Transition";

type FuelAsset=Pick<AssetBrief,"id"|"code"|"label"|"reading_unit"|"current_reading">;
const amount=(value:string|number)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:2});
export function FuelForm({assets,drivers,services,context,submissionKey,today}:{assets:FuelAsset[];drivers:{id:string;name:string}[];services:FuelService[];context:FuelContext;submissionKey:string;today:string}){
  const [state,action]=useActionState<FuelFormState,FormData>(registerFuelAction,{error:"",values:{}},fuelHref(context,"nueva-carga"));
  const [fields,setFields]=useState<FuelValues>(()=>({submission_key:submissionKey,fuel_date:today,...state.values}));
  const notice=useRef<HTMLDivElement>(null),showError=!!state.error&&state.values.submission_key===fields.submission_key;
  useEffect(()=>{if(showError)notice.current?.focus();},[state,showError]);
  const input=(name:keyof FuelValues)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>{const value=event.target.value;setFields(previous=>({...previous,[name]:value}));}});
  const asset=assets.find(x=>x.id===fields.asset_id),eligible=assets.filter(x=>x.reading_unit!=="sin");
  const choices=services.filter(x=>x.asset_id===fields.asset_id&&(!fields.driver_id||x.driver_id===fields.driver_id));
  const unavailable=(name:keyof FuelValues,ids:string[])=>fields[name]&&!ids.includes(fields[name]!)?<option value={fields[name]}>Selección anterior no disponible</option>:null;
  const liters=Number(fields.liters),cost=Number(fields.cost_clp),costPerLiter=fields.cost_clp!==undefined&&fields.cost_clp!==""&&liters>0&&Number.isFinite(liters)&&Number.isFinite(cost)&&cost>=0?cost/liters:null;
  return <form action={action} className="form-stack fuel-entry-form" data-fuel-form>
    {Object.entries(context).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}<input type="hidden" name="submission_key" value={fields.submission_key}/>
    {showError&&<div ref={notice} role="alert" tabIndex={-1} className="notice notice-error request-form-error"><strong>No se pudo registrar la carga.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small>{state.canRenew&&<button type="button" className="button button-outline" onClick={()=>setFields(previous=>({...previous,submission_key:crypto.randomUUID()}))}>Preparar otra carga</button>}</div>}
    {state.canRenew&&!showError&&<p className="helper-text" role="status">Los datos están listos para otra carga. Revise y confirme el registro.</p>}
    <label>Activo<select name="asset_id" value={fields.asset_id??""} required onChange={event=>{const value=event.target.value;setFields(previous=>({...previous,asset_id:value,service_id:""}));}}><option value="">Seleccione activo</option>{unavailable("asset_id",eligible.map(x=>x.id))}{eligible.map(x=><option key={x.id} value={x.id}>{x.code} · {x.label} · {amount(x.current_reading)} {x.reading_unit}</option>)}</select></label>
    {!eligible.length&&<p className="helper-text">{assets.length?<>Configure kilómetros u horas en <Link href={context.empresa?`/mantenimiento?empresa=${context.empresa}`:"/mantenimiento"}>Mantenimiento · Actualizar activo</Link> para registrar combustible.</>:<>Agregue un camión en <Link href="/maestros">Maestros</Link> para registrar combustible.</>}</p>}
    <div className="two-fields"><label>Fecha<input {...input("fuel_date")} type="date" required/></label><label>Conductor (opcional)<select name="driver_id" value={fields.driver_id??""} onChange={event=>{const value=event.target.value,selected=services.find(x=>x.id===fields.service_id);setFields(previous=>({...previous,driver_id:value,...(value&&selected&&selected.driver_id!==value?{service_id:""}:{})}));}}><option value="">No asociado</option>{unavailable("driver_id",drivers.map(x=>x.id))}{drivers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>
    <label>Servicio asociado (opcional)<select {...input("service_id")} disabled={!asset}><option value="">Sin servicio</option>{unavailable("service_id",choices.map(x=>x.id))}{choices.map(x=><option key={x.id} value={x.id}>{serviceFolio(x)}</option>)}</select></label><p className="helper-text">{!asset?"Seleccione un activo para consultar sus servicios.":choices.length?"Se muestran los servicios del activo y, si lo eligió, del conductor.":"No hay servicios disponibles para esta selección. Puede registrar la carga sin asociar uno."}</p>
    <div className="two-fields"><label>Litros<input {...input("liters")} type="number" min="0.001" max="100000000" step="0.001" required/></label><label>Costo total ($ CLP)<input {...input("cost_clp")} type="number" min="0" max="100000000" step="0.01" required/></label></div>
    {costPerLiter!==null&&<p className="helper-text" role="status">Costo por litro: ${amount(costPerLiter)} CLP</p>}
    <label>Lectura del activo ({asset?asset.reading_unit:"km u horas"})<input {...input("reading")} type="number" min={asset?.current_reading??"0"} max="100000000" step="0.01" required/></label>{asset&&<p className="helper-text">Lectura vigente: {amount(asset.current_reading)} {asset.reading_unit}.</p>}
    <label className="check-row"><input name="full_tank" type="checkbox" checked={fields.full_tank==="on"} onChange={event=>{const checked=event.target.checked;setFields(previous=>({...previous,full_tank:checked?"on":""}));}}/> Tanque completo</label>
    <p className="helper-text">Permite estimar km/L entre dos cargas completas consecutivas, con fechas en orden y avance de lectura. Las cargas parciales quedan registradas sin estimación.</p>
    <div className="two-fields"><label>Proveedor<input {...input("supplier")} required minLength={2} maxLength={160}/></label><label>Número de comprobante<input {...input("receipt_number")} required minLength={2} maxLength={80}/></label></div><label>Observaciones<textarea {...input("notes")} rows={3} maxLength={1000}/></label>
    <SubmitButton className="button button-primary" disabled={!asset||asset.reading_unit==="sin"}>Registrar carga</SubmitButton>
  </form>;
}
