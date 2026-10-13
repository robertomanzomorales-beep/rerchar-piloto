"use client";

import {useEffect} from "react";
import Link from "next/link";
import {AlertTriangle,RotateCcw} from "lucide-react";

export default function PanelError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{console.error("Panel RERCHAR",error);},[error]);
  return <section className="section-card module-unavailable" role="alert">
    <span className="module-unavailable-icon"><AlertTriangle size={22}/></span>
    <div className="eyebrow">NO SE PUDO ABRIR ESTA SECCIÓN</div>
    <h1>Intente cargarla otra vez</h1>
    <p>Si el problema continúa, informe el módulo y la acción realizada al equipo de soporte. Sus registros no se modificaron al abrir esta pantalla.</p>
    <div className="module-unavailable-actions"><button type="button" className="button button-primary" onClick={reset}><RotateCcw size={16}/> Reintentar</button><Link className="button button-outline" href="/">Cambiar de empresa</Link></div>
  </section>;
}
