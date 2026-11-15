import Link from "next/link";
import {CalendarDays,Plus,FileText,Truck,PackageCheck,ReceiptText,CheckCheck,Layers3,Wallet,AlertTriangle,ShoppingBag,Route,ClipboardCheck,Activity} from "lucide-react";
import {quoteFolio,type Company} from "@/lib/companies";
import type {Quote} from "@/lib/quotes";
import type {ServiceRow} from "@/lib/pilot";
import {ServiceTable,chileDate} from "@/components/UI";
import {ActivityChart,StatusComposition,type MonthActivity,type ServiceStatus} from "@/components/CompanyDashboardCharts";
import DashboardAlerts,{type DashboardAlert} from "@/components/DashboardAlerts";

export type DashboardMetric={label:string;amount:number|string;detail:string;href?:string;kind:"quotes"|"services"|"sales"|"edp"|"route"|"closed"};
export type DashboardProcess={title:string;detail:string;links:{label:string;href:string}[]};
type Props={company:Company;name:string;shortName:string;todayLabel:string;currentPeriod:string;canManage:boolean;showQuotes:boolean;
  metrics:DashboardMetric[];months:MonthActivity[];statuses:ServiceStatus[];alerts:DashboardAlert[];processes:DashboardProcess[];
  quotes:Quote[];services:ServiceRow[];unclassified:number;receivables:{outstanding:string;overdue:string;upcoming:string}|null};
const icons={quotes:FileText,services:Truck,sales:PackageCheck,edp:ReceiptText,route:Route,closed:CheckCheck};
const quoteLabels:Record<string,string>={borrador:"Borrador",enviada:"Enviada",aceptada:"Aceptada",rechazada:"Rechazada"};
const clp=new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0});

