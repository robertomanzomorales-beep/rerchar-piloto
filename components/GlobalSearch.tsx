"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ArrowRight,Search,X} from "lucide-react";

export type SearchDestination={href:string;text:string;group:string};
export default function GlobalSearch({open,onClose,items}:{open:boolean;onClose:()=>void;items:SearchDestination[]}){
  const [term,setTerm]=useState(""),[active,setActive]=useState(0);
  const input=useRef<HTMLInputElement>(null),router=useRouter();
  const results=useMemo(()=>items.filter(i=>`${i.text} ${i.group}`.toLocaleLowerCase("es-CL").includes(term.trim().toLocaleLowerCase("es-CL"))).slice(0,12),[items,term]);
  useEffect(()=>{if(open){setTerm("");setActive(0);requestAnimationFrame(()=>input.current?.focus());}},[open]);
  useEffect(()=>{if(!open)return;const onKey=(event:KeyboardEvent)=>{
    if(event.key==="Escape"){event.preventDefault();onClose();}
    if(event.key==="ArrowDown"){event.preventDefault();setActive(n=>Math.min(n+1,results.length-1));}
    if(event.key==="ArrowUp"){event.preventDefault();setActive(n=>Math.max(n-1,0));}
    if(event.key==="Enter"&&results[active]){event.preventDefault();router.push(results[active].href);onClose();}
  };document.addEventListener("keydown",onKey);return()=>document.removeEventListener("keydown",onKey);},[open,results,active,onClose,router]);
  if(!open)return null;
  return <div className="command-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="command-dialog" role="dialog" aria-modal="true" aria-label="Buscar en el sistema">
      <div className="command-input-row"><Search size={21}/><input ref={input} value={term} onChange={e=>{setTerm(e.target.value);setActive(0);}} placeholder="Buscar módulos, procesos y funciones..." aria-label="Buscar módulos"/><button type="button" onClick={onClose} aria-label="Cerrar búsqueda"><X size={18}/></button></div>
      <div className="command-results"><div className="command-caption">{term?"Resultados":"Accesos del sistema"}</div>{results.map((item,index)=><Link key={`${item.href}-${index}`} href={item.href} className={`command-result ${index===active?"selected":""}`} onMouseEnter={()=>setActive(index)} onClick={onClose}><span className="command-result-icon"><Search size={16}/></span><span><strong>{item.text}</strong><small>{item.group}</small></span><ArrowRight size={16}/></Link>)}{results.length===0&&<p className="command-empty">Sin módulos coincidentes. Pruebe con “estado de pago”, “guía” o “cliente”.</p>}</div>
      <div className="command-help"><span>↑ ↓ navegar</span><span>↵ abrir</span><span>Esc cerrar</span></div>
    </div>
  </div>;
}
