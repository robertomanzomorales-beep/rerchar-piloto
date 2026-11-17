"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {CornerDownLeft,Search,X,FileText,ClipboardList,ReceiptText,ShoppingCart,Wrench,Settings2,LayoutDashboard} from "lucide-react";

export type SearchDestination={href:string;text:string;group:string};
const groupIcons:Record<string,typeof Search>={Comercial:FileText,Operación:ClipboardList,"Cierre y control":ReceiptText,Abastecimiento:ShoppingCart,"Recursos compartidos":Wrench,Configuración:Settings2,Inicio:LayoutDashboard};
const searchable=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es-CL");
export default function GlobalSearch({open,onClose,items}:{open:boolean;onClose:()=>void;items:SearchDestination[]}){
  const [term,setTerm]=useState(""),[active,setActive]=useState(0);
  const input=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDivElement>(null),resultList=useRef<HTMLDivElement>(null),router=useRouter();
  const results=useMemo(()=>items.filter(i=>searchable(`${i.text} ${i.group}`).includes(searchable(term.trim()))).slice(0,12),[items,term]);
  useEffect(()=>{
    if(!open)return;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";setTerm("");setActive(0);
    const frame=requestAnimationFrame(()=>input.current?.focus());
    return()=>{cancelAnimationFrame(frame);document.body.style.overflow=previousOverflow;if(previousFocus?.isConnected)previousFocus.focus();};
  },[open]);
  useEffect(()=>{resultList.current?.querySelector('.command-result.selected')?.scrollIntoView({block:"nearest"});},[active,term]);
  useEffect(()=>{if(!open)return;const onKey=(event:KeyboardEvent)=>{
    if(event.key==="Escape"){event.preventDefault();onClose();}
    if(event.target===input.current&&event.key==="ArrowDown"){event.preventDefault();setActive(n=>Math.max(0,Math.min(n+1,results.length-1)));}
    if(event.target===input.current&&event.key==="ArrowUp"){event.preventDefault();setActive(n=>Math.max(n-1,0));}
    if(event.target===input.current&&event.key==="Enter"&&results[active]){event.preventDefault();router.push(results[active].href);onClose();}
    if(event.key==="Tab"){
      const targets=Array.from(dialog.current?.querySelectorAll<HTMLElement>('a[href],button,input')??[]),first=targets[0],last=targets[targets.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  };document.addEventListener("keydown",onKey);return()=>document.removeEventListener("keydown",onKey);},[open,results,active,onClose,router]);
  if(!open)return null;
  return <div className="command-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={dialog} className="command-dialog" role="dialog" aria-modal="true" aria-label="Buscar en el sistema">
      <div className="command-input-row"><Search size={21}/><input ref={input} value={term} onChange={e=>{setTerm(e.target.value);setActive(0);}} placeholder="Buscar módulos, procesos y funciones..." aria-label="Buscar módulos"/><button type="button" onClick={onClose} aria-label="Cerrar búsqueda"><X size={18}/></button></div>
      <div ref={resultList} className="command-results"><div className="command-caption">{term?"Resultados":"Accesos del software"}<span role="status" aria-live="polite">{results.length} {results.length===1?"acceso":"accesos"}</span></div>{results.map((item,index)=>{const Icon=groupIcons[item.group]??Search;return <Link key={`${item.href}-${index}`} href={item.href} className={`command-result ${index===active?"selected":""}`} onMouseEnter={()=>setActive(index)} onClick={onClose}><span className="command-result-icon"><Icon size={16}/></span><span><strong>{item.text}</strong><small>{item.group}</small></span><CornerDownLeft size={14} aria-hidden="true"/></Link>;})}{results.length===0&&<p className="command-empty">Sin módulos coincidentes. Pruebe con “estado de pago”, “guía” o “cliente”.</p>}</div>
      <div className="command-help"><span>↑ ↓ navegar</span><span>↵ abrir</span><span>Esc cerrar</span></div>
    </div>
  </div>;
}
