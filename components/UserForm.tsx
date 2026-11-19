"use client";

import {useActionState,useEffect,useId,useRef,useState} from "react";
import {KeyRound,UserRoundPlus} from "lucide-react";
import type {Role} from "@/lib/auth";
import {changeRoleAction,createAccountAction,resetAccountPasswordAction,setAccountActiveAction} from "@/app/user-actions";
import {emptyUserFormState,userHref,type UserContext,type UserFormKind} from "@/lib/user-form-state";
import {SubmitButton} from "./Transition";
import {PasswordField} from "./PasswordField";
import {UserRoleFields} from "./UserRoleFields";

const actions={create:createAccountAction,role:changeRoleAction,active:setAccountActiveAction,password:resetAccountPasswordAction};
type Target={id:string;name:string;email:string;role:Role;client_id:string|null;active:boolean};
export function UserForm({kind,context,clients,target,protectedAccount=false,initialOpen=false}:{
  kind:UserFormKind;context:UserContext;clients:{id:string;name:string}[];target?:Target;protectedAccount?:boolean;initialOpen?:boolean;
}){
  const [state,action,pending]=useActionState(actions[kind],emptyUserFormState,userHref(context,{kind,id:target?.id}));
  const [name,setName]=useState(state.values.name??""),[email,setEmail]=useState(state.values.email??"");
  const [role,setRole]=useState<Role>((state.values.role as Role)??target?.role??(clients.length?"cliente":"operaciones"));
  const [clientId,setClientId]=useState(state.values.client_id??target?.client_id??"");
  const [password,setPassword]=useState(""),[passwordEpoch,setPasswordEpoch]=useState(0);
  const errorId=useId(),errorRef=useRef<HTMLDivElement>(null),detailsRef=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    if(state.error){
      if(detailsRef.current)detailsRef.current.open=true;
      if(state.values.name!==undefined)setName(state.values.name);
      if(state.values.email!==undefined)setEmail(state.values.email);
      if(state.values.role!==undefined)setRole(state.values.role as Role);
      if(state.values.client_id!==undefined)setClientId(state.values.client_id);
      setPassword("");setPasswordEpoch(value=>value+1);errorRef.current?.focus();
    }
  },[state]);
  const form=<form action={action} className={kind==="create"?"form-grid detail-form user-account-form":"form-stack compact user-account-form"} data-user-form={kind}>
    {Object.entries(context).map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}
    {target&&<input type="hidden" name="id" value={target.id}/>}
    {state.error&&<div id={errorId} ref={errorRef} tabIndex={-1} className="notice notice-error request-form-error field-full" role="alert"><span>{state.error}</span>{(kind==="create"||kind==="password")&&<small>Vuelva a escribir la contraseña.</small>}</div>}
    {target&&kind!=="active"&&<p className="helper-text field-full">Cambios para <strong>{target.name}</strong> · {target.email}</p>}
    {kind==="create"&&<><label>Nombre<input name="name" required maxLength={120} autoComplete="off" value={name} onChange={e=>setName(e.target.value)} disabled={pending}/></label><label>Correo electrónico<input name="email" type="email" required maxLength={254} autoComplete="off" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} disabled={pending}/></label></>}
    {(kind==="create"||kind==="role")&&<UserRoleFields clients={clients} role={role} clientId={clientId} onRoleChange={setRole} onClientChange={setClientId}/>}
    {(kind==="create"||kind==="password")&&<div className="field-full"><PasswordField key={passwordEpoch} label={kind==="create"?"Contraseña inicial (12 a 128 caracteres)":"Contraseña nueva (12 a 128 caracteres)"} autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></div>}
    {kind==="role"&&<p className="helper-text field-full">Cambiar el perfil o la empresa cierra las sesiones abiertas de esta cuenta.</p>}
    {kind==="password"&&<p className="helper-text field-full">Se cerrarán todas sus sesiones. Entregue la clave por el canal acordado.</p>}
    {kind==="active"&&<input type="hidden" name="active" value={target?.active?"false":"true"}/>}
    <div className={kind==="create"?"field-full form-footer":"field-full"}><SubmitButton className={kind==="create"?"button button-primary":"button button-outline"} disabled={kind==="active"&&protectedAccount}>{kind==="create"?"Crear usuario":kind==="role"?"Guardar cambios":kind==="password"?"Cambiar clave y cerrar sesiones":target?.active?"Suspender acceso":"Reactivar cuenta"}</SubmitButton></div>
    {kind==="active"&&protectedAccount&&<small className="helper-text">Esta cuenta administrativa debe permanecer activa.</small>}
  </form>;
  if(kind==="active")return form;
  return <details className={kind==="create"?"user-create":"user-control"} ref={detailsRef} open={initialOpen||!!state.error} id={kind==="create"?"crear-cuenta":undefined}>
    <summary>{kind==="create"?<><UserRoundPlus size={18}/> Crear acceso</>:kind==="password"?<><KeyRound size={14}/> Nueva contraseña</>:"Perfil y empresa"}</summary>
    {kind==="create"&&<p className="helper-text">La contraseña inicial se entrega por el canal acordado. El perfil Cliente sólo verá la información de su empresa.</p>}
    {form}
  </details>;
}