export default function CompanyDashboard(props:Props){
  const {company,name,shortName,metrics,months,statuses,alerts,processes,quotes,services,receivables}=props;
  const urgent=alerts.filter(alert=>alert.urgent).length;
  return <div className="company-dashboard-page dashboard-modern">
    <div className="dashboard-toolbar"><nav aria-label="Ruta de navegación" className="dashboard-breadcrumb"><Link href="/">Empresas</Link><span aria-hidden="true">/</span><span>{shortName}</span><span aria-hidden="true">/</span><strong>Panel de control</strong></nav><span className="dashboard-date"><CalendarDays size={14} aria-hidden="true"/>{props.todayLabel}</span></div>
    <header className="dashboard-heading"><div><div className="dashboard-company-label"><span aria-hidden="true"/>{name}</div><h1>Panel de control</h1><p>{company==="rerchar"?"Una mirada clara a tus materiales, documentos y operación.":"Servicios, contratos y gestión del equipo en un solo lugar."}</p></div><div className="dashboard-heading-actions">{urgent>0&&<a className="dashboard-priority-badge" href="#alertas"><span aria-hidden="true"/>{urgent} {urgent===1?"prioridad":"prioridades"}</a>}{props.canManage&&<Link href={`/cotizaciones/nueva?empresa=${company}`} className="button button-primary dashboard-create"><Plus size={17} aria-hidden="true"/> Nueva cotización</Link>}</div></header>
    {props.unclassified>0&&<div className="dashboard-unclassified"><AlertTriangle size={17} aria-hidden="true"/><p><strong>{props.unclassified} servicios anteriores por clasificar.</strong> Se incorporarán al confirmar su empresa de origen.</p><Link href="/solicitudes?empresa=pendiente">Revisar</Link></div>}
    <div className="dashboard-metrics" aria-label="Resumen de la operación">{metrics.map(metric=>{
      const Icon=icons[metric.kind];
      const content=<><div className="dashboard-metric-top"><span>{metric.label}</span><span className={`dashboard-metric-icon dashboard-metric-icon--${metric.kind}`}><Icon size={19} strokeWidth={1.7} aria-hidden="true"/></span></div><strong className="dashboard-metric-value">{typeof metric.amount==="number"?metric.amount.toLocaleString("es-CL"):metric.amount}</strong><span className="dashboard-metric-detail">{metric.detail}</span></>;
      return metric.href?<Link key={metric.label} href={metric.href} className="dashboard-metric">{content}</Link>:<div key={metric.label} className="dashboard-metric">{content}</div>;
    })}</div>
    <div className="dashboard-grid"><div className="dashboard-main-column">
      <ActivityChart months={months} company={company} currentPeriod={props.currentPeriod}/>
      <StatusComposition items={statuses} company={company}/>
    </div><div className="dashboard-side-column">
      <DashboardAlerts alerts={alerts}/>
      {receivables&&<section className="dashboard-balance" aria-labelledby="dashboard-balance-title"><div className="dashboard-balance-heading"><span><Wallet size={18} aria-hidden="true"/></span><p id="dashboard-balance-title">Saldo por cobrar</p><small>CLP</small></div><strong>{clp.format(Number(receivables.outstanding))}</strong><p>Saldo de las facturas registradas de {shortName}.</p><div className="dashboard-balance-details"><span><i className="balance-overdue"/>{Number(receivables.overdue).toLocaleString("es-CL")} vencidas</span><span><i/>{Number(receivables.upcoming).toLocaleString("es-CL")} vencen en 7 días</span></div><Link href={`/cobranzas?empresa=${company}&estado=pendientes`}>Revisar cobranza</Link></section>}
      <div className="dashboard-company-note"><span className="dashboard-note-icon"><Layers3 size={17} aria-hidden="true"/></span><p>Estás en el espacio de <strong>{shortName}</strong>. Los indicadores corresponden a esta empresa.</p></div>
    </div></div>
    <section className="dashboard-processes" aria-labelledby="dashboard-processes-title"><div className="dashboard-section-heading"><div><span className="dashboard-overline">CONTINÚA TU OPERACIÓN</span><h2 id="dashboard-processes-title">Cada proceso, a un paso</h2></div><span className="dashboard-section-icon"><Activity size={20} aria-hidden="true"/></span></div><div className="dashboard-process-grid">{processes.map((process,index)=>{
      const Icon=company==="rerchar"?(index===0?ShoppingBag:PackageCheck):(index===0?Route:ClipboardCheck);
      return <section className="dashboard-process" key={process.title}><div className="dashboard-process-heading"><span><Icon size={21} strokeWidth={1.7} aria-hidden="true"/></span><div><h3>{process.title}</h3><p>{process.detail}</p></div></div><div className="dashboard-process-links">{process.links.map(link=><Link key={link.href} href={link.href}><i aria-hidden="true"/>{link.label}</Link>)}</div></section>;
    })}</div></section>
    {props.showQuotes&&<section className="dashboard-card dashboard-recent" aria-labelledby="dashboard-quotes-title"><div className="dashboard-card-heading"><div><span className="dashboard-overline">COMERCIAL</span><h2 id="dashboard-quotes-title">Cotizaciones recientes</h2></div><Link href={`/cotizaciones?empresa=${company}`} className="dashboard-text-link">Ver todas</Link></div>{quotes.length?<div className="dashboard-quote-list">{quotes.slice(0,5).map(quote=><Link className="dashboard-quote-row" key={quote.id} href={`/cotizaciones/${quote.id}`}><span className="dashboard-quote-folio"><FileText size={16} aria-hidden="true"/><strong>{quoteFolio(quote)}</strong></span><span className="dashboard-quote-client"><strong>{quote.client_name}</strong><small>{quote.title}</small></span><span className={`dashboard-quote-state is-${quote.status}`}>{quoteLabels[quote.status]??quote.status}</span><time>{chileDate(quote.created_at,false)}</time></Link>)}</div>:<div className="dashboard-empty"><span><FileText size={26} aria-hidden="true"/></span><div><strong>Tu próxima propuesta comienza aquí</strong><p>Las cotizaciones de {shortName} aparecerán cuando guardes la primera.</p></div>{props.canManage&&<Link href={`/cotizaciones/nueva?empresa=${company}`} className="dashboard-text-link">Preparar cotización</Link>}</div>}</section>}
    <section className="dashboard-card dashboard-recent dashboard-services" aria-labelledby="dashboard-services-title"><div className="dashboard-card-heading"><div><span className="dashboard-overline">OPERACIÓN</span><h2 id="dashboard-services-title">Solicitudes recientes</h2></div><Link href={`/solicitudes?empresa=${company}`} className="dashboard-text-link">Ver todas</Link></div>{services.length?<ServiceTable services={services.slice(0,8)}/>:<div className="dashboard-empty"><span><Truck size={27} aria-hidden="true"/></span><div><strong>Todo listo para comenzar</strong><p>Los servicios de {shortName} se mostrarán al registrar la primera solicitud.</p></div><Link href={`/solicitudes?empresa=${company}`} className="dashboard-text-link">Abrir solicitudes</Link></div>}</section>
    <footer className="dashboard-footer"><span><span aria-hidden="true"/>{name}</span><small>Datos registrados al {props.todayLabel}</small></footer>
  </div>;
}
