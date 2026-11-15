"use client";

import Link from "next/link";
import {useId,useState} from "react";
import {CircleAlert,CheckCheck,SlidersHorizontal} from "lucide-react";

export type DashboardAlert={label:string;count:number;href:string;urgent?:boolean};

export default function DashboardAlerts({alerts}:{alerts:DashboardAlert[]}){
  const [priorityOnly,setPriorityOnly]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const listId=useId();
  const priorities=alerts.filter(alert=>alert.urgent);
  const filtered=priorityOnly?priorities:alerts;
  const visible=expanded?filtered:filtered.slice(0,5);
  return <section id="alertas" className="dashboard-card dashboard-attention" aria-labelledby="dashboard-attention-title">
    <div className="dashboard-card-heading"><div><span className="dashboard-overline">TU EQUIPO, AL DÍA</span><h2 id="dashboard-attention-title">Por revisar</h2></div><span className="dashboard-heading-icon"><SlidersHorizontal size={18} aria-hidden="true"/></span></div>
    <p className="dashboard-card-description">Los pendientes que necesitan el siguiente paso.</p>
    <div className="dashboard-alert-filters" role="group" aria-label="Filtrar pendientes">
      <button type="button" aria-pressed={!priorityOnly} onClick={()=>{setPriorityOnly(false);setExpanded(false);}}>Todos <span>{alerts.length}</span></button>
      <button type="button" aria-pressed={priorityOnly} onClick={()=>{setPriorityOnly(true);setExpanded(false);}}>Prioritarios <span>{priorities.length}</span></button>
    </div>
    <div id={listId} className="dashboard-alert-list">
      {visible.map(alert=><Link href={alert.href} key={alert.label} className={`dashboard-alert${alert.urgent?" is-urgent":""}`}>
        <span className="dashboard-alert-count">{alert.count.toLocaleString("es-CL")}</span>
        <span className="dashboard-alert-copy"><strong>{alert.label}</strong><small>{alert.urgent?"Atención prioritaria":"Continuar gestión"}</small></span>
        <span className="dashboard-alert-dot" aria-hidden="true"/>
      </Link>)}
      {!filtered.length&&<div className="dashboard-clear-state"><span><CheckCheck size={27} aria-hidden="true"/></span><strong>{priorityOnly?"Sin alertas prioritarias":"Todo al día por aquí"}</strong><p>{priorityOnly?"Puedes revisar el resto de las gestiones en Todos.":"No hay pendientes registrados en estas categorías."}</p></div>}
    </div>
    {filtered.length>5&&<button type="button" className="dashboard-show-more" aria-expanded={expanded} aria-controls={listId} onClick={()=>setExpanded(value=>!value)}>{expanded?"Mostrar menos":`Ver las ${filtered.length} categorías`}</button>}
    {priorities.length>0&&<p className="dashboard-attention-note"><CircleAlert size={14} aria-hidden="true"/>{priorities.length} {priorities.length===1?"categoría prioritaria":"categorías prioritarias"}. Los avisos pueden referirse al mismo documento.</p>}
  </section>;
}
