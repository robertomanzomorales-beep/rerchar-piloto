import Link from "next/link";
import {redirect} from "next/navigation";
import type {Company} from "@/lib/companies";
import {resultLabel,type ServiceDayEntry} from "@/lib/service-day";
import {serviceDayAnchor,serviceDayContext,serviceDayDate,serviceDayHref,type ServiceDayQuery} from "@/lib/service-day-state";
import {financeDay as day} from "@/lib/finance-catalog-state";
import {lastRecordPage,recordPage} from "@/lib/record-pagination";
import {chileCalendarDate,chileDate} from "./UI";
import ServiceOperationForm from "./ServiceOperationForm";
export default function ServiceDayHistory({id,reports,company,query,today,minDay,manage,canCreate,canCorrect}:{id:string;reports:ServiceDayEntry[];company:Company|null;query:ServiceDayQuery;today:string;minDay:string;manage:boolean;canCreate:boolean;canCorrect:boolean}){
  const context=serviceDayContext(query),page=recordPage(context.pagina_partes),last=lastRecordPage(reports.length),newPart=context.nuevo_parte==="1",chosen=serviceDayDate(context.parte)?context.parte:today,current=newPart?undefined:reports.find(r=>day(r.day)===chosen);
  if(page>last&&!query.formulario&&!query.formulario_cargo&&!query.documento_form)redirect(serviceDayHref(id,{...context,pagina_partes:String(last)}));
  const rows=reports.slice((page-1)*100,page*100),extra=context.parte&&current&&!rows.some(r=>day(r.day)===chosen)?current:undefined;if(extra)rows.unshift(extra);
  const canWrite=current?canCorrect:canCreate,showForm=manage&&(canWrite||query.formulario==="day"),href=(page:number)=>serviceDayHref(id,{...context,pagina_partes:String(page)});
  return <section id="parte-diario" className="section-card service-operation-section service-day-section"><div className="section-heading"><div><div className="eyebrow">PARTE DIARIO DE CAMIONES</div><h2>Resultado en terreno</h2></div><span className="count-pill">{reports.length}</span></div>
    <p className="helper-text">El resultado del día informa la agenda. El cierre administrativo del servicio se realiza después de revisar sus respaldos.</p>
    {showForm&&<details id="editar-parte" className="finance-record-control service-day-editor" open={query.formulario==="day"||Boolean(current)||newPart||!reports.length}><summary>{current?`Corregir parte del ${chileCalendarDate(current.day)}`:"Registrar parte de otro día"}</summary>
      {current&&<div className="service-day-current"><strong>{resultLabel[current.outcome]} · {current.asset_plate||current.asset_code}</strong><span>{current.driver_name||"Conductor sin informar"}</span><small>Última actualización: {chileDate(current.updated_at)} · {current.recorder_name}</small><Link href={serviceDayHref(id,{...context,parte:undefined,nuevo_parte:"1"},"editar-parte")}>Registrar otro día</Link></div>}
      {!current&&reports.some(r=>day(r.day)===chosen)&&<p className="helper-text">Esta fecha ya tiene un parte. Elija otra fecha o <Link href={serviceDayHref(id,{...context,parte:chosen,nuevo_parte:undefined},"editar-parte")}>abra el parte existente</Link>.</p>}
      {!canWrite&&<p className="helper-text">El estado actual del servicio no permite guardar este cambio. Los datos ingresados se conservan para su revisión.</p>}
      <ServiceOperationForm key={`day:${chosen}:${current?.revision??"new"}:${newPart}:${query.formulario??""}`} kind="day" id={id} company={company} dayContext={context} updating={Boolean(current)} disabled={!canWrite} minDay={current?day(current.day):minDay||undefined} maxDay={today} values={{day:chosen,outcome:current?.outcome??"completado",observation:current?.observation??"",expected_revision:current?.revision??""}}/>
    </details>}
    {rows.length?<ul className="service-day-records">{rows.map(r=><li key={day(r.day)} id={serviceDayAnchor(day(r.day))} className="finance-section" data-service-day={day(r.day)}><div className="finance-record-top"><strong>{chileCalendarDate(r.day)}</strong><span className={`badge day-${r.outcome}`}>{resultLabel[r.outcome]}</span></div><span className="service-day-assignment">{r.asset_plate||r.asset_code} · {r.asset_label} · {r.driver_name||"Conductor sin informar"}</span>{r.observation&&<p>{r.observation}</p>}<small>Actualizado el {chileDate(r.updated_at)}{manage?` · ${r.recorder_name}`:""}</small>{extra&&day(extra.day)===day(r.day)&&<small>Parte seleccionado fuera de esta página.</small>}<div className="service-day-links">{manage&&canCorrect&&<Link href={serviceDayHref(id,{...context,parte:day(r.day),nuevo_parte:undefined},"editar-parte")}>Corregir este parte</Link>}{manage&&<Link href={`/agenda?${new URLSearchParams({inicio:day(r.day),...(company?{empresa:company}:{})})}`}>Ver semana en agenda</Link>}</div></li>)}</ul>:<p className="muted">Todavía no hay partes diarios registrados.</p>}
    {page>last&&<p className="helper-text">El historial se actualizó. <Link href={href(last)}>Ver última página disponible</Link>.</p>}
    {(last>1||page>1)&&<nav className="records-pagination" aria-label="Páginas de partes diarios"><span>{page>1&&<Link className="button button-outline" href={href(Math.min(page-1,last))}>Anterior</Link>}</span><span>{page<=last?`Página ${page} de ${last}`:"Historial actualizado"} · {reports.length} partes</span><span>{page<last&&<Link className="button button-outline" href={href(page+1)}>Siguiente</Link>}</span></nav>}
  </section>;
}
