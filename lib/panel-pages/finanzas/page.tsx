import {createHash} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {Banknote,FileText,ArrowRight,ReceiptText} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {listFinance} from "@/lib/finance";
import {companyName,serviceFolio} from "@/lib/companies";
import {financeCatalogAnchor,financeCatalogContext,financeCatalogFields,financeCatalogHref,financeDay as day,isFinanceId,type FinanceCatalogContext,type FinanceCatalogKind,type FinancePageKey} from "@/lib/finance-catalog-state";
import {lastRecordPage,recordPage,recordsPerPage} from "@/lib/record-pagination";
import {Notice,chileCalendarDate} from "@/components/UI";
import {FinanceTariffs,FinanceTariffNotices} from "@/components/FinanceTariffs";
import {FinanceCatalogForm} from "@/components/FinanceCatalogForms";
import CompanyScope from "@/components/CompanyScope";

const money=(value:number|string)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:2});
const signature=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0,16);
type FinanceQuery=FinanceCatalogContext&{error?:string;ok?:string;formulario?:string;origen?:string;edicion?:string};
export default async function Finance({searchParams}:{searchParams:Promise<FinanceQuery>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const query=await searchParams,context=financeCatalogContext(query),company=context.empresa!;
  const clientOcOnly=context.oc==="pendiente",pendingOnly=context.facturacion==="pendiente";
  const pageNumber=recordPage(context.pagina),noticePage=recordPage(context.pagina_avisos),noticeFilter=context.avisos==="pendientes"?"pendiente":"";
  const sourceKind=query.formulario??query.origen,kind=sourceKind&&Object.hasOwn(financeCatalogFields,sourceKind)?sourceKind as FinanceCatalogKind:undefined;
  const sourceId=isFinanceId(query.edicion)?query.edicion:undefined;
  const {services,edpInvoices,hasMoreServices,contracts,tariffs,clients,sites,notices,hasMoreNotices,pendingNoticeCount,focusedContract,focusedTariff,focusedNotice}=await listFinance(actor,company,clientOcOnly,pendingOnly,pageNumber,noticeFilter,noticePage,{kind,id:sourceId});
  const contractPage=Math.min(recordPage(context.pagina_contratos),lastRecordPage(contracts.length)),tariffPage=Math.min(recordPage(context.pagina_tarifas),lastRecordPage(tariffs.length));
  if(contractPage!==recordPage(context.pagina_contratos)||tariffPage!==recordPage(context.pagina_tarifas))redirect(financeCatalogHref({...context,pagina_contratos:String(contractPage),pagina_tarifas:String(tariffPage)},kind?financeCatalogAnchor(kind,sourceId):"",query));
  const contractRows=contracts.slice((contractPage-1)*recordsPerPage,contractPage*recordsPerPage),tariffRows=tariffs.slice((tariffPage-1)*recordsPerPage,tariffPage*recordsPerPage);
  const extraContract=focusedContract&&!contractRows.some(c=>c.id===focusedContract.id)?focusedContract:undefined;
  const extraTariff=focusedTariff&&!tariffRows.some(t=>t.id===focusedTariff.id)?focusedTariff:undefined;
  const extraNotice=focusedNotice&&!notices.some(n=>n.id===focusedNotice.id)?focusedNotice:undefined;
  const shownContracts=extraContract?[extraContract,...contractRows]:contractRows;
  const visibleServices=services,edpByService=new Map<string,typeof edpInvoices>();
  for(const invoice of edpInvoices){const group=edpByService.get(invoice.service_id)??[];group.push(invoice);edpByService.set(invoice.service_id,group);}
  const pageHref=(page:number)=>financeCatalogHref({...context,pagina:String(page)},"servicios-finanzas");
  const noticeHref=(filter:""|"pendiente",page=1)=>financeCatalogHref({...context,avisos:filter?"pendientes":"",pagina_avisos:String(page)},"avisos-tarifa");
  const catalogPager=(key:FinancePageKey,page:number,total:number,anchor:string,label:string)=>total>recordsPerPage?<nav className="records-pagination" aria-label={`Páginas de ${label}`}><span>{page>1&&<Link className="button button-outline" href={financeCatalogHref({...context,[key]:String(page-1)},anchor)}>Anterior</Link>}</span><span>Página {page} de {lastRecordPage(total)} · {total} {label}</span><span>{page<lastRecordPage(total)&&<Link className="button button-outline" href={financeCatalogHref({...context,[key]:String(page+1)},anchor)}>Siguiente</Link>}</span></nav>:null;
  const valued=services.filter(s=>s.valuation_id),invoiced=services.filter(s=>s.invoice_id&&s.invoice_status==="emitida");
  const servicesWithInvoice=services.filter(s=>s.invoice_id&&s.invoice_status==="emitida"||edpByService.get(s.id)?.some(edp=>edp.invoice_number));
  const balance=invoiced.filter(s=>s.invoice_total_verified).reduce((sum,s)=>sum+Number(s.invoice_total)-Number(s.paid_clp),0);
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const contractChoices=contracts.map(c=>({...c,starts_on:day(c.starts_on),ends_on:c.ends_on?day(c.ends_on):null}));
  return <div className="finance-page"><CompanyScope company={company==="rerchar"||company==="e_y_j"?company:undefined}/>
    <div className="page-title-row"><div><div className="eyebrow">CONTROL ADMINISTRATIVO</div><h1>Contratos y finanzas</h1><p className="page-intro">Condiciones comerciales, tarifas y seguimiento administrativo de los servicios.</p></div><span className="title-icon"><Banknote size={23}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <form key={`${company}:${pendingOnly}:${clientOcOnly}`} action="/finanzas" method="GET" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option><option value="pendiente">Registros por clasificar</option></select></label><label>Factura individual<select name="facturacion" defaultValue={pendingOnly?"pendiente":""}><option value="">Todos</option><option value="pendiente">Valorizados sin factura</option></select></label><label>OC del cliente<select name="oc" defaultValue={clientOcOnly?"pendiente":""}><option value="">Todos</option><option value="pendiente">Requerida y pendiente</option></select></label><button className="button button-outline" type="submit">Aplicar filtros</button></form>
    {clientOcOnly&&<p role="status" className="notice notice-error">Estos clientes tienen marcada la OC como requisito en su ficha. Revise cada servicio antes de asociar una factura; las excepciones se deben acordar con administración.</p>}
    <nav className="client-section-links" aria-label="Secciones de contratos y finanzas"><a href="#servicios-finanzas">Servicios</a><a href="#registrar-contrato">Registrar contrato</a><a href="#nueva-tarifa">Nueva tarifa</a><a href="#historial-contratos">Contratos <span>{contracts.length}</span></a><a href="#historial-tarifas">Tarifas <span>{tariffs.length}</span></a><a href="#avisos-tarifa">Avisos <span>{pendingNoticeCount} pendientes</span></a></nav>
    <div className="supply-summary"><div><strong>{services.length}</strong><span>Servicios cerrados visibles</span></div><div><strong>{valued.length}</strong><span>Valorizados visibles</span></div><div><strong>{servicesWithInvoice.length}</strong><span>Servicios con factura visible</span></div><div><strong>${money(balance)}</strong><span>Saldo de facturas individuales visibles</span></div></div>
    <section id="servicios-finanzas" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">SERVICIOS CERRADOS</div><h2><ReceiptText size={19}/> Estado administrativo y facturas emitidas</h2></div><span className="count-pill">{visibleServices.length}</span></div><p className="helper-text">Abra un servicio para registrar la factura emitida externamente y adjuntar el documento en su ficha. Si el contrato se factura mensualmente mediante EDP, consolide y facture desde <Link href={company==="pendiente"?"/estados-pago":`/estados-pago?empresa=${company}`}>Estados de pago</Link> para evitar duplicar saldos. {company==="pendiente"?<>Seleccione una empresa en el <Link href="/">Panel de empresas</Link> para consultar sus saldos.</>:<>Consulte los saldos consolidados en <Link href={`/cobranzas?empresa=${company}`}>Cobranzas</Link>.</>} El sistema no emite documentos tributarios.</p>
      {visibleServices.length?<div className="table-wrap" role="region" aria-label="Estado administrativo de servicios" tabIndex={0}><table className="data-table"><thead><tr><th>Servicio / empresa</th><th>OC del cliente</th><th>Valorización</th><th>Factura</th><th>Cobrado / saldo</th><th>Margen estimado</th></tr></thead><tbody>{visibleServices.map((s)=>{
        const edps=edpByService.get(s.id)??[];
        return <tr key={s.id}>
          <td><Link className="table-main" href={`/finanzas/${s.id}`}>{serviceFolio(s)}</Link><span className="table-sub">{companyName(s.operating_company)} · {s.client_name} · {s.site_name}</span></td>
          <td>{s.client_oc_reference??(s.in_payment_statement?"Gestionar en EDP":s.requires_client_oc?"Requerida · pendiente":"No exigida en ficha")}</td>
          <td>{s.total_clp!==null?`$${money(s.total_clp)}`:"Pendiente"}</td>
          <td>{s.invoice_number&&<strong>{s.invoice_number}</strong>}{edps.map(edp=><span className="table-sub" key={edp.statement_id}>{edp.invoice_number??"Sin factura"} · <Link href={`/estados-pago/${edp.statement_id}`}>EDP {edp.statement_number} →</Link></span>)}{!s.invoice_number&&!edps.length&&"Sin factura"}</td>
          <td>{s.invoice_total_verified&&s.invoice_total!==null?`$${money(s.paid_clp)} / $${money(Number(s.invoice_total)-Number(s.paid_clp))}`:s.invoice_id?"Por confirmar total":edps.some(edp=>edp.invoice_number)?"Saldo consolidado en EDP":"—"}</td>
          <td>{s.total_clp!==null?`$${money(Number(s.total_clp)-Number(s.manual_cost_clp)-Number(s.fuel_cost_clp))}`:"—"}</td>
        </tr>;
      })}</tbody></table></div>:<p className="muted">{clientOcOnly?"No hay servicios cerrados con OC exigida y pendiente en esta empresa.":pendingOnly?"No hay servicios valorizados pendientes de factura individual con estos filtros.":"Al cerrar un servicio aparecerá aquí para su valorización."}</p>}
      {(pageNumber>1||hasMoreServices)&&<nav className="records-pagination" aria-label="Páginas de servicios"><span>{pageNumber>1&&<Link className="button button-outline" href={pageHref(pageNumber-1)}>← Anterior</Link>}</span><span>Página {pageNumber} · hasta 100 servicios</span><span>{hasMoreServices&&<Link className="button button-outline" href={pageHref(pageNumber+1)}>Siguiente →</Link>}</span></nav>}
    </section>
    <div className="supply-columns finance-catalog-layout">
      <section id="registrar-contrato" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">CONDICIONES COMERCIALES</div><h2><FileText size={19}/> Registrar contrato</h2></div></div><p className="helper-text">Defina la empresa, el cliente y la vigencia del acuerdo. Puede asociarlo a una faena o a todas las del cliente.</p><FinanceCatalogForm key={`contract:${company}:${signature([clients,sites,contracts.map(c=>c.id)])}`} kind="contract" context={context} today={today} clients={clients} sites={sites}/></section>
      <section id="nueva-tarifa" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">TARIFARIO</div><h2><Banknote size={19}/> Nueva tarifa</h2></div></div><p className="helper-text">Asocie el precio a un contrato. El tipo de servicio determina las unidades disponibles para valorizarlo.</p><FinanceCatalogForm key={`tariff:${company}:${signature([contractChoices,tariffs.map(t=>t.id)])}`} kind="tariff" context={context} today={today} contracts={contractChoices}/></section>
    </div>
    <div className="supply-columns finance-catalog-layout">
      <section id="historial-contratos" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">ACUERDOS REGISTRADOS</div><h2>Historial de contratos</h2></div><span className="count-pill">{contracts.length}</span></div>
        {shownContracts.length?<ul className="record-list finance-catalog-records">{shownContracts.map(c=>{
          const status=!c.active?"Inactivo":!c.operating_company?"Por clasificar":!c.available?"No disponible":day(c.starts_on)>today?"Programado":c.ends_on&&day(c.ends_on)<today?"Finalizado":"Vigente";
          return <li key={c.id} id={financeCatalogAnchor("contract",c.id)} className="finance-section" data-finance-contract={c.id}><div className="finance-record-top"><strong>{c.code}</strong><span className={`badge finance-period-${status.toLowerCase().replaceAll(" ","-")}`}>{status}</span></div><div className="finance-record-detail"><span>{companyName(c.operating_company)} · {c.client_name}</span><small>{c.site_name??"Todas las faenas del cliente"}</small><small>{chileCalendarDate(c.starts_on)}{c.ends_on?` al ${chileCalendarDate(c.ends_on)}`:" en adelante"}</small></div>
            {extraContract?.id===c.id&&<p className="helper-text">Contrato seleccionado fuera de esta vista o página.</p>}
            {c.notes&&<details className="finance-contract-notes"><summary>Condiciones y observaciones</summary><p>{c.notes}</p></details>}
            {(!c.operating_company||query.formulario==="classify"&&sourceId===c.id)&&<details className="finance-record-control" open={!c.operating_company||query.formulario==="classify"&&sourceId===c.id}><summary>Confirmar empresa del contrato</summary><FinanceCatalogForm key={`${c.id}:${c.operating_company}`} kind="classify" context={context} today={today} sourceId={c.id} defaults={{operating_company:c.operating_company??""}} disabled={!!c.operating_company}/></details>}
          </li>;
        })}</ul>:<p className="muted">No hay contratos registrados en esta empresa.</p>}
        {catalogPager("pagina_contratos",contractPage,contracts.length,"historial-contratos","contratos")}
      </section>
      <section id="historial-tarifas" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">PRECIOS Y VIGENCIAS</div><h2>Historial de tarifas</h2></div><span className="count-pill">{tariffs.length}</span></div><FinanceTariffs tariffs={extraTariff?[extraTariff,...tariffRows]:tariffRows} context={context} today={today} openId={query.formulario==="revise"?sourceId:undefined} extraId={extraTariff?.id}/>{catalogPager("pagina_tarifas",tariffPage,tariffs.length,"historial-tarifas","tarifas")}</section>
    </div>
    <FinanceTariffNotices notices={extraNotice?[extraNotice,...notices]:notices} context={context} today={today} pendingCount={pendingNoticeCount} pendingOnly={noticeFilter==="pendiente"} allHref={noticeHref("")} pendingHref={noticeHref("pendiente")} openId={query.formulario==="notice"?sourceId:undefined} extraId={extraNotice?.id}/>
    {(noticePage>1||hasMoreNotices)&&<nav className="records-pagination" aria-label="Páginas de avisos de tarifa"><span>{noticePage>1&&<Link className="button button-outline" href={noticeHref(noticeFilter,noticePage-1)}>Anterior</Link>}</span><span>Página {noticePage} · hasta 100 avisos</span><span>{hasMoreNotices&&<Link className="button button-outline" href={noticeHref(noticeFilter,noticePage+1)}>Siguiente</Link>}</span></nav>}
    <Link className="back-link" href={company==="pendiente"?"/reportes":`/reportes?empresa=${company}`}>Ir a reportes <ArrowRight size={15}/></Link>
  </div>;
}
