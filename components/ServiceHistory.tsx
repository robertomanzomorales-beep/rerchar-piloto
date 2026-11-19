import Link from "next/link";
import {redirect} from "next/navigation";
import {chileCsvDay} from "@/lib/chile-csv";
import {recordPage} from "@/lib/record-pagination";
import {serviceHistoryLabel,type ServiceHistoryPage} from "@/lib/service-history";
import {serviceDayContext,serviceDayHref,type ServiceDayQuery} from "@/lib/service-day-state";
import {chileCalendarDate,chileDate} from "./UI";
export default function ServiceHistory({id,history,query}:{id:string;history:ServiceHistoryPage;query:ServiceDayQuery}){
  const context=serviceDayContext(query),{items,total,page,pages}=history,href=(next:number)=>serviceDayHref(id,{...context,pagina_historial:String(next)},"historial-servicio");
  if(recordPage(context.pagina_historial)>pages&&!query.formulario&&!query.formulario_cargo&&!query.documento_form)redirect(href(pages));
  return <section id="historial-servicio" className="section-card side-card service-history-section"><div className="section-heading"><div><div className="eyebrow">TRAZABILIDAD</div><h2>Historial del servicio</h2></div><span className="count-pill" data-service-history-total={total}>{total}</span></div><p className="helper-text">Movimientos registrados en la solicitud. Más recientes primero; fechas y horas de Chile.</p>
    {items.length?<ol className="timeline service-history-timeline">{items.map((item,index)=>{const date=chileCsvDay(item.created_at),firstOfDay=index===0||chileCsvDay(items[index-1].created_at)!==date;return <li key={item.id} data-service-history-event={item.id}>{firstOfDay&&<span className="service-history-day" data-service-history-day={date}>{chileCalendarDate(date)}</span>}<span className="timeline-marker" aria-hidden="true"/><span className="service-history-kind">{serviceHistoryLabel(item.kind)}</span><strong>{item.description}</strong><small><time dateTime={item.created_at.toISOString()}>{chileDate(item.created_at)}</time> · {item.actor_name??"Sistema"}</small></li>;})}</ol>:<p className="muted">Todavía no hay movimientos registrados para este servicio.</p>}
    {pages>1&&<nav className="records-pagination" aria-label="Páginas del historial del servicio"><span>{page>1&&<Link className="button button-outline" href={href(page-1)}>Anterior</Link>}</span><span>Página {page} de {pages}</span><span>{page<pages&&<Link className="button button-outline" href={href(page+1)}>Siguiente</Link>}</span></nav>}
    {page>1&&<Link className="text-link service-history-latest" href={href(1)}>Ver actividad más reciente</Link>}
  </section>;
}
