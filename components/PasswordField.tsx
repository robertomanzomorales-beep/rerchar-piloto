"use client";

import {useId,useState} from "react";
import {Eye,EyeOff} from "lucide-react";

export function PasswordField({label="Contraseña",name="password",autoComplete="current-password",minLength,maxLength}:{
  label?:string;name?:string;autoComplete?:string;minLength?:number;maxLength?:number;
}){
  const id=useId();
  const [visible,setVisible]=useState(false);
  return <div className="password-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-control">
      <input id={id} name={name} type={visible?"text":"password"} autoComplete={autoComplete} required minLength={minLength} maxLength={maxLength}/>
      <button type="button" aria-label={visible?"Ocultar contraseña":"Mostrar contraseña"} aria-pressed={visible}
        onClick={()=>setVisible(current=>!current)} title={visible?"Ocultar contraseña":"Mostrar contraseña"}>
        {visible?<EyeOff size={18} aria-hidden="true"/>:<Eye size={18} aria-hidden="true"/>}
      </button>
    </div>
  </div>;
}
