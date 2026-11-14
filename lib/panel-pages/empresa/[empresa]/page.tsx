import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowLeft, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireActor, canManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, type Company } from "@/lib/companies";
import { listServices } from "@/lib/pilot";
import { listQuotes, quoteFolio } from "@/lib/quotes";
import { ServiceTable, chileDate } from "@/components/UI";
import {rercharMaterialDashboard,rercharReceiptGuideDashboard,rercharReceiptClosureDashboard,eyjPaymentDashboard,eyjEdpInvoiceDashboard} from "@/lib/company-dashboard";
import {eyjBillingCalendarDashboard} from "@/lib/payment-calendar";
import {pendingExtraChargeCount} from "@/lib/extra-charges";
import {receivablesOverview} from "@/lib/receivables";
import {supplierInvoiceOverview} from "@/lib/supplier-invoices";
import {supplierTransferOverview} from "@/lib/supplier-transfers";
import {moduleReady} from "@/lib/schema-readiness";
import {pendingClientOrders} from "@/lib/finance";
import {listCredentialAlerts} from "@/lib/personnel";
import {guideFollowupOverview} from "@/lib/service-ledger";

type ServiceMetrics = { total:string; requested:string; scheduled:string; in_route:string; pending_review:string; completed:string; critical:string };
type QuoteMetrics = { total:string; draft:string; sent:string; accepted:string; expired:string; awaiting_order:string; awaiting_service:string };
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
  const [quotes,services,serviceStats,quoteStats,months,guideAlerts,invoiceAlerts,unclassified,materials,payments,receiptGuides,receiptClosure,billingCalendar,checklistFaults,dayIssues,extraChargePending,receivables,edpInvoices,transferStats,unbilledServices,clientOrdersPending,credentialAlerts,tariffNotices] = await Promise.all([
    showQuotes ? listQuotes(actor,"",selected,"","",{},5) : Promise.resolve([]),
    listServices(actor,"","",selected,"",8),
    db.query<ServiceMetrics>(`SELECT count(*)::text AS total,
      count(*) FILTER (WHERE status='solicitada')::text AS requested,
      count(*) FILTER (WHERE status='programada')::text AS scheduled,
      count(*) FILTER (WHERE status='en_ruta')::text AS in_route,
      count(*) FILTER (WHERE status='pendiente_revision')::text AS pending_review,
      count(*) FILTER (WHERE status='completada')::text AS completed,
      count(*) FILTER (WHERE priority='critica' AND status IN ('solicitada','programada','en_ruta','pendiente_revision'))::text AS critical
      FROM service_requests WHERE operating_company=$1 AND deleted_at IS NULL
      AND ($2::text <> 'cliente' OR client_id=$3::uuid)
      AND ($2::text <> 'conductor' OR driver_id=$4::uuid)`,[selected,actor.role,actor.client_id,actor.id]),
    showQuotes ? db.query<QuoteMetrics>(`SELECT count(*)::text AS total,
      count(*) FILTER (WHERE status='borrador')::text AS draft,
      count(*) FILTER (WHERE status='enviada')::text AS sent,
      count(*) FILTER (WHERE status='aceptada')::text AS accepted,
      count(*) FILTER (WHERE status='enviada' AND valid_until < $4::date)::text AS expired
      ,count(*) FILTER (WHERE status='aceptada' AND client_order_reference IS NULL AND client_order_exception IS NULL)::text AS awaiting_order
      ,count(*) FILTER (WHERE status='aceptada' AND (client_order_reference IS NOT NULL OR client_order_exception IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM service_requests s WHERE s.quote_id=client_quotes.id AND s.deleted_at IS NULL))::text AS awaiting_service
      FROM client_quotes WHERE issuer=$1 AND ($2::text <> 'cliente' OR client_id=$3::uuid)`,[selected,actor.role,actor.client_id,today]) : Promise.resolve([]),
    db.query<Month>(`SELECT to_char(series.month,'YYYY-MM') AS period,count(s.id)::text AS total
      FROM generate_series(date_trunc('month',now())-interval '5 months',date_trunc('month',now()),interval '1 month') AS series(month)
      LEFT JOIN service_requests s ON s.created_at>=series.month AND s.created_at<series.month+interval '1 month'
        AND s.operating_company=$1 AND s.deleted_at IS NULL
        AND ($2::text <> 'cliente' OR s.client_id=$3::uuid)
        AND ($2::text <> 'conductor' OR s.driver_id=$4::uuid)
      GROUP BY series.month ORDER BY series.month`,[selected,actor.role,actor.client_id,actor.id]),
    selected==="rerchar"&&canManage(actor) ? guideFollowupOverview(actor,today) : Promise.resolve(null),
    actor.role === "admin" ? supplierInvoiceOverview(actor,selected,today) : Promise.resolve(null),
    canManage(actor) ? db.query<{total:string}>("SELECT count(*)::text AS total FROM service_requests WHERE operating_company IS NULL AND deleted_at IS NULL") : Promise.resolve([]),
    selected==="rerchar"&&canManage(actor) ? rercharMaterialDashboard() : Promise.resolve(null),
    selected==="e_y_j"&&canManage(actor) ? eyjPaymentDashboard() : Promise.resolve(null),
    selected==="rerchar"&&canManage(actor) ? rercharReceiptGuideDashboard() : Promise.resolve(null),
    selected==="rerchar"&&canManage(actor) ? rercharReceiptClosureDashboard() : Promise.resolve(null),
    selected==="e_y_j"&&canManage(actor) ? eyjBillingCalendarDashboard() : Promise.resolve(null),
    canManage(actor)?db.query<{total:string}>(`SELECT count(*)::text AS total FROM fleet_incidents i
      JOIN service_requests s ON s.id=i.source_service_id WHERE s.operating_company=$1 AND i.status='abierta'`,[selected]):Promise.resolve([]),
    canManage(actor)?db.query<{total:string}>(`SELECT count(*)::text AS total FROM (
      SELECT DISTINCT ON (service_id) service_id,outcome FROM service_day_reports ORDER BY service_id,day DESC
    ) d JOIN service_requests s ON s.id=d.service_id
    WHERE s.operating_company=$1 AND s.deleted_at IS NULL AND s.status IN ('programada','en_ruta','pendiente_revision')
      AND d.outcome IN ('incompleto','suspendido')`,[selected]):Promise.resolve([]),
    canManage(actor)?pendingExtraChargeCount(actor,selected):Promise.resolve(0),
    actor.role==="admin"?receivablesOverview(actor,selected,today):Promise.resolve(null),
    selected==="e_y_j"&&actor.role==="admin"?eyjEdpInvoiceDashboard():Promise.resolve(null),
    actor.role==="admin"?moduleReady("supplier_transfers").then(ready=>ready?supplierTransferOverview(actor,selected):null):Promise.resolve(null),
    actor.role==="admin"?db.query<{total:string}>(`SELECT count(*)::text AS total FROM service_requests s
      JOIN service_valuations v ON v.service_id=s.id
      WHERE s.operating_company=$1 AND s.status='completada' AND s.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM service_invoices f WHERE f.valuation_id=v.id AND f.status='emitida')`,[selected]):Promise.resolve([]),
    actor.role==="admin"?pendingClientOrders(actor,selected):Promise.resolve(0),
    canManage(actor)?listCredentialAlerts(actor,selected):Promise.resolve([]),
    actor.role==="admin"?db.query<{total:string}>(`SELECT count(*)::text AS total FROM tariff_change_notices n
      JOIN service_tariffs t ON t.id=n.new_tariff_id JOIN client_contracts c ON c.id=t.contract_id
      WHERE n.status='pendiente' AND c.operating_company=$1`,[selected]):Promise.resolve([]),
  ]);
  const s=serviceStats[0],q=quoteStats[0];
  const maxMonth=Math.max(1,...months.map(m=>value(m.total)));
  const chartMaximum=Math.max(4,Math.ceil(maxMonth/4)*4);
  const chartY=(count:number)=>190-160*count/chartMaximum;
  const chartX=(index:number)=>57+index*108;
  const chartPath=months.map((m,index)=>`${index===0?"M":"L"} ${chartX(index)} ${chartY(value(m.total))}`).join(" ");
  const chartArea=`${chartPath} L ${chartX(months.length-1)} 190 L ${chartX(0)} 190 Z`;
  const monthLabel=new Intl.DateTimeFormat("es-CL",{month:"short",timeZone:"UTC"});
  const serviceBars=[
    {label:"Solicitadas",status:"solicitada",count:value(s?.requested),color:"#9aaab0"},
    {label:"Programadas",status:"programada",count:value(s?.scheduled),color:"#879ca5"},
    {label:"En ruta",status:"en_ruta",count:value(s?.in_route),color:"#5b8490"},
    {label:"En revisión",status:"pendiente_revision",count:value(s?.pending_review),color:"#738995"},
    {label:"Completadas",status:"completada",count:value(s?.completed),color:"#577a6d"},
  ];
  const chartTotal=serviceBars.reduce((sum,item)=>sum+item.count,0);
  const maxStatus=Math.max(1,...serviceBars.map(item=>item.count));
  const alerts=[
    ...(canManage(actor)?[
      {label:"Acreditaciones vencidas de conductores",count:credentialAlerts.filter(c=>c.days_left<0).length,href:"/personal#vencimientos"},
      {label:"Acreditaciones próximas a vencer",count:credentialAlerts.filter(c=>c.days_left>=0).length,href:"/personal#vencimientos"},
    ]:[]),
    ...(showQuotes?[{label:"Cotizaciones enviadas con vigencia vencida",count:value(q?.expired),href:`/cotizaciones?empresa=${selected}`}]:[]),
    ...(canManage(actor)?[{label:"Cotizaciones aceptadas esperando OC o excepción",count:value(q?.awaiting_order),href:`/cotizaciones?empresa=${selected}`},
      {label:"Cotizaciones con OC o excepción esperando solicitud",count:value(q?.awaiting_service),href:`/cotizaciones?empresa=${selected}`}]:[]),
    {label:"Servicios críticos aún abiertos",count:value(s?.critical),href:`/solicitudes?empresa=${selected}`},
    ...(canManage(actor)?[{label:"Servicios con documentos por validar",count:value(s?.pending_review),href:`/solicitudes?empresa=${selected}&estado=pendiente_revision`}]:[]),
    ...(canManage(actor)?[{label:"Averías del checklist abiertas",count:value(checklistFaults[0]?.total),href:"/mantenimiento"}]:[]),
    ...(canManage(actor)?[{label:"Viajes incompletos o suspendidos pendientes",count:value(dayIssues[0]?.total),href:`/agenda?empresa=${selected}`}]:[]),
    ...(canManage(actor)?[{label:"Fletes falsos y sobreestadías por decidir",count:extraChargePending,href:`/cobros-extraordinarios?empresa=${selected}`}]:[]),
    ...(receivables?[{label:"Facturas de clientes vencidas con saldo",count:Number(receivables.overdue),href:`/cobranzas?empresa=${selected}&estado=vencidas`},
      {label:"Facturas de clientes que vencen en 7 días",count:Number(receivables.upcoming),href:`/cobranzas?empresa=${selected}&estado=proximas`},
      {label:"Facturas anteriores por conciliar",count:Number(receivables.legacy),href:`/cobranzas?empresa=${selected}`}]:[]),
    ...(actor.role==="admin"?[{label:"Servicios valorizados sin factura individual · revisar EDP si corresponde",count:value(unbilledServices[0]?.total),href:`/finanzas?empresa=${selected}&facturacion=pendiente`}]:[]),
    ...(actor.role==="admin"?[{label:"Servicios cerrados con OC del cliente requerida y pendiente",count:clientOrdersPending,href:`/finanzas?empresa=${selected}&oc=pendiente`}]:[]),
    ...(actor.role==="admin"?[{label:"Cambios de tarifa por comunicar al cliente",count:value(tariffNotices[0]?.total),href:`/finanzas?empresa=${selected}`}]:[]),
    ...(selected==="rerchar"&&canManage(actor)?[
      {label:"Guías valorizadas atrasadas a mi cargo",count:value(guideAlerts?.my_overdue),href:"/seguimiento-guias?estado=mias"},
      {label:"Guías valorizadas atrasadas",count:value(guideAlerts?.overdue),href:"/seguimiento-guias?estado=atrasadas"},
      {label:"Guías valorizadas que vencen en 7 días",count:value(guideAlerts?.upcoming),href:"/seguimiento-guias?estado=proximas"},
      {label:"Guías valorizadas pendientes sin plazo",count:value(guideAlerts?.undated),href:"/seguimiento-guias?estado=sin_plazo"},
    ]:[]),
    ...(selected==="rerchar"&&canManage(actor)?[{label:"Ventas de material con pesaje, factura o pago pendientes",count:value(materials?.guides.pending),href:"/control-guias"}]:[]),
    ...(selected==="rerchar"&&canManage(actor)&&receiptGuides?.ready?[{label:"Ingresos esperando guía valorizada",count:value(receiptGuides.pending),href:"/ingresos"}]:[]),
    ...(selected==="rerchar"&&canManage(actor)&&receiptClosure?.ready?[
      {label:"Ingresos con factura por completar",count:value(receiptClosure.invoice_pending),href:"/ingresos"},
      {label:"Ingresos con pago pendiente o parcial",count:value(receiptClosure.payment_pending),href:"/ingresos"},
      {label:"Ingresos con aviso documental pendiente",count:value(receiptClosure.notice_pending),href:"/ingresos"},
    ]:[]),
    ...(selected==="rerchar"&&canManage(actor)&&materials?.stock_ready?[{label:"Guías anteriores con salida de stock por conciliar",count:value(materials.guides.stock_pending),href:"/control-guias"}]:[]),
    ...(selected==="e_y_j"&&canManage(actor)&&payments?.ready?[{label:"Estados de pago por completar o corregir",count:value(payments.pending),href:"/estados-pago"}]:[]),
    ...(edpInvoices?.ready?[...(edpInvoices.order_ready?[
      {label:"EDP aprobados esperando OC del cliente",count:value(edpInvoices.awaiting_order),href:"/estados-pago"},
      {label:"EDP con OC listos para asociar factura",count:value(edpInvoices.ready_to_invoice),href:"/estados-pago"},
    ]:[{label:"EDP aprobados sin factura asociada",count:value(edpInvoices.unbilled),href:"/estados-pago"}])]:[]),
    ...(selected==="e_y_j"&&canManage(actor)&&billingCalendar?.ready?[
      {label:"Cortes de EDP en los próximos 7 días",count:value(billingCalendar.cutoffs),href:"/estados-pago/calendario"},
      {label:"Envíos de EDP en los próximos 7 días",count:value(billingCalendar.sends),href:"/estados-pago/calendario"},
      {label:"Envíos de EDP atrasados",count:value(billingCalendar.overdue),href:"/estados-pago/calendario"},
    ]:[]),
    ...(invoiceAlerts?[
      {label:"Facturas de proveedores vencidas con saldo",count:value(invoiceAlerts.overdue),href:`/facturas-recibidas?empresa=${selected}&estado=vencidas`},
      {label:"Facturas de proveedores que vencen en 7 días",count:value(invoiceAlerts.upcoming),href:`/facturas-recibidas?empresa=${selected}&estado=proximas`},
      {label:"Facturas de proveedores sin vencimiento",count:value(invoiceAlerts.undated),href:`/facturas-recibidas?empresa=${selected}&estado=sin_fecha`},
    ]:[]),
    ...(transferStats?[
      {label:"Transferencias a proveedores por aprobar",count:value(transferStats.solicitadas),href:`/transferencias?empresa=${selected}`},
      {label:"Transferencias aprobadas por ejecutar",count:value(transferStats.aprobadas),href:`/transferencias?empresa=${selected}`},
      {label:"Transferencias ejecutadas por verificar",count:value(transferStats.ejecutadas),href:`/transferencias?empresa=${selected}`},
    ]:[]),
  ];
  const activeAlerts=alerts.filter(a=>a.count>0);
  const processLinks=[
    ...(showQuotes?[{label:"Cotizaciones",href:`/cotizaciones?empresa=${selected}`}]:[]),
    {label:selected==="rerchar"?"Solicitudes y planificación":"Solicitudes y despacho",href:`/solicitudes?empresa=${selected}`},
    ...(selected==="rerchar"&&canManage(actor)?[{label:"Control de guía y salida de material",href:"/control-guias"}]:[]),
    ...(selected==="rerchar"&&canManage(actor)?[{label:"Recepción y stock de material",href:"/ingresos"}]:[]),
    ...(selected==="e_y_j"&&canManage(actor)?[{label:"Calendario de cortes y envíos",href:"/estados-pago/calendario"},{label:"Estados de pago de servicios y arriendos",href:"/estados-pago"}]:[]),
    ...(actor.role==="admin"?[{label:"Facturas emitidas y cobros",href:`/finanzas?empresa=${selected}`}]:[]),
  ];
  return <>
    <Link href="/" className="back-link"><ArrowLeft size={15}/> Empresas</Link>
    <div className="page-title-row company-dashboard-heading"><div><div className="eyebrow">{company.name}</div><h1>Panel operativo</h1><p className="page-intro">Seguimiento de {company.short} · datos registrados en esta operación.</p></div>
      {canManage(actor) && <Link href={`/cotizaciones/nueva?empresa=${selected}`} className="button button-primary"><Plus size={17}/> Nueva cotización</Link>}
    </div>
    {value(unclassified[0]?.total)>0&&<p className="company-unclassified"><AlertTriangle size={17}/><span><strong>{value(unclassified[0]?.total)} servicios anteriores por clasificar.</strong> No se suman a ninguna empresa hasta confirmar sus documentos de origen.</span><Link href="/solicitudes?empresa=pendiente">Revisar <ArrowRight size={15}/></Link></p>}
    <section className="company-workflow" aria-label="Recorrido operativo"><div className="company-workflow-label"><span>RECORRIDO OPERATIVO</span><strong>{selected==="rerchar"?"Materiales y trazabilidad":"Servicios y contratos"}</strong></div><ol>{processLinks.map((item,index)=><li key={item.href}><Link href={item.href}><span className="workflow-index">{String(index+1).padStart(2,"0")}</span><span>{item.label}</span></Link></li>)}</ol></section>
    <div className="company-metric-grid">
      {showQuotes&&<Link href={`/cotizaciones?empresa=${selected}`} className="company-metric"><span>Cotizaciones</span><strong>{value(q?.total)}</strong><small>{value(q?.accepted)} aceptadas</small></Link>}
      <Link href={`/solicitudes?empresa=${selected}`} className="company-metric"><span>Servicios registrados</span><strong>{value(s?.total)}</strong><small>{value(s?.requested)} por planificar</small></Link>
      {selected==="rerchar"&&canManage(actor)?<Link href="/control-guias" className="company-metric"><span>Control de guías</span><strong>{value(materials?.guides.total)}</strong><small>{value(materials?.guides.pending)} ventas por cerrar</small></Link>:!canManage(actor)?<Link href={`/solicitudes?empresa=${selected}&estado=en_ruta`} className="company-metric"><span>En ruta</span><strong>{value(s?.in_route)}</strong><small>En ejecución</small></Link>:null}
      {selected==="e_y_j"&&canManage(actor)&&(payments?.ready?<Link href="/estados-pago" className="company-metric"><span>Estados de pago</span><strong>{value(payments.total)}</strong><small>{value(payments.pending)} por completar</small></Link>:<div className="company-metric"><span>Estados de pago</span><strong>—</strong><small>Pendiente de habilitar en la base de datos</small></div>)}
      <Link href={`/solicitudes?empresa=${selected}&estado=completada`} className="company-metric"><span>Completados</span><strong>{value(s?.completed)}</strong><small>Con cierre registrado</small></Link>
    </div>
    <div className="company-analytics">
      <section className="section-card company-chart-card"><div className="eyebrow">ACTIVIDAD · SEIS MESES</div><div className="chart-heading"><h2>Servicios ingresados</h2><strong>{months.reduce((sum,m)=>sum+value(m.total),0)} <span>en el período</span></strong></div><figure className="company-trend"><svg viewBox="0 0 660 235" role="img" aria-label={`Servicios ingresados por mes: ${months.map(m=>`${monthLabel.format(new Date(`${m.period}-01T00:00:00Z`))} ${value(m.total)}`).join(", ")}`} preserveAspectRatio="xMidYMid meet"><defs><linearGradient id={`trend-area-${selected}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--company-accent)" stopOpacity=".13"/><stop offset="100%" stopColor="var(--company-accent)" stopOpacity="0"/></linearGradient></defs>
        {[0,1,2,3,4].map(i=><g key={i}><line className="chart-gridline" x1="48" x2="638" y1={30+i*40} y2={30+i*40}/><text className="chart-axis-label" x="37" y={34+i*40} textAnchor="end">{chartMaximum-i*chartMaximum/4}</text></g>)}
        <path className="chart-trend-area" d={chartArea} fill={`url(#trend-area-${selected})`}/><path className="chart-trend-line" d={chartPath}/>
        {months.map((m,index)=><g className="chart-observation" key={m.period} tabIndex={0} aria-label={`${monthLabel.format(new Date(`${m.period}-01T00:00:00Z`))}: ${value(m.total)} servicios`}><line className="chart-observation-guide" x1={chartX(index)} x2={chartX(index)} y1={chartY(value(m.total))} y2="190"/><circle className="chart-observation-hit" cx={chartX(index)} cy={chartY(value(m.total))} r="18"/><circle className="chart-trend-point" cx={chartX(index)} cy={chartY(value(m.total))} r="3"/><g className="chart-observation-tip" transform={`translate(${chartX(index)-37} ${Math.max(7,chartY(value(m.total))-42)})`}><rect width="74" height="27" rx="3"/><text x="37" y="18" textAnchor="middle">{value(m.total)} servicios</text></g><text className="chart-month-label" x={chartX(index)} y="218" textAnchor="middle">{monthLabel.format(new Date(`${m.period}-01T00:00:00Z`))}</text></g>)}
      </svg><figcaption>Registros creados por mes · escala de servicios</figcaption></figure></section>
      <section className="section-card company-chart-card"><div className="eyebrow">ESTADO ACTUAL</div><div className="chart-heading"><h2>Distribución de servicios</h2><strong>{chartTotal} <span>registrados</span></strong></div><div className="company-status-chart">{serviceBars.map(item=><Link href={`/solicitudes?empresa=${selected}&estado=${item.status}`} className="company-status-row" key={item.status}><span className="status-label">{item.label}</span><span className="status-track" aria-hidden="true"><span style={{width:`${100*item.count/maxStatus}%`,backgroundColor:item.color}}/></span><strong>{item.count}</strong><small>{chartTotal?Math.round(100*item.count/chartTotal):0}%</small></Link>)}</div><p className="helper-text">Distribución de servicios activos y completados. Excluye cancelados.</p></section>
    </div>
    <section className="section-card company-alerts"><div className="section-heading"><div><div className="eyebrow">ATENCIÓN DEL EQUIPO</div><h2>Alertas y pendientes</h2></div><span className="count-pill">{activeAlerts.length} categorías activas</span></div><div className="company-alert-list">{activeAlerts.slice(0,8).map(a=><Link href={a.href} key={a.label} className="company-alert"><strong>{a.count}</strong><span>{a.label}</span></Link>)}</div>{activeAlerts.length>8&&<details className="company-alert-more"><summary>Ver {activeAlerts.length-8} alertas adicionales</summary><div className="company-alert-list">{activeAlerts.slice(8).map(a=><Link href={a.href} key={a.label} className="company-alert"><strong>{a.count}</strong><span>{a.label}</span></Link>)}</div></details>}{!activeAlerts.length&&<p className="helper-text"><CheckCircle2 size={15}/> Sin pendientes registrados en estas categorías.</p>}</section>
    {showQuotes && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">COMERCIAL · {company.short}</div><h2>Cotizaciones recientes</h2></div><Link href={`/cotizaciones?empresa=${selected}`} className="text-link">Ver todas <ArrowRight size={16}/></Link></div>{quotes.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Asunto</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{quotes.slice(0,5).map(item=><tr key={item.id}><td><Link href={`/cotizaciones/${item.id}`}><strong>{quoteFolio(item)}</strong></Link></td><td>{item.client_name}</td><td>{item.title}</td><td>{item.status}</td><td>{chileDate(item.created_at)}</td></tr>)}</tbody></table></div> : <p className="muted">Aún no hay cotizaciones registradas para {company.short}.</p>}</section>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">OPERACIÓN · {company.short}</div><h2>Solicitudes recientes</h2></div><Link href={`/solicitudes?empresa=${selected}`} className="text-link">Ver todas <ArrowRight size={16}/></Link></div><ServiceTable services={services.slice(0,8)}/></section>
  </>;
}
