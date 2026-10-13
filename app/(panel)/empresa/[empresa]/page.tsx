import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowLeft, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireActor, canManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, type Company } from "@/lib/companies";
import { listServices } from "@/lib/pilot";
import { listQuotes, quoteFolio } from "@/lib/quotes";
import { ServiceTable, chileDate } from "@/components/UI";

type ServiceMetrics = { total:string; requested:string; scheduled:string; in_route:string; completed:string; critical:string };
type QuoteMetrics = { total:string; draft:string; sent:string; accepted:string; expired:string };
type Month = { period:string; total:string };
const value = (v:string|undefined) => Number(v ?? 0);

export default async function CompanyHome({params}:{params:Promise<{empresa:string}>}) {
  const actor = await requireActor();
  const {empresa} = await params;
  if (empresa !== "rerchar" && empresa !== "e_y_j") notFound();
  const selected = empresa as Company;
  const company = companies[selected];
  const showQuotes = actor.role !== "conductor";
  const today = new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const [quotes,services,serviceStats,quoteStats,months,guideAlerts,invoiceAlerts,unclassified,materialGuideStats] = await Promise.all([
    showQuotes ? listQuotes(actor,"",selected) : Promise.resolve([]),
    listServices(actor,"","",selected),
    db.query<ServiceMetrics>(`SELECT count(*)::text AS total,
      count(*) FILTER (WHERE status='solicitada')::text AS requested,
      count(*) FILTER (WHERE status='programada')::text AS scheduled,
      count(*) FILTER (WHERE status='en_ruta')::text AS in_route,
      count(*) FILTER (WHERE status='completada')::text AS completed,
      count(*) FILTER (WHERE priority='critica' AND status IN ('solicitada','programada','en_ruta'))::text AS critical
      FROM service_requests WHERE operating_company=$1 AND deleted_at IS NULL
      AND ($2::text <> 'cliente' OR client_id=$3::uuid)
      AND ($2::text <> 'conductor' OR driver_id=$4::uuid)`,[selected,actor.role,actor.client_id,actor.id]),
    showQuotes ? db.query<QuoteMetrics>(`SELECT count(*)::text AS total,
      count(*) FILTER (WHERE status='borrador')::text AS draft,
      count(*) FILTER (WHERE status='enviada')::text AS sent,
      count(*) FILTER (WHERE status='aceptada')::text AS accepted,
      count(*) FILTER (WHERE status='enviada' AND valid_until < $4::date)::text AS expired
      FROM client_quotes WHERE issuer=$1 AND ($2::text <> 'cliente' OR client_id=$3::uuid)`,[selected,actor.role,actor.client_id,today]) : Promise.resolve([]),
    db.query<Month>(`SELECT to_char(series.month,'YYYY-MM') AS period,count(s.id)::text AS total
      FROM generate_series(date_trunc('month',now())-interval '5 months',date_trunc('month',now()),interval '1 month') AS series(month)
      LEFT JOIN service_requests s ON s.created_at>=series.month AND s.created_at<series.month+interval '1 month'
        AND s.operating_company=$1 AND s.deleted_at IS NULL
        AND ($2::text <> 'cliente' OR s.client_id=$3::uuid)
        AND ($2::text <> 'conductor' OR s.driver_id=$4::uuid)
      GROUP BY series.month ORDER BY series.month`,[selected,actor.role,actor.client_id,actor.id]),
    canManage(actor) ? db.query<{total:string}>(`SELECT count(*)::text AS total FROM valued_guide_followups f
      JOIN service_requests s ON s.id=f.service_id WHERE s.operating_company=$1 AND s.deleted_at IS NULL
      AND f.requested_on IS NOT NULL AND f.received_on IS NULL`,[selected]) : Promise.resolve([]),
    actor.role === "admin" ? db.query<{total:string}>(`SELECT count(*)::text AS total FROM supplier_invoices
      WHERE issuer=$1 AND due_on<$2::date AND status IN ('pendiente','parcial') AND paid_clp<total_clp`,[selected,today]) : Promise.resolve([]),
    canManage(actor) ? db.query<{total:string}>("SELECT count(*)::text AS total FROM service_requests WHERE operating_company IS NULL AND deleted_at IS NULL") : Promise.resolve([]),
    selected==="rerchar"&&canManage(actor) ? db.query<{total:string;pending:string}>(`SELECT count(*)::text AS total,
      count(*) FILTER (WHERE movement_type='venta' AND EXISTS (
        SELECT 1 FROM material_guide_items i WHERE i.guide_id=g.id AND
          (i.arrival_kg IS NULL OR i.invoice_number IS NULL OR (i.invoice_number IS NOT NULL AND i.invoice_status IS DISTINCT FROM 'pagada'))))::text AS pending
      FROM material_guides g WHERE operating_company='rerchar'`) : Promise.resolve([]),
  ]);
  const s=serviceStats[0],q=quoteStats[0];
  const maxMonth=Math.max(1,...months.map(m=>value(m.total)));
  const serviceBars=[
    {label:"Solicitadas",count:value(s?.requested),color:"#d69c35"},
    {label:"Programadas",count:value(s?.scheduled),color:"#4b8fb2"},
    {label:"En ruta",count:value(s?.in_route),color:"#078c74"},
    {label:"Completadas",count:value(s?.completed),color:"#368b58"},
  ];
  const maxStatus=Math.max(1,...serviceBars.map(b=>b.count));
  const alerts=[
    ...(showQuotes?[{label:"Cotizaciones enviadas con vigencia vencida",count:value(q?.expired),href:`/cotizaciones?empresa=${selected}`}]:[]),
    {label:"Servicios críticos aún abiertos",count:value(s?.critical),href:`/solicitudes?empresa=${selected}`},
    ...(canManage(actor)?[{label:"Guías valorizadas solicitadas y no recibidas",count:value(guideAlerts[0]?.total),href:`/seguimiento-guias?empresa=${selected}`}]:[]),
    ...(selected==="rerchar"&&canManage(actor)?[{label:"Ventas de material con pesaje, factura o pago pendientes",count:value(materialGuideStats[0]?.pending),href:"/control-guias"}]:[]),
    ...(actor.role==="admin"?[{label:"Facturas de proveedores vencidas con saldo",count:value(invoiceAlerts[0]?.total),href:`/facturas-recibidas?empresa=${selected}`}]:[]),
  ];
  return <>
    <Link href="/" className="back-link"><ArrowLeft size={16}/> Cambiar de empresa</Link>
    <div className="page-title-row"><div><div className="eyebrow">PANEL DE CONTROL · {company.code}</div><h1>{company.short}</h1><p className="page-intro">{company.name} · métricas de registros asignados a esta empresa.</p></div>
      {canManage(actor) && <Link href={`/cotizaciones/nueva?empresa=${selected}`} className="button button-primary"><Plus size={18}/> Nueva cotización</Link>}
    </div>
    {value(unclassified[0]?.total)>0&&<p className="company-unclassified"><AlertTriangle size={17}/><span><strong>{value(unclassified[0]?.total)} servicios anteriores por clasificar.</strong> No se suman a ninguna empresa hasta confirmar sus documentos de origen.</span><Link href="/solicitudes?empresa=pendiente">Revisar <ArrowRight size={15}/></Link></p>}
    <div className="company-metric-grid">
      <Link href={`/cotizaciones?empresa=${selected}`} className="company-metric"><span>Cotizaciones</span><strong>{value(q?.total)}</strong><small>{value(q?.accepted)} aceptadas</small></Link>
      <Link href={`/solicitudes?empresa=${selected}`} className="company-metric"><span>Servicios registrados</span><strong>{value(s?.total)}</strong><small>{value(s?.requested)} por planificar</small></Link>
      {selected==="rerchar"&&canManage(actor)?<Link href="/control-guias" className="company-metric"><span>Control de guías</span><strong>{value(materialGuideStats[0]?.total)}</strong><small>{value(materialGuideStats[0]?.pending)} ventas por cerrar</small></Link>:<Link href={`/solicitudes?empresa=${selected}&estado=en_ruta`} className="company-metric"><span>En ruta</span><strong>{value(s?.in_route)}</strong><small>En ejecución</small></Link>}
      <Link href={`/solicitudes?empresa=${selected}&estado=completada`} className="company-metric"><span>Completados</span><strong>{value(s?.completed)}</strong><small>Con cierre registrado</small></Link>
    </div>
    <div className="company-analytics">
      <section className="section-card"><div className="eyebrow">ÚLTIMOS SEIS MESES</div><h2>Servicios registrados por mes</h2><div className="company-trend" role="img" aria-label="Servicios registrados por mes">{months.map(m=><div className="company-trend-col" key={m.period}><span>{value(m.total)}</span><div className="company-trend-track"><div style={{height:`${value(m.total)===0?0:Math.max(8,100*value(m.total)/maxMonth)}%`}}/></div><small>{new Intl.DateTimeFormat("es-CL",{month:"short",timeZone:"UTC"}).format(new Date(`${m.period}-01T00:00:00Z`))}</small></div>)}</div></section>
      <section className="section-card"><div className="eyebrow">ESTADO DE SERVICIOS</div><h2>Distribución actual</h2><div className="company-status-chart">{serviceBars.map(b=><div className="company-status-row" key={b.label}><span>{b.label}</span><div className="company-status-track"><div style={{width:`${100*b.count/maxStatus}%`,background:b.color}}/></div><strong>{b.count}</strong></div>)}</div><p className="helper-text">Los servicios cancelados no aparecen en este gráfico; el total histórico sí los incluye.</p></section>
    </div>
    <section className="section-card company-alerts"><div className="section-heading"><div><div className="eyebrow">ATENCIÓN DEL EQUIPO</div><h2><AlertTriangle size={20}/> Alertas y pendientes</h2></div></div><div className="company-alert-list">{alerts.map(a=><Link href={a.href} key={a.label} className="company-alert"><strong>{a.count}</strong><span>{a.label}</span><ArrowRight size={17}/></Link>)}</div>{alerts.every(a=>a.count===0)&&<p className="helper-text"><CheckCircle2 size={15}/> Sin pendientes registrados en estas categorías.</p>}</section>
    <section className="section-card company-processes"><div className="eyebrow">PROCESO SEGÚN PLANILLAS Y REUNIONES</div><h2>{selected==="rerchar"?"Compra, venta y gestión de material":"Servicios, transporte y arriendos"}</h2><div className="company-process-links">
      <Link href={`/cotizaciones?empresa=${selected}`}>1. Cotizaciones <ArrowRight size={16}/></Link>
      {selected==="rerchar"&&canManage(actor)?<Link href="/control-guias">2. Control de guía y salida de material <ArrowRight size={16}/></Link>:<Link href={`/solicitudes?empresa=${selected}`}>2. Solicitudes y planificación <ArrowRight size={16}/></Link>}
      {selected==="rerchar"?<Link href="/ingresos">3. Ingreso de material <ArrowRight size={16}/></Link>:<Link href={`/seguimiento-guias?empresa=${selected}`}>3. Guías y seguimiento <ArrowRight size={16}/></Link>}
      <Link href={`/finanzas?empresa=${selected}`}>4. Valorización y cobros <ArrowRight size={16}/></Link>
    </div><p className="helper-text">El flujo completo de estados de pago, arriendos y otras observaciones continúa en desarrollo; estos accesos muestran los módulos existentes.</p></section>
    {showQuotes && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">COMERCIAL · {company.short}</div><h2>Cotizaciones recientes</h2></div><Link href={`/cotizaciones?empresa=${selected}`} className="text-link">Ver todas <ArrowRight size={16}/></Link></div>{quotes.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Asunto</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{quotes.slice(0,5).map(item=><tr key={item.id}><td><Link href={`/cotizaciones/${item.id}`}><strong>{quoteFolio(item)}</strong></Link></td><td>{item.client_name}</td><td>{item.title}</td><td>{item.status}</td><td>{chileDate(item.created_at)}</td></tr>)}</tbody></table></div> : <p className="muted">Aún no hay cotizaciones registradas para {company.short}.</p>}</section>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">OPERACIÓN · {company.short}</div><h2>Solicitudes recientes</h2></div><Link href={`/solicitudes?empresa=${selected}`} className="text-link">Ver todas <ArrowRight size={16}/></Link></div><ServiceTable services={services.slice(0,8)}/></section>
  </>;
}
