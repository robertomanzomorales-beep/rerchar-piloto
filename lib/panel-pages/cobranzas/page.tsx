import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {Banknote} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {getReceivableInvoice,getReconciliationCharge,listReceivablesPage,listLegacyReconciliation,receivablesOverview,todayChile,type Receivable} from "@/lib/receivables";
import {receivableAnchor,receivableContext,receivableFields,receivableHref,type ReceivableContext,type ReceivableFormKind} from "@/lib/receivable-form-state";
import {isFinanceId,financeDay as day} from "@/lib/finance-catalog-state";
import {financialBalance,financialMoney as money} from "@/lib/financial-detail-state";
import {recordPage} from "@/lib/record-pagination";
import {ReceivableForm} from "@/components/ReceivableForm";
import {Notice,chileCalendarDate} from "@/components/UI";
import {companyName,type Company} from "@/lib/companies";
import {parseReceivableFilter} from "@/lib/receivable-export";

type Query=ReceivableContext&{error?:string;ok?:string;formulario?:string;origen?:string;registro?:string};
export default async function Receivables({searchParams}:{searchParams:Promise<Query>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const query=await searchParams,context=receivableContext(query),company=context.empresa as Company,reconcile=context.estado==="conciliar",page=recordPage(context.pagina),filter=parseReceivableFilter(context.estado),today=todayChile();
  const requestedKind=query.formulario??query.origen,kind=requestedKind&&Object.hasOwn(receivableFields,requestedKind)?requestedKind as ReceivableFormKind:undefined,id=isFinanceId(query.registro)?query.registro:undefined;
  const [invoicePage,overview,legacyResult,selectedInvoice,selectedCharge]=await Promise.all([
    reconcile?Promise.resolve({total:0,items:[]}):listReceivablesPage(actor,company,filter,today,101,(page-1)*100),receivablesOverview(actor,company,today),
    reconcile?listLegacyReconciliation(actor,company,101,(page-1)*100):Promise.resolve([]),
    id&&(kind==="payment"||kind==="void")?getReceivableInvoice(actor,company,id):undefined,
    id&&kind==="reconcile"?getReconciliationCharge(actor,company,id):undefined,
  ]);
  const lastPage=Math.max(1,Math.ceil((reconcile?Number(overview.legacy):invoicePage.total)/100));
  if(page>lastPage&&!query.formulario)redirect(receivableHref({...context,pagina:String(lastPage)},reconcile?"conciliacion":"facturas-clientes",query));
  const legacy=legacyResult.slice(0,100),extraCharge=selectedCharge&&!legacy.some(x=>x.id===selectedCharge.id)?selectedCharge:undefined;
  if(extraCharge)legacy.unshift(extraCharge);
  const visible=invoicePage.items.slice(0,100),extraInvoice=selectedInvoice&&!visible.some(x=>x.id===selectedInvoice.id)?selectedInvoice:undefined;
  if(extraInvoice)visible.unshift(extraInvoice);
  const legacyHref=(next:number)=>receivableHref({...context,estado:"conciliar",pagina:String(next)},"conciliacion"),invoiceHref=(next:number)=>receivableHref({...context,estado:filter,pagina:String(next)},"facturas-clientes");
  const inSeven=new Date(`${today}T12:00:00Z`);inSeven.setUTCDate(inSeven.getUTCDate()+7);const seven=inSeven.toISOString().slice(0,10);
  const invoiceCard=(invoice:Receivable)=>{
    const balance=financialBalance(invoice.total_clp,invoice.paid_clp),due=day(invoice.due_on),active=invoice.status!=="anulada",status=!active?"Anulada":balance<=0?"Pagada":due<today?"Vencida":due<=seven?"Vence pronto":"Pendiente",isSelected=invoice.id===id;
    const source=invoice.source==="servicio"?"Factura de servicio":invoice.source==="edp"?"Factura asociada a EDP":invoice.source==="material"?"Factura de venta de material":"Factura de cobro extraordinario";
    return <article key={`${invoice.source}-${invoice.id}`} id={receivableAnchor("payment",invoice.id)} className="receivable-entry finance-section" data-receivable-invoice={invoice.id} data-receivable-status={status}><div className="finance-record-top"><div><strong>{invoice.invoice_number}</strong><p className="receivable-client">{invoice.client_name}</p></div><span className={`badge receivable-${status.toLowerCase().replaceAll(" ","-")}`}>{status}</span></div>
      <p className="helper-text">{active?source:"Factura anulada"} · Emitida {chileCalendarDate(invoice.issued_on)} · Vence {chileCalendarDate(invoice.due_on)}{Number(invoice.edp_count)>0?` · ${invoice.edp_count} EDP vinculado(s)`:""}{Number(invoice.extra_count)>0?` · ${invoice.extra_count} cargo(s) asociados`:""}{Number(invoice.guide_count)>0?` · ${invoice.guide_count} guía(s) vinculada(s)`:""}</p>
      <div className="receivable-amounts"><div><span>Total registrado</span><strong>${money(invoice.total_clp)}</strong></div><div><span>Abonado</span><strong>${money(invoice.paid_clp)}</strong></div><div><span>Saldo</span><strong>{active?`$${money(balance)}`:"No vigente"}</strong></div></div>
      {extraInvoice?.id===invoice.id&&<p className="helper-text">Factura seleccionada fuera del filtro o página actual.</p>}
      <div className="receivable-document-links">{invoice.statement_id&&<Link href={`/estados-pago/${invoice.statement_id}`}>Ver EDP asociado</Link>}{invoice.guide_id&&<Link href={`/control-guias/${invoice.guide_id}`}>Ver guía de material</Link>}{invoice.source==="servicio"?<Link href={`/finanzas/${invoice.service_id}`}>Ver factura y registrar abono</Link>:invoice.service_id&&<Link href={`/solicitudes/${invoice.service_id}`}>Ver servicio asociado</Link>}</div>
      {invoice.source!=="servicio"&&<>
        {(active&&balance>0||query.formulario==="payment"&&isSelected)&&<details className="finance-record-control" open={query.formulario==="payment"&&isSelected}><summary>Registrar abono comprobado</summary><ReceivableForm key={`payment:${invoice.id}:${invoice.paid_clp}:${invoice.status}`} kind="payment" sourceId={invoice.id} context={context} today={today} nonce={randomUUID()} minimum={day(invoice.issued_on)} remaining={String(balance)} disabled={!active||balance<=0}/></details>}
        {(active&&Number(invoice.paid_clp)===0||query.formulario==="void"&&isSelected)&&<details className="finance-record-control" open={query.formulario==="void"&&isSelected}><summary>Anular factura registrada por error</summary><ReceivableForm key={`void:${invoice.id}:${invoice.paid_clp}:${invoice.status}`} kind="void" sourceId={invoice.id} context={context} today={today} disabled={!active||Number(invoice.paid_clp)!==0}/></details>}
      </>}
    </article>;
  };
  return <div className="receivables-page">
    <div className="page-title-row"><div><div className="eyebrow">ADMINISTRACIÓN · {companyName(company)}</div><h1>Cobranza clientes</h1><p className="page-intro">Facturas de servicios, estados de pago, ventas de material y cargos extraordinarios, con saldos y vencimientos.</p></div><span className="title-icon"><Banknote size={23}/></span></div>
    <Notice error={query.error} ok={query.formulario?undefined:query.ok}/>
    <form key={`${company}:${context.estado}`} action="/cobranzas" method="GET" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><label>Estado<select name="estado" defaultValue={context.estado}><option value="pendientes">Con saldo</option><option value="vencidas">Vencidas</option><option value="proximas">Vencen en 7 días</option><option value="pagadas">Pagadas</option><option value="todas">Todas</option><option value="conciliar">Facturas anteriores por conciliar</option></select></label><button type="submit" className="button button-outline">Aplicar filtros</button>{!reconcile&&<Link className="button button-outline" href={`/api/cobranzas/exportar?empresa=${company}&estado=${filter}`}>Descargar vista CSV</Link>}</form>
    <div className="supply-summary"><div><strong>{overview.overdue}</strong><span>Facturas vencidas con saldo</span></div><div><strong>{overview.upcoming}</strong><span>Vencen en 7 días</span></div><div><strong>${money(overview.outstanding)}</strong><span>Saldo por cobrar de la empresa</span></div><div><strong>{overview.total}</strong><span>Facturas vigentes de la empresa</span></div></div>
    {Number(overview.legacy)>0&&!reconcile&&<p role="status" className="notice notice-error">{overview.legacy} factura(s) anteriores requieren conciliación antes de incorporarse al saldo. <Link href={legacyHref(1)}>Revisar pendientes</Link></p>}
    {page>lastPage&&<p role="status" className="helper-text">Esta página ya no tiene otros registros. Se conserva la selección para completar la revisión. <Link href={reconcile?legacyHref(lastPage):invoiceHref(lastPage)}>Ver última página disponible</Link>.</p>}
    {reconcile&&<section id="conciliacion" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">CONTROL DE FACTURAS ANTERIORES</div><h2>Por conciliar</h2></div><span className="count-pill">{overview.legacy}</span></div><p className="helper-text">Confirme el total de la factura de servicio o complete los datos del documento externo de cada cargo.</p>
      {legacy.length?<div className="receivable-records">{legacy.map(item=>{
        const current=selectedCharge?.id===item.id?selectedCharge:undefined,resolved=!!current&&(!!current.receivable_invoice_id||!!current.linked_service_invoice_id),canReconcile=item.source==="cargo"&&(!current||current.status==="facturado"&&!resolved);
        return <article key={`${item.source}-${item.id}`} id={receivableAnchor("reconcile",item.id)} className="receivable-entry finance-section" data-reconciliation-record={item.id}><div className="finance-record-top"><div><strong>{item.invoice_number}</strong><p className="receivable-client">{item.client_name}</p></div>{resolved&&<span className="badge receivable-pagada">Factura conciliada</span>}</div><p className="helper-text">{item.source==="servicio"?"Factura de servicio · Falta confirmar el total real":resolved?"Cargo extraordinario · Factura conciliada":"Cargo extraordinario · Revisar folio y total"} · Emisión {chileCalendarDate(item.issued_on)}</p>{extraCharge?.id===item.id&&<p className="helper-text">Registro seleccionado fuera de la cola o página actual.</p>}
          {item.source==="servicio"?<Link href={`/finanzas/${item.service_id}#conciliar-factura`}>Confirmar total en la ficha de servicio</Link>:<><p className="helper-text">{item.reason} · Parte del {chileCalendarDate(item.service_day)}</p>{(canReconcile||query.formulario==="reconcile"&&item.id===id)&&<ReceivableForm key={`reconcile:${item.id}:${current?.receivable_invoice_id}:${current?.linked_service_invoice_id}:${current?.status}`} kind="reconcile" sourceId={item.id} context={context} today={today} minimum={item.service_day?day(item.service_day):undefined} defaults={{invoice_number:item.invoice_number,invoiced_on:day(item.issued_on)}} disabled={!canReconcile}/>}{resolved&&<Link href={current?.receivable_invoice_id?receivableHref({empresa:company,estado:"todas"},receivableAnchor("payment",current.receivable_invoice_id),{origen:"payment",registro:current.receivable_invoice_id}):receivableHref({empresa:company,estado:"todas"})}>Revisar factura en Cobranzas</Link>}</>}
        </article>;
      })}</div>:<p className="muted">No hay facturas anteriores por conciliar en esta empresa.</p>}
      {(page>1||legacyResult.length>100)&&<nav className="records-pagination" aria-label="Páginas de facturas por conciliar"><span>{page>1&&<Link className="button button-outline" href={legacyHref(Math.min(page-1,lastPage))}>Anterior</Link>}</span><span>Página {page} · {overview.legacy} pendientes</span><span>{legacyResult.length>100&&<Link className="button button-outline" href={legacyHref(page+1)}>Siguiente</Link>}</span></nav>}
    </section>}
    <p className="helper-text">Cada factura se cuenta una vez. Los importes incluyen lo registrado desde el documento externo; los cargos aprobados sin factura quedan fuera del saldo. La vista muestra 100 registros por página y el CSV incluye todas las facturas del filtro.</p>
    {(!reconcile||reconcile&&selectedInvoice)&&<section id="facturas-clientes" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">FACTURAS DE CLIENTES</div><h2>Seguimiento de pago</h2></div><span className="count-pill">{invoicePage.total}</span></div>{visible.length?<div className="receivable-records">{visible.map(invoiceCard)}</div>:<p className="muted">No hay facturas en esta vista. Cambie el estado o registre el documento desde el servicio, el EDP o la guía de material.</p>}{(page>1||invoicePage.items.length>100)&&<nav className="records-pagination" aria-label="Páginas de facturas de clientes"><span>{page>1&&<Link className="button button-outline" href={invoiceHref(Math.min(page-1,lastPage))}>Anterior</Link>}</span><span>Página {page} · {invoicePage.total} facturas en esta vista</span><span>{invoicePage.items.length>100&&<Link className="button button-outline" href={invoiceHref(page+1)}>Siguiente</Link>}</span></nav>}</section>}
  </div>;
}
