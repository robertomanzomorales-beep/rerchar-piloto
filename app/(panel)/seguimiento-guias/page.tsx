import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {listGuideFollowups} from "@/lib/service-ledger";
import PrintButton from "@/components/PrintButton";
import {companyName,serviceFolio} from "@/lib/companies";

const date=(v:Date|string|null)=>!v?"—":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
function elapsedDays(from:Date|string|null,to:Date|string|null=new Date()){
  if(!from)return null;
  const first=date(from),last=date(to);
  const days=Math.floor((Date.parse(`${last}T00:00:00Z`)-Date.parse(`${first}T00:00:00Z`))/86_400_000);
  return Number.isFinite(days)?Math.max(0,days):null;
}
export default async function GuideFollowups({searchParams}:{searchParams:Promise<{empresa?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const requested=(await searchParams).empresa;
  const company=requested==="rerchar"||requested==="e_y_j"?requested:"";
  const rows=await listGuideFollowups(actor,company);
  return <><div className="page-title-row"><div><div className="eyebrow">CONTROL MENSUAL DE CAMIONES</div><h1>Seguimiento de guías valorizadas</h1><p className="page-intro">Solicitud, recepción y envío de documentos por servicio, con días transcurridos visibles.</p></div><PrintButton label="Imprimir seguimiento"/></div>
    <form action="/seguimiento-guias" method="GET" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Todas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><button className="button button-outline" type="submit">Filtrar</button></form>
    <section className="section-card"><div className="table-wrap"><table className="data-table"><thead><tr><th>Servicio / empresa</th><th>Cliente / faena</th><th>Solicitud</th><th>Recepción</th><th>Días transcurridos</th><th>Documentos enviados</th><th>Estado</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><Link href={`/solicitudes/${r.id}/seguimiento`}>{serviceFolio(r)}</Link><small className="table-sub">{companyName(r.operating_company)}</small></td><td>{r.client_name}<span className="table-sub">{r.site_name}</span></td><td>{date(r.requested_on)}</td><td>{date(r.received_on)}</td><td>{r.requested_on?`${elapsedDays(r.requested_on,r.received_on)} días`:"—"}</td><td>{date(r.documents_sent_on)}</td><td>{r.documents_sent_on?"Enviados":r.received_on?"Por enviar":r.requested_on?"Por recibir":"Por solicitar"}</td></tr>)}</tbody></table>{rows.length===0&&<p className="muted">Sin servicios para seguimiento.</p>}</div></section></>;
}
