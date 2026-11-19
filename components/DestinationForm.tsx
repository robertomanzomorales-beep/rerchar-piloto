"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {Plus} from "lucide-react";
import {createDestinationAction,updateDestinationAction} from "@/app/destination-actions";
import {destinationDay,wasteCategories,facilityTypes,disposalUnits} from "@/lib/destination-catalog";
import {destinationHref,emptyDestinationState,type DestinationContext,type DestinationFormKind} from "@/lib/destination-form-state";
import type {QuoteDestination} from "@/lib/destinations";
import {SubmitButton} from "./Transition";

export default function DestinationForm({kind,context,destination,open=false}:{kind:DestinationFormKind;context:DestinationContext;destination?:QuoteDestination;open?:boolean}){
  const [state,action,pending]=useActionState(kind==="create"?createDestinationAction:updateDestinationAction,emptyDestinationState,destinationHref(context,kind,destination?.id));
  const [values,setValues]=useState<Record<string,string>>(()=>Object.keys(state.values).length?state.values:destination?{
    name:destination.name,facility_type:destination.facility_type,address:destination.address??"",commune:destination.commune??"",
    latitude:destination.latitude??"",longitude:destination.longitude??"",location_url:destination.location_url??"",status:destination.status,
    authorization_reference:destination.authorization_reference??"",authorization_valid_until:destinationDay(destination.authorization_valid_until),
    disposal_unit:destination.disposal_unit??"",disposal_price_clp:destination.disposal_price_clp??"",
  }:{facility_type:"otro"});
  const [categories,setCategories]=useState(state.error?state.categories:destination?.accepted_categories??[]);
  const errorRef=useRef<HTMLDivElement>(null),fileRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(state.error){setValues(state.values);setCategories(state.categories);if(fileRef.current)fileRef.current.value="";const details=errorRef.current?.closest("details");if(details)details.open=true;errorRef.current?.focus();}},[state]);
  const input=(name:string)=>({name,value:values[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setValues(previous=>({...previous,[name]:event.target.value}))});
  const form=<form action={action} className="form-grid destination-form" data-destination-form={kind}>
    {context.empresa&&<input type="hidden" name="empresa" value={context.empresa}/>}{destination&&<input name="id" type="hidden" value={destination.id}/>}
    {state.error&&<div ref={errorRef} tabIndex={-1} className="notice notice-error request-form-error field-full" role="alert"><strong>No se pudo guardar el destino.</strong><span>{state.error}</span><small>Los datos ingresados se conservan.{state.fileName?` Vuelva a adjuntar ${state.fileName}.`:""}</small></div>}
    <fieldset disabled={pending} className="field-full destination-fields form-grid">
      <label className="field-full">Nombre de planta o receptor<input {...input("name")} required minLength={3} maxLength={180}/></label>
      <label>Tipo de instalación<select {...input("facility_type")}>{facilityTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
      <label>Comuna<input {...input("commune")} maxLength={100}/></label><label className="field-full">Dirección / referencia vial<input {...input("address")} maxLength={250}/></label>
      <label>Latitud<input {...input("latitude")} type="number" step="0.000001" min="-90" max="90"/></label><label>Longitud<input {...input("longitude")} type="number" step="0.000001" min="-180" max="180"/></label>
      <label className="field-full">Enlace de ubicación<input {...input("location_url")} type="url" maxLength={500} placeholder="https://maps.google.com/..."/></label>
      <p className="helper-text field-full">Registre las dos coordenadas o deje ambas vacías.</p>
      {kind==="update"&&<>
        <fieldset className="field-full"><legend>Residuos admitidos según autorización</legend><div className="destination-category-grid">{wasteCategories.map(c=><label className="check-row" key={c.value}><input type="checkbox" name="accepted_categories" value={c.value} checked={categories.includes(c.value)} onChange={event=>setCategories(previous=>event.target.checked?[...previous,c.value]:previous.filter(value=>value!==c.value))}/>{c.label}</label>)}</div></fieldset>
        <label className="field-full">Referencia de autorización / permiso<input {...input("authorization_reference")} maxLength={180}/></label>
        <label>Autorización vigente hasta<input {...input("authorization_valid_until")} type="date"/></label>
        <label>Unidad de disposición<select {...input("disposal_unit")}><option value="">Seleccione</option>{disposalUnits.map(u=><option key={u.value} value={u.value}>{u.label}</option>)}</select></label>
        <label>Tarifa de disposición (CLP, puede ser 0)<input {...input("disposal_price_clp")} type="number" step="0.01" min="0" max="100000000"/></label>
        <label>Estado<select {...input("status")}><option value="pendiente">Pendiente de validar</option><option value="habilitado">Habilitado</option><option value="suspendido">Suspendido</option></select></label>
        <label className="field-full">Respaldo de autorización (PDF, JPG o PNG; máximo 4 MB)<input ref={fileRef} type="file" name="authorization_document" accept=".pdf,.jpg,.jpeg,.png"/>{destination?.authorization_document_name&&<small className="table-sub">Actual: <a href={`/api/destinos/${destination.id}/respaldo`}>{destination.authorization_document_name}</a></small>}</label>
        <p className="helper-text field-full">Para habilitar el destino se exige categoría, autorización vigente, tarifa y respaldo. Si ya existe un archivo, se conserva al guardar.</p>
      </>}
      <div className="field-full form-footer"><SubmitButton className="button button-primary">{kind==="create"?"Agregar como pendiente":"Guardar destino"}</SubmitButton></div>
    </fieldset>
  </form>;
  return kind==="create"?<details className="destination-create" id="crear-destino" open={open||!!state.error}><summary><Plus size={17}/> Agregar destino</summary>{form}</details>:form;
}
