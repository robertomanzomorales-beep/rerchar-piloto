"use client";

import Link from "next/link";
import {useId,useState} from "react";
import {CheckCircle2} from "lucide-react";

export type DashboardAlert={label:string;count:number;href:string;urgent?:boolean};

export default function DashboardAlerts({alerts}:{alerts:DashboardAlert[]}){
  const [priorityOnly,setPriorityOnly]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const listId=useId();
  const priorities=alerts.filter(alert=>alert.urgent);
  const filtered=priorityOnly?priorities:alerts;
  const visible=expanded?filtered:filtered.slice(0,8);
  return <section id="alertas" className="section-card company-alerts" aria-labelledby="company-alerts-title">
    <div className="section-heading"><div><div className="eyebrow">SEGUIMIENTO OPERATIVO</div><h2 id="company-alerts-title">Alertas y pendientes</h2><p>Abra un pendiente para continuar su gestión.</p></div><span className="count-pill">{priorities.length>0?`${priorities.length} ${priorities.length===1?"prioritaria":"prioritarias"} · `:""}{alerts.length} categorías activas</span></div>
    <div className="company-alert-controls" role="group" aria-label="Filtrar alertas"><span>Mostrar</span><button type="button" aria-pressed={!priorityOnly} onClick={()=>{setPriorityOnly(false);setExpanded(false);}}>Todos ({alerts.length})</button><button type="button" aria-pressed={priorityOnly} onClick={()=>{setPriorityOnly(true);setExpanded(false);}}>Prioritarios ({priorities.length})</button></div>
    {visible.length>0&&<div id={listId} className="company-alert-register"><table><thead><tr><th scope="col">Gestión pendiente</th><th scope="col">Registros</th><th scope="col">Prioridad</th></tr></thead><tbody>{visible.map(alert=><tr key={alert.label} className={alert.urgent?"is-priority":undefined}><td><Link href={alert.href}>{alert.label}</Link></td><td>{alert.count.toLocaleString("es-CL")}</td><td><span className={`company-alert-priority${alert.urgent?" is-priority":""}`}>{alert.urgent?"Prioritaria":"Seguimiento"}</span></td></tr>)}</tbody></table></div>}
    {filtered.length>8&&<button className="company-alert-expand" type="button" aria-expanded={expanded} aria-controls={listId} onClick={()=>setExpanded(value=>!value)}>{expanded?"Mostrar menos":`Ver las ${filtered.length} categorías de alerta`}</button>}
    {!filtered.length&&<p className="helper-text"><CheckCircle2 size={15} aria-hidden="true"/> {priorityOnly?"Sin alertas prioritarias registradas.":"Sin pendientes registrados en estas categorías."}</p>}
  </section>;
}
