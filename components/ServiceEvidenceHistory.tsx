import Link from "next/link";
import {redirect} from "next/navigation";
import {FileText} from "lucide-react";
import {evidenceAnchor,evidenceHref,evidenceLabels,type EvidenceQuery} from "@/lib/evidence-form-state";
import {serviceDayContext} from "@/lib/service-day-state";
import {isFinanceId} from "@/lib/finance-catalog-state";
import {recordPage} from "@/lib/record-pagination";
import {chileDate} from "./UI";
export type ServiceEvidenceRecord={id:string;description:string;document_kind:string;storage_key:string|null;original_filename:string|null;created_at:Date;actor_name:string;size_bytes:number|null};
export default function ServiceEvidenceHistory({id,evidence,query}:{id:string;evidence:ServiceEvidenceRecord[];query:EvidenceQuery}){
  const context=serviceDayContext(query),page=recordPage(context.pagina_documentos),last=Math.max(1,Math.ceil(evidence.length/20));
  if(page>last&&!query.documento_form&&!query.formulario&&!query.formulario_cargo)redirect(evidenceHref(id,{...context,pagina_documentos:String(last)},"documentos-guardados",{archivo:query.archivo}));
  const rows=evidence.slice((page-1)*20,page*20),chosen=isFinanceId(query.archivo)?evidence.find(e=>e.id===query.archivo):undefined,extra=chosen&&!rows.some(e=>e.id===chosen.id)?chosen:undefined;if(extra)rows.unshift(extra);
  const href=(next:number)=>evidenceHref(id,{...context,pagina_documentos:String(next)},"documentos-guardados");
  return <section id="documentos-guardados" className="section-card side-card evidence-history-section"><div className="section-heading"><div><div className="eyebrow">ARCHIVOS</div><h2>Documentos y evidencias</h2></div><span className="count-pill">{evidence.length}</span></div>{rows.length?<ul className="evidence-list evidence-history">{rows.map(item=><li key={item.id} id={evidenceAnchor(item.id)} className="finance-section" data-service-evidence={item.id}><FileText size={17}/><div><strong>{item.description}</strong>{item.storage_key?<Link href={`/api/evidencia/${item.id}`}>Descargar {item.original_filename||"archivo adjunto"}</Link>:<span className="helper-text">Registro sin archivo adjunto</span>}<small>{evidenceLabels[item.document_kind as keyof typeof evidenceLabels]??item.document_kind.replaceAll("_"," ")}{item.size_bytes?` · ${(Number(item.size_bytes)/1024).toLocaleString("es-CL",{maximumFractionDigits:1})} KB`:""}</small><small>{chileDate(item.created_at)} · {item.actor_name}</small>{extra?.id===item.id&&<small>Archivo seleccionado fuera de esta página.</small>}</div></li>)}</ul>:<p className="muted">Sin archivos adjuntos.</p>}
    {page>last&&<p className="helper-text">El historial se actualizó. <Link href={href(last)}>Ver última página disponible</Link>.</p>}
    {(last>1||page>1)&&<nav className="records-pagination" aria-label="Páginas de documentos del servicio"><span>{page>1&&<Link className="button button-outline" href={href(Math.min(page-1,last))}>Anterior</Link>}</span><span>{page<=last?`Página ${page} de ${last}`:"Historial actualizado"}</span><span>{page<last&&<Link className="button button-outline" href={href(page+1)}>Siguiente</Link>}</span></nav>}
  </section>;
}
