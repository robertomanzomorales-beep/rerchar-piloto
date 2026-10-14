import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {listGuideFollowups} from "@/lib/service-ledger";
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
export default async function GuideFollowups({searchParams}:{searchParams:Promise<{empresa?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const requested=(await searchParams).empresa;
  const company=requested==="rerchar"||requested==="e_y_j"?requested:"";
  const rows=await listGuideFollowups(actor,company),now=today();
  const waitingRequest=rows.filter(r=>r.service_day&&iso(r.service_day)<=now&&!r.requested_on).length;
  const waitingGuide=rows.filter(r=>r.requested_on&&!r.received_on).length;
  const waitingClose=rows.filter(r=>r.received_on&&!r.documents_sent_on).length;
  return <><div className="page-title-row"><div><div className="eyebrow">CONTROL MENSUAL DE CAMIONES</div><h1>Guías y cierre documental</h1><p className="page-intro">Estado de envío de la guía de despacho, solicitud y recepción de la valorizada, y cierre documental.</p></div><PrintButton label="Imprimir seguimiento"/></div>
    <form action="/seguimiento-guias" method="GET" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Todas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><button className="button button-outline" type="submit">Filtrar</button></form>
    <div className="fleet-week-stats"><div><strong>{waitingRequest}</strong><span>Jornadas sin solicitud de guía valorizada</span></div><div><strong>{waitingGuide}</strong><span>Guías valorizadas por recibir</span></div><div><strong>{waitingClose}</strong><span>Recepciones sin cierre documental</span></div></div>
    <section className="section-card"><p className="helper-text">Se calculan los días con fechas reales, sin copiar las fórmulas erróneas del Excel. El plazo de vencimiento aún no está definido: estos contadores muestran tiempo transcurrido, no califican automáticamente una guía como vencida. Los servicios sin fecha programada se atienden en Solicitudes.</p>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Jornada / servicio</th><th>Cliente / empresa</th><th>Guía despacho</th><th>Solicitud valorizada</th><th>Recepción</th><th>Cierre documental</th><th>Tiempo de cada etapa</th><th>Estado</th></tr></thead><tbody>{rows.map(r=>{
        const stage=r.documents_sent_on?"Documentación enviada":r.received_on?"Por cerrar":r.requested_on?"Por recibir":iso(r.service_day)>now?"Programado":"Por solicitar";
        const afterService=days(r.service_day,r.requested_on,now),afterRequest=days(r.requested_on,r.received_on,now),afterReceipt=days(r.received_on,r.documents_sent_on,now);
        return <tr key={r.id}><td><Link href={`/solicitudes/${r.id}/seguimiento`}><strong>{serviceFolio(r)}</strong></Link><small className="table-sub">{show(r.service_day)}</small></td>
          <td>{r.client_name}<span className="table-sub">{companyName(r.operating_company)} · {r.site_name}</span></td>
          <td>{r.dispatch_guide_status==="enviada"?"Enviada":r.dispatch_guide_status==="pendiente"?"Pendiente":r.dispatch_guide_status==="no_aplica"?"No aplica":"Sin registrar"}</td>
          <td>{show(r.requested_on)}</td><td>{show(r.received_on)}</td><td>{show(r.documents_sent_on)}</td>
          <td><span className="table-sub">Jornada → solicitud: {afterService===null?"—":`${afterService} d`}</span><span className="table-sub">Solicitud → recepción: {afterRequest===null?"—":`${afterRequest} d`}</span><span className="table-sub">Recepción → cierre: {afterReceipt===null?"—":`${afterReceipt} d`}</span></td><td>{stage}</td></tr>;
      })}</tbody></table>{rows.length===0&&<p className="muted">Sin servicios de camión programados para seguimiento.</p>}</div></section></>;
}
