import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {guideFollowupOverview,guideFollowupPage} from "@/lib/service-ledger";
import {guideFilters,parseGuideFilter,guideFollowupHref} from "@/lib/guide-followup-filters";
import {recordPage,recordsPerPage} from "@/lib/record-pagination";
import PrintButton from "@/components/PrintButton";
import {companyName,serviceFolio} from "@/lib/companies";
import {ledgerHref} from "@/lib/service-ledger-state";

const iso=(v:Date|string|null)=>!v?"":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const show=(v:Date|string|null)=>iso(v)||"—";
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function days(from:Date|string|null,to:Date|string|null,now:string){
  const start=iso(from),end=iso(to)||now;
  if(!start||start>now)return null;
  return Math.max(0,Math.round((Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000));
}
export default async function GuideFollowups({searchParams}:{searchParams:Promise<{empresa?:string;estado?:string;pagina?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const query=await searchParams,company="rerchar",filter=parseGuideFilter(query.estado),now=today();
  const [board,overview]=await Promise.all([guideFollowupPage(actor,company,filter,now,query.pagina),guideFollowupOverview(actor,now)]);
  if(recordPage(query.pagina)!==board.page)redirect(guideFollowupHref(filter,board.page));
  const rows=board.rows;
  function pages(){return board.pages>1?<nav className="records-pagination print-hide" aria-label="Páginas del seguimiento de guías"><span>{board.page>1&&<Link className="button button-outline" href={guideFollowupHref(filter,board.page-1)}>Anterior</Link>}</span><span>Página {board.page} de {board.pages}</span><span>{board.page<board.pages&&<Link className="button button-outline" href={guideFollowupHref(filter,board.page+1)}>Siguiente</Link>}</span></nav>:null;}
  return <><div className="page-title-row"><div><div className="eyebrow">RERCHAR · CONTROL DE CAMIONES</div><h1>Guías valorizadas y cierre documental</h1><p className="page-intro">Solicitud, plazo acordado, responsable, recepción y envío documental de cada servicio.</p></div><PrintButton label="Imprimir esta página"/></div>
    <div className="fleet-week-stats guide-followup-stats"><div><strong>{overview.waiting_request}</strong><span>Jornadas sin solicitud</span></div><Link href={guideFollowupHref("pendientes")} data-guide-summary="pending"><strong>{overview.pending}</strong><span>Guías por recibir</span></Link><Link href={guideFollowupHref("atrasadas")} data-guide-summary="overdue"><strong>{overview.overdue}</strong><span>Atrasadas según plazo acordado</span></Link><Link href={guideFollowupHref("mias_atrasadas")} data-guide-summary="my_overdue"><strong>{overview.my_overdue}</strong><span>Atrasadas a mi cargo</span></Link><Link href={guideFollowupHref("proximas")} data-guide-summary="upcoming"><strong>{overview.upcoming}</strong><span>Vencen hoy o en 7 días</span></Link><Link href={guideFollowupHref("sin_plazo")} data-guide-summary="undated"><strong>{overview.undated}</strong><span>Pendientes sin plazo registrado</span></Link><div><strong>{overview.waiting_close}</strong><span>Recibidas sin cierre documental</span></div></div>
    <section className="section-card"><p className="helper-text">El atraso se calcula con el plazo acordado por servicio y la fecha de Chile. Las solicitudes anteriores sin plazo se muestran por completar; no se califican como vencidas. Los totales incluyen todos los servicios de RERCHAR. Recorra el listado por páginas; la impresión corresponde a la página visible.</p>
      <form key={filter} action="/seguimiento-guias" method="get" className="filters print-hide"><input type="hidden" name="empresa" value="rerchar"/><label>Seguimiento<select name="estado" defaultValue={filter}>{Object.entries(guideFilters).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><button type="submit" className="button button-outline">Aplicar</button>{filter!=="todas"&&<Link className="text-link" href={guideFollowupHref()}>Ver todos</Link>}</form>
      <p className="helper-text" data-guide-count>{board.total?`Mostrando ${(board.page-1)*recordsPerPage+1}–${Math.min(board.page*recordsPerPage,board.total)} de ${board.total} servicios.`:"Sin servicios en este filtro."}</p>
      {pages()}
      <div className="table-wrap" role="region" aria-label="Seguimiento de guías" tabIndex={0}><table className="data-table"><thead><tr><th>Jornada / servicio</th><th>Cliente / empresa</th><th>Guía despacho</th><th>Solicitud valorizada</th><th>Plazo / responsable</th><th>Recepción</th><th>Cierre documental</th><th>Tiempo de cada etapa</th><th>Estado</th></tr></thead><tbody>{rows.map(r=>{
        const due=iso(r.due_on);
        const stage=r.documents_sent_on?"Documentación enviada":r.received_on?"Por cerrar":r.requested_on?
          !due?"Definir plazo":due<now?"Atrasada":due<=new Date(Date.parse(`${now}T00:00:00Z`)+7*86400000).toISOString().slice(0,10)?"Próxima a vencer":"Por recibir":iso(r.service_day)>now?"Programado":"Por solicitar";
        const afterService=days(r.service_day,r.requested_on,now),afterRequest=days(r.requested_on,r.received_on,now),afterReceipt=days(r.received_on,r.documents_sent_on,now);
        return <tr key={r.id} data-guide-followup={r.id}><td><Link href={ledgerHref(r.id,{seguimiento_estado:filter,seguimiento_pagina:String(board.page)})}><strong>{serviceFolio(r)}</strong></Link><small className="table-sub">{show(r.service_day)}</small></td>
          <td>{r.client_name}<span className="table-sub">{companyName(r.operating_company)} · {r.site_name}</span></td>
          <td>{r.dispatch_guide_status==="enviada"?"Enviada":r.dispatch_guide_status==="pendiente"?"Pendiente":r.dispatch_guide_status==="no_aplica"?"No aplica":"Sin registrar"}</td>
          <td>{show(r.requested_on)}</td><td>{show(r.due_on)}<span className="table-sub">{r.responsible_name||"Sin asignar"}</span></td><td>{show(r.received_on)}</td><td>{show(r.documents_sent_on)}</td>
          <td><span className="table-sub">Jornada → solicitud: {afterService===null?"—":`${afterService} d`}</span><span className="table-sub">Solicitud → recepción: {afterRequest===null?"—":`${afterRequest} d`}</span><span className="table-sub">Recepción → cierre: {afterReceipt===null?"—":`${afterReceipt} d`}</span></td><td>{stage}</td></tr>;
      })}</tbody></table>{rows.length===0&&<p className="muted">Sin servicios en este filtro.</p>}</div>{pages()}</section></>;
}
