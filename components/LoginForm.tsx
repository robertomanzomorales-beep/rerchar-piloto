"use client";

import {useActionState,useEffect,useRef,useState} from "react";
import {loginAction} from "@/app/actions";
import type {LoginState} from "@/lib/login-state";
import {PasswordField} from "./PasswordField";
import {SubmitButton} from "./Transition";

export default function LoginForm({initialError=""}:{initialError?:string}){
  const [state,action]=useActionState<LoginState,FormData>(loginAction,{error:initialError,email:""},"/ingresar");
  const [email,setEmail]=useState(state.email),[password,setPassword]=useState(""),[passwordEpoch,setPasswordEpoch]=useState(0),errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error){setPassword("");setPasswordEpoch(value=>value+1);errorRef.current?.focus();}},[state]);
  return <form action={action} className="form-stack" data-login-form>
    {state.error&&<div id="login-error" ref={errorRef} tabIndex={-1} className="notice notice-error request-form-error" role="alert"><span>{state.error}</span><small>El correo se conserva. Vuelva a escribir la contraseña.</small></div>}
    <label>Correo electrónico<input name="email" type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} aria-describedby={state.error?"login-error":undefined} required placeholder="nombre@empresa.cl"/></label>
    <PasswordField key={passwordEpoch} value={password} onChange={event=>setPassword(event.target.value)} maxLength={128}/>
    <SubmitButton className="button button-primary button-full">Ingresar</SubmitButton>
  </form>;
}
