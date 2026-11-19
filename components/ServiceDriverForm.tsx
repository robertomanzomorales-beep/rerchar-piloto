"use client";

import Link from "next/link";
import {useActionState,useEffect,useRef,useState,type ChangeEvent} from "react";
import {createDriverForServiceAction,createExternalDriverForServiceAction} from "@/app/actions";
import {serviceDriverAnchor,serviceDriverHref,type ServiceDriverKind,type ServiceDriverState,type ServiceDriverValues} from "@/lib/service-driver-state";
import {serviceDayContext,type ServiceDayContext} from "@/lib/service-day-state";
import {SubmitButton} from "./Transition";

export default function ServiceDriverForm({id,kind,context={},open=false,disabled=false}:{id:string;kind:ServiceDriverKind;context?:ServiceDayContext;open?:boolean;disabled?:boolean}){
  const [state,action]=useActionState<ServiceDriverState,FormData>(kind==="account"?createDriverForServiceAction:createExternalDriverForServiceAction,{error:"",values:{}},serviceDriverHref(id,kind,context));
  const [fields,setFields]=useState<ServiceDriverValues>(()=>state.values),[password,setPassword]=useState("");
  const errorRef=useRef<HTMLDivElement>(null),account=kind==="account";
  useEffect(()=>{if(state.error){setPassword("");const details=errorRef.current?.closest("details");if(details)details.open=true;errorRef.current?.focus();}},[state]);
  const input=(name:keyof ServiceDriverValues)=>({name,value:fields[name]??"",onChange:(event:ChangeEvent<HTMLInputElement>)=>setFields(previous=>({...previous,[name]:event.target.value}))});
  return <details id={serviceDriverAnchor(kind)} className="small-action service-operation-section" open={open||Boolean(state.error)}><summary>{account?"Crear cuenta de conductor":"Registrar conductor de transportista (sin cuenta)"}</summary>
    <p className="helper-text">{account?"La cuenta permite ingresar al software como conductor. Después de crearla, revise y guarde la planificación del servicio.":<>Identifique al tercero por RUT y transportista. Si la faena exige documentos, regístrelos y verifíquelos en <Link href="/personal">Personal</Link> antes de programar. Operaciones registrará los respaldos con su propia cuenta.</>}</p>
    <form action={action} className="form-stack compact" data-service-driver-form={kind}>
      <input type="hidden" name="id" value={id}/>{Object.entries(serviceDayContext(context)).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
      {state.error&&<div ref={errorRef} tabIndex={-1} role="alert" className="notice notice-error request-form-error"><strong>No se pudo registrar el conductor.</strong><span>{state.error}</span><small>{account?"El nombre y el correo se conservan. Por seguridad, vuelva a escribir la contraseña.":"Los datos ingresados se conservan. Revise la información e intente nuevamente."}</small></div>}
      {disabled&&<p className="notice" role="status">Este servicio ya no admite nuevos registros desde despacho. Los datos se conservan para su revisión.</p>}
      <fieldset disabled={disabled} className="form-stack compact" style={{border:0,padding:0,margin:0,minWidth:0}}>
        {account?<><div className="two-fields"><label>Nombre del conductor<input {...input("name")} required minLength={2} maxLength={120} placeholder="Nombre y apellido" autoComplete="off"/></label><label>Correo del conductor<input {...input("email")} type="email" maxLength={254} autoComplete="off" required placeholder="conductor@empresa.cl"/></label></div><label>Contraseña inicial (mínimo 12 caracteres)<input name="password" type="password" value={password} onChange={event=>setPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required/></label></>:<><div className="two-fields"><label>Nombre y apellido<input {...input("name")} required minLength={2} maxLength={120}/></label><label>RUT del conductor<input {...input("tax_id")} required maxLength={20} placeholder="12.345.678-5"/></label></div><div className="two-fields"><label>Transportista<input {...input("company_name")} required minLength={2} maxLength={160}/></label><label>Teléfono (opcional)<input {...input("phone")} type="tel" maxLength={40}/></label></div></>}
        <SubmitButton className="button button-outline" disabled={disabled}>{account?"Crear conductor y volver al despacho":"Registrar tercero"}</SubmitButton>
      </fieldset>
    </form>
  </details>;
}
