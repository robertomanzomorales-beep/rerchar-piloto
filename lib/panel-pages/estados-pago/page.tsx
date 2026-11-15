import Link from "next/link";
import {redirect} from "next/navigation";
import {Plus,ReceiptText} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {listPaymentStatements,paymentStatementOverview,type StatementView} from "@/lib/payment-statements";
import {Notice} from "@/components/UI";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

const day=(v:Date|string)=>new Intl.DateTimeFormat("es-CL",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(v));
const labels={residuos:"Transporte y disposición",arriendo:"Arriendo de equipo"};
const views:Record<StatementView,string>={"":"Todos",pendientes:"Por completar o corregir",enviados:"Enviados",aprobados:"Aprobados",
  sin_oc:"Esperan OC del cliente",lista_factura:"OC lista para factura",sin_factura:"Sin factura asociada"};
export default async function PaymentStatements({searchParams}:{searchParams:Promise<{error?:string;ok?:string;vista?:string;pagina?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  if(!await moduleReady("edp"))return <ModuleUnavailable title="Estados de pago" company="e_y_j"/>;
  const [query,billingReady,orderReady]=await Promise.all([searchParams,moduleReady("edp_billing"),moduleReady("edp_client_order")]);
  const requestedView=Object.hasOwn(views,query.vista??"")?query.vista as StatementView:"";
  const view:StatementView=(!billingReady&&["sin_oc","lista_factura","sin_factura"].includes(requestedView))||(!orderReady&&["sin_oc","lista_factura"].includes(requestedView))?"":requestedView;
  const requestedPage=Number(query.pagina),pageNumber=Number.isSafeInteger(requestedPage)&&requestedPage>=1&&requestedPage<=10_000?requestedPage:1;
  const pageSize=100;
  const [result,stats]=await Promise.all([listPaymentStatements(actor,view,pageSize+1,(pageNumber-1)*pageSize),paymentStatementOverview(actor)]);
  const rows=result.slice(0,pageSize),hasMore=result.length>pageSize;
  const href=(nextView:StatementView,page=1)=>`/estados-pago?${new URLSearchParams({vista:nextView,pagina:String(page)})}`;
  return <>
    <div className="page-title-row"><div><div className="eyebrow">E Y J · COBRANZA CONTRACTUAL</div><h1>Estados de pago</h1><p className="page-intro">Transporte y disposición por tickets, o arriendo de equipo por período. Valores en CLP o UF según el contrato.</p></div><div className="order-actions"><Link href="/estados-pago/calendario" className="button button-outline">Calendario de cortes y envíos</Link>{actor.role==="admin"&&<Link href="/estados-pago/nuevo" className="button button-primary"><Plus size={17}/> Nuevo EDP</Link>}</div></div>
    <Notice error={query.error} ok={query.ok}/>
    <div className="company-metric-grid"><Link href={href("")} className="company-metric"><span>Estados de pago</span><strong>{stats.total}</strong><small>E y J</small></Link><Link href={href("pendientes")} className="company-metric"><span>Borradores y observados</span><strong>{stats.pending}</strong><small>Por completar o corregir</small></Link><Link href={href("enviados")} className="company-metric"><span>Enviados</span><strong>{stats.sent}</strong><small>Esperan aprobación</small></Link><Link href={href("aprobados")} className="company-metric"><span>Aprobados</span><strong>{stats.approved}</strong><small>Registro administrativo</small></Link></div>
    <form action="/estados-pago" className="filters"><label>Vista<select name="vista" defaultValue={view}>{Object.entries(views).filter(([key])=>billingReady&&orderReady||billingReady&&!(["sin_oc","lista_factura"].includes(key))||!(["sin_oc","lista_factura","sin_factura"].includes(key))).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button type="submit" className="button button-outline">Aplicar</button></form>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">FORMATOS RECIBIDOS</div><h2><ReceiptText size={19}/> {view?views[view]:"Control por cliente y período"}</h2></div></div>
      <p className="helper-text">El monto y el IVA se calculan desde las líneas. El valor UF y su fecha se guardan en cada cobro; no se consulta automáticamente. Un EDP no emite factura tributaria. Los totales consideran todos los registros; la tabla muestra 100 por página.</p>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>EDP / período</th><th>Cliente</th><th>Formato</th><th>Estado</th>{orderReady&&<th>OC del cliente</th>}{billingReady&&<th>Factura</th>}<th></th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><Link className="table-main" href={`/estados-pago/${row.id}`}>N° {row.number}</Link><span className="table-sub">{day(row.period_on)}</span></td><td>{row.client_name}</td><td>{labels[row.statement_type]}</td><td><span className={`edp-status edp-status-${row.status}`}>{row.status}</span></td>{orderReady&&<td>{row.client_order_reference??(row.client_order_exception?"Excepción justificada":["enviado","aprobado"].includes(row.status)?"Pendiente":"—")}</td>}{billingReady&&<td>{row.receivable_invoice_id||row.service_invoice_id?"Vinculada":row.status==="aprobado"?"Por vincular":"—"}</td>}<td><Link className="text-link" href={`/estados-pago/${row.id}`}>Abrir</Link></td></tr>)}</tbody></table>{rows.length===0&&<p className="muted">{view?"Sin estados de pago en esta vista.":"Todavía no hay estados de pago. Cree uno con el formato correspondiente al contrato."}</p>}</div>
      {(pageNumber>1||hasMore)&&<nav className="records-pagination" aria-label="Páginas de estados de pago"><span>{pageNumber>1&&<Link className="button button-outline" href={href(view,pageNumber-1)}>Anterior</Link>}</span><span>Página {pageNumber} · hasta 100 EDP</span><span>{hasMore&&<Link className="button button-outline" href={href(view,pageNumber+1)}>Siguiente</Link>}</span></nav>}
    </section>
  </>;
}
