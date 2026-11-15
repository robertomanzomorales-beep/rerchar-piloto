import Link from "next/link";
import Image from "next/image";
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
import {pendingClientOrders,pendingIndividualInvoices} from "@/lib/finance";
import {listCredentialAlerts} from "@/lib/personnel";
import {guideFollowupOverview} from "@/lib/service-ledger";
import {ActivityChart,StatusComposition,type MonthActivity,type ServiceStatus} from "@/components/CompanyDashboardCharts";

type ServiceMetrics = { total:string; requested:string; scheduled:string; in_route:string; pending_review:string; completed:string; cancelled:string; critical:string };
type QuoteMetrics = { total:string; draft:string; sent:string; accepted:string; expired:string; awaiting_order:string; awaiting_service:string };
type DashboardAlert = {label:string;count:number;href:string;urgent?:boolean};
const value = (v:string|undefined) => Number(v ?? 0);
const quoteStatusLabels:Record<string,string>={borrador:"Borrador",enviada:"Enviada",aceptada:"Aceptada",rechazada:"Rechazada"};

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
      count(*) FILTER (WHERE status='cancelada')::text AS cancelled,
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
      FROM client_quotes WHERE issuer=$1 AND ($2::text <> 'cliente' OR (client_id=$3::uuid AND status IN ('enviada','aceptada','rechazada')))`,[selected,actor.role,actor.client_id,today]) : Promise.resolve([]),
    db.query<MonthActivity>(`WITH series AS (
        SELECT generate_series(date_trunc('month',now() AT TIME ZONE 'America/Santiago')-interval '5 months',
          date_trunc('month',now() AT TIME ZONE 'America/Santiago'),interval '1 month') AS month
      ), opened AS (
        SELECT date_trunc('month',s.created_at AT TIME ZONE 'America/Santiago') AS month,count(*) AS total
        FROM service_requests s WHERE s.operating_company=$1 AND s.deleted_at IS NULL
          AND s.created_at >= (SELECT min(month) AT TIME ZONE 'America/Santiago' FROM series)
          AND ($2::text <> 'cliente' OR s.client_id=$3::uuid)
          AND ($2::text <> 'conductor' OR s.driver_id=$4::uuid)
        GROUP BY 1
      ), closed AS (
        SELECT date_trunc('month',s.closed_at AT TIME ZONE 'America/Santiago') AS month,count(*) AS total
        FROM service_requests s WHERE s.operating_company=$1 AND s.deleted_at IS NULL AND s.status='completada'
          AND s.closed_at >= (SELECT min(month) AT TIME ZONE 'America/Santiago' FROM series)
          AND ($2::text <> 'cliente' OR s.client_id=$3::uuid)
          AND ($2::text <> 'conductor' OR s.driver_id=$4::uuid)
        GROUP BY 1
      )
      SELECT to_char(series.month,'YYYY-MM') AS period,coalesce(opened.total,0)::text AS opened,
        coalesce(closed.total,0)::text AS closed
      FROM series LEFT JOIN opened USING (month) LEFT JOIN closed USING (month)
      ORDER BY series.month`,[selected,actor.role,actor.client_id,actor.id]),
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
    actor.role==="admin"?pendingIndividualInvoices(actor,selected):Promise.resolve(0),
    actor.role==="admin"?pendingClientOrders(actor,selected):Promise.resolve(0),
    canManage(actor)?listCredentialAlerts(actor,selected):Promise.resolve([]),
    actor.role==="admin"?db.query<{total:string}>(`SELECT count(*)::text AS total FROM tariff_change_notices n
      JOIN service_tariffs t ON t.id=n.new_tariff_id JOIN client_contracts c ON c.id=t.contract_id
      WHERE n.status='pendiente' AND c.operating_company=$1`,[selected]):Promise.resolve([]),
  ]);
  const s=serviceStats[0],q=quoteStats[0];
  const openServices=value(s?.requested)+value(s?.scheduled)+value(s?.in_route)+value(s?.pending_review);
  const closedThisMonth=value(months.find(month=>month.period===today.slice(0,7))?.closed);
  const todayLabel=new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",day:"numeric",month:"long",year:"numeric"}).format(new Date());
  const serviceBars:ServiceStatus[]=[
    {label:"Solicitadas",status:"solicitada",count:value(s?.requested)},
    {label:"Programadas",status:"programada",count:value(s?.scheduled)},
    {label:"En ruta",status:"en_ruta",count:value(s?.in_route)},
    {label:"En revisión",status:"pendiente_revision",count:value(s?.pending_review)},
    {label:"Completadas",status:"completada",count:value(s?.completed)},
    {label:"Cancelados",status:"cancelada",count:value(s?.cancelled)},
  ];
  const alerts:DashboardAlert[]=[
    ...(canManage(actor)?[
      {label:"Acreditaciones vencidas de conductores",count:credentialAlerts.filter(c=>c.days_left<0).length,href:"/personal#vencimientos",urgent:true},
      {label:"Acreditaciones próximas a vencer",count:credentialAlerts.filter(c=>c.days_left>=0).length,href:"/personal#vencimientos"},
    ]:[]),
    ...(showQuotes?[{label:"Cotizaciones enviadas con vigencia vencida",count:value(q?.expired),href:`/cotizaciones?empresa=${selected}&vista=vencidas`,urgent:true}]:[]),
    ...(canManage(actor)?[{label:"Cotizaciones aceptadas esperando OC o excepción",count:value(q?.awaiting_order),href:`/cotizaciones?empresa=${selected}&vista=sin_oc`},
      {label:"Cotizaciones con OC o excepción esperando solicitud",count:value(q?.awaiting_service),href:`/cotizaciones?empresa=${selected}&vista=sin_servicio`}]:[]),
    {label:"Servicios críticos aún abiertos",count:value(s?.critical),href:`/solicitudes?empresa=${selected}&estado=abiertas&prioridad=critica`,urgent:true},
    ...(canManage(actor)?[{label:"Servicios con documentos por validar",count:value(s?.pending_review),href:`/solicitudes?empresa=${selected}&estado=pendiente_revision`}]:[]),
    ...(canManage(actor)?[{label:"Averías del checklist abiertas",count:value(checklistFaults[0]?.total),href:"/mantenimiento"}]:[]),
    ...(canManage(actor)?[{label:"Viajes incompletos o suspendidos pendientes",count:value(dayIssues[0]?.total),href:`/agenda?empresa=${selected}`}]:[]),
    ...(canManage(actor)?[{label:"Fletes falsos y sobreestadías por decidir",count:extraChargePending,href:`/cobros-extraordinarios?empresa=${selected}`}]:[]),
    ...(receivables?[{label:"Facturas de clientes vencidas con saldo",count:Number(receivables.overdue),href:`/cobranzas?empresa=${selected}&estado=vencidas`,urgent:true},
      {label:"Facturas de clientes que vencen en 7 días",count:Number(receivables.upcoming),href:`/cobranzas?empresa=${selected}&estado=proximas`},
      {label:"Facturas anteriores por conciliar",count:Number(receivables.legacy),href:`/cobranzas?empresa=${selected}`}]:[]),
    ...(actor.role==="admin"?[{label:"Servicios valorizados pendientes de factura individual",count:unbilledServices,href:`/finanzas?empresa=${selected}&facturacion=pendiente`}]:[]),
    ...(actor.role==="admin"?[{label:"Servicios cerrados con OC del cliente requerida y pendiente",count:clientOrdersPending,href:`/finanzas?empresa=${selected}&oc=pendiente`}]:[]),
    ...(actor.role==="admin"?[{label:"Cambios de tarifa por comunicar al cliente",count:value(tariffNotices[0]?.total),href:`/finanzas?empresa=${selected}`}]:[]),
    ...(selected==="rerchar"&&canManage(actor)?[
      {label:"Guías valorizadas atrasadas a mi cargo",count:value(guideAlerts?.my_overdue),href:"/seguimiento-guias?estado=mias",urgent:true},
      {label:"Guías valorizadas atrasadas",count:value(guideAlerts?.overdue),href:"/seguimiento-guias?estado=atrasadas",urgent:true},
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
      {label:"Envíos de EDP atrasados",count:value(billingCalendar.overdue),href:"/estados-pago/calendario",urgent:true},
    ]:[]),
    ...(invoiceAlerts?[
      {label:"Facturas de proveedores vencidas con saldo",count:value(invoiceAlerts.overdue),href:`/facturas-recibidas?empresa=${selected}&estado=vencidas`,urgent:true},
      {label:"Facturas de proveedores que vencen en 7 días",count:value(invoiceAlerts.upcoming),href:`/facturas-recibidas?empresa=${selected}&estado=proximas`},
      {label:"Facturas de proveedores sin vencimiento",count:value(invoiceAlerts.undated),href:`/facturas-recibidas?empresa=${selected}&estado=sin_fecha`},
    ]:[]),
    ...(transferStats?[
      {label:"Transferencias a proveedores por aprobar",count:value(transferStats.solicitadas),href:`/transferencias?empresa=${selected}`},
      {label:"Transferencias aprobadas por ejecutar",count:value(transferStats.aprobadas),href:`/transferencias?empresa=${selected}`},
      {label:"Transferencias ejecutadas por verificar",count:value(transferStats.ejecutadas),href:`/transferencias?empresa=${selected}`},
    ]:[]),
  ];
  const activeAlerts=alerts.filter(a=>a.count>0).sort((a,b)=>Number(Boolean(b.urgent))-Number(Boolean(a.urgent)));
  const urgentAlerts=activeAlerts.filter(a=>a.urgent).length;
  const alertItem=(alert:DashboardAlert)=><Link href={alert.href} key={alert.label} className={`company-alert ${alert.urgent?"company-alert--urgent":""}`}><strong>{alert.count}</strong><span>{alert.label}</span>{alert.urgent&&<small>Prioritaria</small>}</Link>;
  const processGroups=selected==="rerchar"?[
    {title:"Compra y recepción",detail:"Del acuerdo comercial al ingreso físico y la guía valorizada",links:[
      ...(showQuotes?[{label:"Cotizar compra",href:`/cotizaciones/nueva?empresa=rerchar&tipo=compra`}]:[]),
      {label:"Solicitudes de compra",href:"/solicitudes?empresa=rerchar&tipo=compra"},
      ...(canManage(actor)?[{label:"Ingreso de material",href:"/ingresos"},{label:"Guía valorizada",href:"/seguimiento-guias"},{label:"Existencias",href:"/materiales-stock"}]:[]),
    ]},
    {title:"Venta y salida",detail:"Solicitud de venta, despacho y control de guía",links:[
      ...(showQuotes?[{label:"Cotizar venta o servicio",href:"/cotizaciones/nueva?empresa=rerchar"}]:[]),
      {label:"Solicitudes de venta",href:"/solicitudes?empresa=rerchar&tipo=venta"},
      ...(canManage(actor)?[{label:"Control de Guía",href:"/control-guias"}]:[]),
      ...(actor.role==="admin"?[{label:"Facturación y cobro",href:"/finanzas?empresa=rerchar"}]:[]),
    ]},
  ]:[
    {title:"Servicios y arriendos",detail:"Cotización, programación, ejecución y cierre del servicio",links:[
      ...(showQuotes?[{label:"Cotizar servicio",href:"/cotizaciones/nueva?empresa=e_y_j"}]:[]),
      {label:"Solicitudes de traslado",href:"/solicitudes?empresa=e_y_j&tipo=traslado"},
      {label:"Solicitudes de arriendo",href:"/solicitudes?empresa=e_y_j&tipo=arriendo"},
      {label:"Agenda operativa",href:"/agenda?empresa=e_y_j"},
    ]},
    ...(canManage(actor)?[{title:"Cierre contractual",detail:"Cortes por cliente, estado de pago y facturación",links:[
      {label:"Calendario de cortes",href:"/estados-pago/calendario"},
      {label:"Estados de pago",href:"/estados-pago"},
      ...(actor.role==="admin"?[{label:"Facturación y cobro",href:"/finanzas?empresa=e_y_j"}]:[]),
    ]}]:[]),
  ];
  return <div className="company-dashboard-page">
    <Link href="/" className="back-link"><ArrowLeft size={15}/> Empresas</Link>
    <div className="page-title-row company-dashboard-heading"><div className="company-dashboard-identity">
      <div className={`company-dashboard-brand company-dashboard-brand--${selected}`}>
        {selected==="rerchar"?<Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={892} height={311} loading="eager"/>:<span><strong>E y J</strong><small>SERVICIOS INTEGRALES</small></span>}
      </div>
      <div><div className="eyebrow">{company.name} · VISIÓN OPERATIVA</div><h1>{selected==="rerchar"?"Materiales y trazabilidad":"Servicios y contratos"}</h1><p className="page-intro">{selected==="rerchar"?"Compra, recepción, venta y salida de materiales":"Ejecución, estados de pago y cierre contractual"}</p></div></div>
      {canManage(actor) && <Link href={`/cotizaciones/nueva?empresa=${selected}`} className="button button-primary"><Plus size={17}/> Nueva cotización</Link>}
    </div>
    {value(unclassified[0]?.total)>0&&<p className="company-unclassified"><AlertTriangle size={17}/><span><strong>{value(unclassified[0]?.total)} servicios anteriores por clasificar.</strong> No se suman a ninguna empresa hasta confirmar sus documentos de origen.</span><Link href="/solicitudes?empresa=pendiente">Revisar <ArrowRight size={15}/></Link></p>}
    {urgentAlerts>0&&<div className="company-priority-note" role="status"><AlertTriangle size={17}/><span><strong>{urgentAlerts} {urgentAlerts===1?"categoría prioritaria requiere":"categorías prioritarias requieren"} atención.</strong> Revise los vencimientos y servicios críticos en las alertas.</span><a href="#alertas">Revisar pendientes</a></div>}
    <div className="company-section-caption"><span>RESUMEN OPERATIVO</span><p>{company.short} · datos registrados al {todayLabel}</p></div>
    <div className="company-metric-grid">
      {showQuotes&&<Link href={`/cotizaciones?empresa=${selected}&vista=gestion`} className="company-metric"><span>Cotizaciones en gestión</span><strong>{value(q?.draft)+value(q?.sent)}</strong><small>{value(q?.draft)} en borrador · {value(q?.sent)} enviadas</small></Link>}
      <Link href={`/solicitudes?empresa=${selected}&estado=abiertas`} className="company-metric"><span>Servicios abiertos</span><strong>{openServices}</strong><small>{value(s?.requested)+value(s?.scheduled)} por iniciar · {value(s?.in_route)} en ruta · {value(s?.pending_review)} en revisión</small></Link>
      {selected==="rerchar"&&canManage(actor)?<Link href="/control-guias" className="company-metric"><span>Ventas por cerrar</span><strong>{value(materials?.guides.pending)}</strong><small>{value(materials?.guides.total)} guías registradas</small></Link>:!canManage(actor)?<Link href={`/solicitudes?empresa=${selected}&estado=en_ruta`} className="company-metric"><span>En ruta</span><strong>{value(s?.in_route)}</strong><small>En ejecución</small></Link>:null}
      {selected==="e_y_j"&&canManage(actor)&&(payments?.ready?<Link href="/estados-pago" className="company-metric"><span>EDP por completar</span><strong>{value(payments.pending)}</strong><small>{value(payments.total)} estados registrados</small></Link>:<div className="company-metric"><span>Estados de pago</span><strong>—</strong><small>Sin datos de este módulo</small></div>)}
      <Link href={`/solicitudes?empresa=${selected}&estado=completada&cierre_mes=${today.slice(0,7)}`} className="company-metric"><span>Cierres del mes</span><strong>{closedThisMonth}</strong><small>{value(s?.completed)} completados en total</small></Link>
    </div>
    <div className="company-analytics">
      <ActivityChart months={months} company={selected} currentPeriod={today.slice(0,7)}/>
      <StatusComposition items={serviceBars} company={selected}/>
    </div>
    <section id="alertas" className="section-card company-alerts"><div className="section-heading"><div><div className="eyebrow">SEGUIMIENTO</div><h2>Alertas y pendientes</h2><p>Situaciones que requieren revisión del equipo</p></div><span className="count-pill">{urgentAlerts>0?`${urgentAlerts} prioritarias · `:""}{activeAlerts.length} categorías activas</span></div><div className="company-alert-list">{activeAlerts.slice(0,8).map(alertItem)}</div>{activeAlerts.length>8&&<details className="company-alert-more"><summary>Ver {activeAlerts.length-8} alertas adicionales</summary><div className="company-alert-list">{activeAlerts.slice(8).map(alertItem)}</div></details>}{!activeAlerts.length&&<p className="helper-text"><CheckCircle2 size={15}/> Sin pendientes registrados en estas categorías.</p>}</section>
    <section className="company-workflow" aria-label="Procesos operativos"><div className="company-workflow-label"><span>RECORRIDOS DE {company.short.toUpperCase()}</span><strong>{selected==="rerchar"?"Compra y venta siguen recorridos distintos":"Ejecución y cierre contractual"}</strong></div><div className="company-workflow-groups">{processGroups.map(group=><div className="company-process-group" key={group.title}><div className="company-process-heading"><h2>{group.title}</h2><p>{group.detail}</p></div><ol>{group.links.map((item,index)=><li key={item.href}><Link href={item.href}><span className="workflow-index">{String(index+1).padStart(2,"0")}</span><span>{item.label}</span></Link></li>)}</ol></div>)}</div></section>
    {showQuotes && <section className="section-card company-recent-section"><div className="section-heading"><div><div className="eyebrow">COMERCIAL · {company.short}</div><h2>Cotizaciones recientes</h2></div><Link href={`/cotizaciones?empresa=${selected}`} className="text-link">Ver todas <ArrowRight size={16}/></Link></div>{quotes.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Asunto</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{quotes.slice(0,5).map(item=><tr key={item.id}><td><Link className="table-main" href={`/cotizaciones/${item.id}`}>{quoteFolio(item)}</Link></td><td>{item.client_name}</td><td className="company-quote-title">{item.title}</td><td><span className={`company-quote-status company-quote-status--${item.status}`}>{quoteStatusLabels[item.status]??item.status}</span></td><td>{chileDate(item.created_at,false)}</td></tr>)}</tbody></table></div> : <div className="company-recent-empty"><strong>Sin cotizaciones registradas</strong><span>Las propuestas de {company.short} aparecerán aquí cuando se guarde la primera.</span>{canManage(actor)&&<Link href={`/cotizaciones/nueva?empresa=${selected}`}>Preparar cotización <ArrowRight size={15}/></Link>}</div>}</section>}
    <section className="section-card company-recent-section"><div className="section-heading"><div><div className="eyebrow">OPERACIÓN · {company.short}</div><h2>Solicitudes recientes</h2></div><Link href={`/solicitudes?empresa=${selected}`} className="text-link">Ver todas <ArrowRight size={16}/></Link></div>{services.length?<ServiceTable services={services.slice(0,8)}/>:<div className="company-recent-empty"><strong>Sin servicios registrados</strong><span>Las solicitudes de {company.short} se mostrarán aquí al comenzar la operación.</span><Link href={`/solicitudes?empresa=${selected}`}>Abrir solicitudes <ArrowRight size={15}/></Link></div>}</section>
  </div>;
}
