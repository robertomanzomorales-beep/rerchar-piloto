"use client";

import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {createAssetAction,createClientAction,createSiteAction,updateAssetAction,updateClientAction,updateSiteAction} from "@/app/actions";
import {masterAnchor,masterHref,type MasterContext,type MasterFormKind,type MasterFormState,type MasterValues} from "@/lib/master-form-state";
import {SubmitButton} from "./Transition";

const actions={client:createClientAction,site:createSiteAction,asset:createAssetAction,edit_client:updateClientAction,edit_site:updateSiteAction,edit_asset:updateAssetAction};
const labels={client:"Agregar cliente",site:"Agregar centro",asset:"Agregar activo",edit_client:"Guardar cliente",edit_site:"Guardar faena",edit_asset:"Guardar activo"};
export function MasterForm({kind,context,defaults={},clients=[],locked=""}:{kind:MasterFormKind;context:MasterContext;defaults?:MasterValues;clients?:{id:string;name:string}[];locked?:string}){
  const id=defaults.id??"",[state,action]=useActionState<MasterFormState,FormData>(actions[kind],{error:"",values:{}},masterHref(context,masterAnchor(kind,id),{formulario:kind,edicion:id}));
  const [fields,setFields]=useState<MasterValues>(()=>({kind:"camion",...defaults,...state.values}));const notice=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error){const details=notice.current?.closest("details");if(details)details.open=true;notice.current?.focus();}},[state]);
  const input=(name:keyof MasterValues)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>{const value=event.target.value;setFields(previous=>({...previous,[name]:value}));}});
  const client=kind==="client"||kind==="edit_client",site=kind==="site"||kind==="edit_site",asset=kind==="asset"||kind==="edit_asset";
  return <form action={action} className="form-stack compact master-form" data-master-form={kind} data-source-id={id||undefined}>
    {Object.entries(context).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}{id&&<input type="hidden" name="id" value={id}/>}
    {state.error&&<div ref={notice} role="alert" tabIndex={-1} className="notice notice-error request-form-error"><strong>No se pudo guardar el cambio.</strong><span>{state.error}</span><small>Los datos ingresados se conservan. Revise la información e intente nuevamente.</small></div>}
    {locked&&<p className="master-locked-field">{locked}</p>}
    {client&&<><label>Razón social<input {...input("name")} required minLength={2} maxLength={180}/></label><div className="two-fields"><label>RUT (opcional)<input {...input("tax_id")} maxLength={20}/></label><label>Nombre de contacto<input {...input("contact_name")} required minLength={2} maxLength={120}/></label></div><div className="two-fields"><label>Correo para cotizaciones<input {...input("email")} type="email" maxLength={254}/></label><label>Dirección<input {...input("address")} maxLength={250}/></label></div></>}
    {site&&<>{kind==="site"&&<label>Cliente<select {...input("client_id")} required><option value="">Seleccione un cliente</option>{fields.client_id&&!clients.some(c=>c.id===fields.client_id)&&<option value={fields.client_id}>Selección anterior no disponible</option>}{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<label>Nombre del centro o faena<input {...input("name")} required minLength={2} maxLength={180}/></label><label>Dirección (opcional)<input {...input("address")} maxLength={250}/></label></>}
    {asset&&<>{kind==="asset"&&<div className="two-fields"><label>Código<input {...input("code")} required minLength={2} maxLength={30} placeholder="CAM-01" autoCapitalize="characters"/></label><label>Tipo<select {...input("kind")}><option value="camion">Camión</option><option value="rampa">Rampla</option><option value="equipo">Equipo</option></select></label></div>}<label>Patente<input {...input("plate")} maxLength={15} placeholder="Ej. ABCD-12" autoCapitalize="characters"/></label><label>Descripción<input {...input("label")} maxLength={120} required={!fields.plate?.trim()}/></label><p className="helper-text">Indique una patente o una descripción para identificar el activo. Su código y tipo se conservan después del registro.</p></>}
    <div className="form-footer"><SubmitButton className="button button-outline" disabled={kind==="site"&&!clients.length}>{labels[kind]}</SubmitButton></div>
  </form>;
}
