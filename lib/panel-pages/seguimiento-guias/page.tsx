import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {guideFollowupOverview,listGuideFollowups,parseGuideFilter} from "@/lib/service-ledger";
import PrintButton from "@/components/PrintButton";
import {companyName,serviceFolio} from "@/lib/companies";

const iso=(v:Date|string|null)=>!v?"":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const show=(v:Date|string|null)=>iso(v)||"—";
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function days(from:Date|string|null,to:Date|string|null,now:string){
  const start=iso(from),end=iso(to)||now;
  if(!start||start>now)return null;
  return Math.max(0,Math.round((Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000));
}
export default async function GuideFollowups({searchParams}:{searchParams:Promise<{empresa?:string;estado?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const query=await searchParams,company="rerchar",filter=parseGuideFilter(query.estado),now=today();
  const [rows,overview]=await Promise.all([listGuideFollowups(actor,company,filter,now),guideFollowupOverview(actor,now)]);
  const filters=[
    ["todas","Todas"],["mias","Mis pendientes"],["atrasadas","Atrasadas"],
    ["proximas","Vencen en 7 días"],["sin_plazo","Sin plazo"],["pendientes","Por recibir"],
  ] as const;
  return <><div className="page-title-row"><div><div className="eyebrow">RERCHAR · CONTROL DE CAMIONES</div><h1>Guías valorizadas y cierre documental</h1><p className="page-intro">Solicitud, plazo acordado, responsable, recepción y envío documental de cada servicio.</p></div><PrintButton label="Imprimir seguimiento"/></div>
    <div className="fleet-week-stats"><div><strong>{overview.waiting_request}</strong><span>Jornadas sin solicitud</span></div><div><strong>{overview.pending}</strong><span>Guías por recibir</span></div><div><strong>{overview.overdue}</strong><span>Atrasadas según plazo acordado</span></div><div><strong>{overview.my_overdue}</strong><span>Atrasadas a mi cargo</span></div><div><strong>{overview.upcoming}</strong><span>Vencen hoy o en 7 días</span></div><div><strong>{overview.undated}</strong><span>Pendientes sin plazo registrado</span></div><div><strong>{overview.waiting_close}</strong><span>Recibidas sin cierre documental</span></div></div>
    <section className="section-card"><p className="helper-text">El atraso se calcula con el plazo acordado por servicio y la fecha de Chile. Las solicitudes anteriores sin plazo se muestran por completar; no se califican como vencidas. Los totales incluyen todos los servicios; el listado muestra hasta 250 por filtro.</p>
      <div className="order-actions print-hide">{filters.map(([key,label])=><Link key={key} href={`/seguimiento-guias?empresa=rerchar&estado=${key}`} className={`button ${filter===key?"button-primary":"button-outline"}`}>{label}</Link>)}</div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Jornada / servicio</th><th>Cliente / empresa</th><th>Guía despacho</th><th>Solicitud valorizada</th><th>Plazo / responsable</th><th>Recepción</th><th>Cierre documental</th><th>Tiempo de cada etapa</th><th>Estado</th></tr></thead><tbody>{rows.map(r=>{
        const due=iso(r.due_on);
        const stage=r.documents_sent_on?"Documentación enviada":r.received_on?"Por cerrar":r.requested_on?
          !due?"Definir plazo":due<now?"Atrasada":due<=new Date(Date.parse(`${now}T00:00:00Z`)+7*86400000).toISOString().slice(0,10)?"Próxima a vencer":"Por recibir":iso(r.service_day)>now?"Programado":"Por solicitar";
        const afterService=days(r.service_day,r.requested_on,now),afterRequest=days(r.requested_on,r.received_on,now),afterReceipt=days(r.received_on,r.documents_sent_on,now);
        return <tr key={r.id}><td><Link href={`/solicitudes/${r.id}/seguimiento`}><strong>{serviceFolio(r)}</strong></Link><small className="table-sub">{show(r.service_day)}</small></td>
          <td>{r.client_name}<span className="table-sub">{companyName(r.operating_company)} · {r.site_name}</span></td>
          <td>{r.dispatch_guide_status==="enviada"?"Enviada":r.dispatch_guide_status==="pendiente"?"Pendiente":r.dispatch_guide_status==="no_aplica"?"No aplica":"Sin registrar"}</td>
          <td>{show(r.requested_on)}</td><td>{show(r.due_on)}<span className="table-sub">{r.responsible_name||"Sin asignar"}</span></td><td>{show(r.received_on)}</td><td>{show(r.documents_sent_on)}</td>
          <td><span className="table-sub">Jornada → solicitud: {afterService===null?"—":`${afterService} d`}</span><span className="table-sub">Solicitud → recepción: {afterRequest===null?"—":`${afterRequest} d`}</span><span className="table-sub">Recepción → cierre: {afterReceipt===null?"—":`${afterReceipt} d`}</span></td><td>{stage}</td></tr>;
      })}</tbody></table>{rows.length===0&&<p className="muted">Sin servicios en este filtro.</p>}</div></section></>;
}
