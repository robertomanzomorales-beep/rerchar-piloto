import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {Banknote} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {listReceivablesPage,listLegacyReconciliation,receivablesOverview,todayChile} from "@/lib/receivables";
import {registerExtraReceivablePaymentAction,voidExtraReceivableInvoiceAction} from "@/app/receivable-actions";
import {invoiceExtraChargeAction} from "@/app/extra-charge-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {companyName} from "@/lib/companies";
import {parseReceivableFilter} from "@/lib/receivable-export";

const day=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const money=(value:string|number)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:0});
export default async function Receivables({searchParams}:{searchParams:Promise<{empresa?:string;estado?:string;pagina?:string;error?:string;ok?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const query=await searchParams;
  const company=query.empresa==="e_y_j"?"e_y_j":"rerchar";
  const reconcile=query.estado==="conciliar";
  const requested=Number(query.pagina),page=Number.isSafeInteger(requested)&&requested>=1&&requested<=10_000?requested:1;
  const filter=parseReceivableFilter(query.estado);
  const today=todayChile();
  const [invoicePage,overview,legacyResult]=await Promise.all([
    reconcile?Promise.resolve({total:0,items:[]}):listReceivablesPage(actor,company,filter,today,101,(page-1)*100),receivablesOverview(actor,company,today),
    reconcile?listLegacyReconciliation(actor,company,101,(page-1)*100):Promise.resolve([]),
  ]);
  const lastPage=Math.max(1,Math.ceil((reconcile?Number(overview.legacy):invoicePage.total)/100));
  if(page>lastPage){
    const params=new URLSearchParams({empresa:company,estado:reconcile?"conciliar":filter,pagina:String(lastPage)});
    if(query.ok==="1")params.set("ok","1");
    if(query.error)params.set("error",query.error);
    redirect(`/cobranzas?${params}`);
  }
  const legacy=legacyResult.slice(0,100),hasMoreLegacy=legacyResult.length>100;
  const legacyHref=(next:number)=>`/cobranzas?${new URLSearchParams({empresa:company,estado:"conciliar",pagina:String(next)})}#conciliacion`;
  const visible=invoicePage.items.slice(0,100),hasMoreInvoices=invoicePage.items.length>100;
  const invoiceHref=(next:number)=>`/cobranzas?${new URLSearchParams({empresa:company,estado:filter,pagina:String(next)})}#facturas-clientes`;
  const inSeven=new Date(`${today}T12:00:00Z`);inSeven.setUTCDate(inSeven.getUTCDate()+7);
  const seven=inSeven.toISOString().slice(0,10);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">ADMINISTRACIÓN · {companyName(company)}</div><h1>Cobranza clientes</h1><p className="page-intro">Facturas externas de servicios, estados de pago, ventas de material y cargos extraordinarios, con saldos y alertas.</p></div><Banknote size={23}/></div>
    <Notice error={query.error} ok={query.ok}/>
    <form action="/cobranzas" method="GET" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label>
      <label>Estado<select name="estado" defaultValue={reconcile?"conciliar":filter}><option value="pendientes">Con saldo</option><option value="vencidas">Vencidas</option><option value="proximas">Vencen en 7 días</option><option value="pagadas">Pagadas</option><option value="todas">Todas</option><option value="conciliar">Facturas anteriores por conciliar</option></select></label>
      <button type="submit" className="button button-outline">Aplicar</button>
      {!reconcile&&<Link className="button button-outline" href={`/api/cobranzas/exportar?empresa=${company}&estado=${filter}`}>Descargar vista CSV</Link>}</form>
    <div className="supply-summary"><div><strong>{overview.overdue}</strong><span>Facturas vencidas con saldo</span></div><div><strong>{overview.upcoming}</strong><span>Vencen en 7 días</span></div><div><strong>${money(overview.outstanding)}</strong><span>Saldo por cobrar</span></div><div><strong>{overview.total}</strong><span>Facturas vigentes</span></div></div>
    {Number(overview.legacy)>0&&!reconcile&&<p role="alert" className="notice notice-error">{overview.legacy} factura(s) anteriores requieren confirmar su total o vincular su folio antes de entrar al saldo. <Link href={legacyHref(1)}>Revisar facturas por conciliar →</Link></p>}
    {reconcile&&<section className="section-card" id="conciliacion"><div className="section-heading"><div><div className="eyebrow">CONTROL DE FACTURAS ANTERIORES</div><h2>Por conciliar</h2></div><span className="count-pill">{overview.legacy}</span></div>
      <p className="helper-text">Confirme el total de la factura de servicio o complete los datos de la factura externa de cada cargo. Se incorporará al saldo sólo después de la conciliación.</p>
      {legacy.length?<div className="record-list">{legacy.map(item=><article className="note-block" key={`${item.source}-${item.id}`}><strong>{item.invoice_number} · {item.client_name}</strong>
        <p>{item.source==="servicio"?"Factura de servicio · Falta confirmar el total real":"Cargo extraordinario · Falta vincular el folio y el total"} · Emisión {day(item.issued_on)}</p>
        {item.source==="servicio"?<Link href={`/finanzas/${item.service_id}`}>Confirmar total en la ficha de servicio →</Link>
          :<form action={invoiceExtraChargeAction} className="form-grid detail-form"><input type="hidden" name="id" value={item.id}/><input type="hidden" name="company" value={company}/>
            <p className="field-full helper-text">{item.reason} · Parte del {day(item.service_day!)}</p>
            <label>Folio de factura<input name="invoice_number" defaultValue={item.invoice_number} minLength={2} maxLength={80} required/></label>
            <label>Fecha de emisión<input name="invoiced_on" type="date" defaultValue={day(item.issued_on)} min={day(item.service_day!)} max={today} required/></label>
            <label>Vencimiento<input name="due_on" type="date" min={day(item.issued_on)} required/></label>
            <label>Total facturado CLP<input name="total_clp" type="number" min="0.01" step="0.01" required/></label>
            <p className="field-full helper-text">Verifique folio, vencimiento y total contra la factura emitida externamente.</p>
            <div className="field-full form-footer"><SubmitButton className="button button-outline">Conciliar factura externa</SubmitButton></div>
          </form>}</article>)}</div>:<p className="muted">No hay facturas anteriores por conciliar en esta empresa.</p>}
      {(page>1||hasMoreLegacy)&&<nav className="records-pagination" aria-label="Páginas de facturas por conciliar"><span>{page>1&&<Link className="button button-outline" href={legacyHref(page-1)}>Anterior</Link>}</span><span>Página {page} · {overview.legacy} pendientes</span><span>{hasMoreLegacy&&<Link className="button button-outline" href={legacyHref(page+1)}>Siguiente</Link>}</span></nav>}
    </section>}
    <p className="helper-text">Cada folio se cuenta una vez. El total es el registrado desde la factura emitida externamente; los cargos aprobados sin factura no se incluyen. {reconcile?"La cola de conciliación muestra hasta 100 facturas por página.":"La vista muestra 100 facturas por página y el CSV exporta todas las del filtro."} No se emiten DTE desde esta pantalla.</p>
    {!reconcile&&<section className="section-card" id="facturas-clientes"><div className="section-heading"><div><div className="eyebrow">FACTURAS DE CLIENTES</div><h2>Seguimiento de pago</h2></div><span className="count-pill">{invoicePage.total}</span></div>
      {visible.length?<div className="record-list">{visible.map(invoice=>{
        const balance=Number(invoice.total_clp)-Number(invoice.paid_clp),due=day(invoice.due_on);
        return <article key={`${invoice.source}-${invoice.id}`} className="note-block">
          <strong>{invoice.invoice_number} · {invoice.client_name} · {balance<=0?"Pagada":due<today?"Vencida":due<=seven?"Vence pronto":"Pendiente"}</strong>
          <p>{invoice.source==="servicio"?"Factura de servicio":invoice.source==="edp"?"Factura asociada a EDP":invoice.source==="material"?"Factura de venta de material":"Factura de cobro extraordinario"} · Emisión {day(invoice.issued_on)} · Vencimiento {due}{Number(invoice.edp_count)>0?` · ${invoice.edp_count} EDP vinculado(s)`:""}{Number(invoice.extra_count)>0?` · ${invoice.extra_count} cargo(s) asociados`:""}{Number(invoice.guide_count)>0?` · ${invoice.guide_count} guía(s) vinculada(s)`:""}</p>
          <p>Total <strong>${money(invoice.total_clp)}</strong> · Abonado ${money(invoice.paid_clp)} · Saldo <strong>${money(balance)}</strong></p>
          {invoice.statement_id&&<Link href={`/estados-pago/${invoice.statement_id}`}>Ver EDP asociado →</Link>}
          {invoice.guide_id&&<Link href={`/control-guias/${invoice.guide_id}`}>Ver guía de material →</Link>}
          {invoice.source==="servicio"?<Link href={`/finanzas/${invoice.service_id}`}>Ver factura y registrar abono →</Link>:<>
            {invoice.service_id&&<Link href={`/solicitudes/${invoice.service_id}`}>Ver servicio asociado →</Link>}
            {balance>0&&<details className="reference-control"><summary>Registrar abono comprobado</summary><form action={registerExtraReceivablePaymentAction} className="form-grid detail-form">
              <input type="hidden" name="invoice_id" value={invoice.id}/><input type="hidden" name="company" value={company}/><input type="hidden" name="submission_key" value={randomUUID()}/>
              <input type="hidden" name="estado" value={filter}/><input type="hidden" name="pagina" value={page}/>
              <label>Monto abonado CLP (máximo ${money(balance)})<input name="amount_clp" type="number" min="0.01" max={balance} step="0.01" required/></label>
              <label>Fecha del pago<input name="paid_on" type="date" min={day(invoice.issued_on)} max={today} defaultValue={today} required/></label>
              <label className="field-full">Referencia del comprobante<input name="reference" minLength={2} maxLength={120} required/></label>
              <div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar abono</SubmitButton></div>
            </form></details>}
            {Number(invoice.paid_clp)===0&&<details className="cancel-control"><summary>Anular factura registrada por error</summary><form action={voidExtraReceivableInvoiceAction} className="form-grid detail-form"><input type="hidden" name="invoice_id" value={invoice.id}/><input type="hidden" name="company" value={company}/><input type="hidden" name="estado" value={filter}/><input type="hidden" name="pagina" value={page}/><label className="field-full">Motivo<input name="reason" minLength={5} maxLength={500} required/></label><div className="field-full form-footer"><SubmitButton className="button button-outline">Confirmar anulación</SubmitButton></div></form></details>}
          </>}
        </article>;
      })}</div>:<p className="muted">No hay facturas en esta vista. Cambie el estado o registre una factura desde el servicio, el EDP o la guía de material.</p>}
      {(page>1||hasMoreInvoices)&&<nav className="records-pagination" aria-label="Páginas de facturas de clientes"><span>{page>1&&<Link className="button button-outline" href={invoiceHref(page-1)}>Anterior</Link>}</span><span>Página {page} · {invoicePage.total} facturas en esta vista</span><span>{hasMoreInvoices&&<Link className="button button-outline" href={invoiceHref(page+1)}>Siguiente</Link>}</span></nav>}
    </section>}
  </>;
}
