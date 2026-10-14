import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {Banknote} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {listReceivables,listUnverifiedServiceInvoices,receivablesOverview,todayChile} from "@/lib/receivables";
import {registerExtraReceivablePaymentAction,voidExtraReceivableInvoiceAction} from "@/app/receivable-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {companyName} from "@/lib/companies";
import {filterReceivables,parseReceivableFilter} from "@/lib/receivable-export";

const day=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const money=(value:string|number)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:0});
export default async function Receivables({searchParams}:{searchParams:Promise<{empresa?:string;estado?:string;error?:string;ok?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  const query=await searchParams;
  const company=query.empresa==="e_y_j"?"e_y_j":"rerchar";
  const filter=parseReceivableFilter(query.estado);
  const today=todayChile();
  const [invoices,overview,unverified]=await Promise.all([listReceivables(actor,company),receivablesOverview(actor,company,today),listUnverifiedServiceInvoices(actor,company)]);
  const inSeven=new Date(`${today}T12:00:00Z`);inSeven.setUTCDate(inSeven.getUTCDate()+7);
  const seven=inSeven.toISOString().slice(0,10);
  const visible=filterReceivables(invoices,filter,today);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">ADMINISTRACIÓN · {companyName(company)}</div><h1>Cobranza clientes</h1><p className="page-intro">Facturas externas de servicios, estados de pago, ventas de material y cargos extraordinarios, con saldos y alertas.</p></div><Banknote size={23}/></div>
    <Notice error={query.error} ok={query.ok}/>
    <form action="/cobranzas" method="GET" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label>
      <label>Estado<select name="estado" defaultValue={filter}><option value="pendientes">Con saldo</option><option value="vencidas">Vencidas</option><option value="proximas">Vencen en 7 días</option><option value="pagadas">Pagadas</option><option value="todas">Todas</option></select></label>
      <button type="submit" className="button button-outline">Aplicar</button>
      <Link className="button button-outline" href={`/api/cobranzas/exportar?empresa=${company}&estado=${filter}`}>Descargar vista CSV</Link></form>
    <div className="supply-summary"><div><strong>{overview.overdue}</strong><span>Facturas vencidas con saldo</span></div><div><strong>{overview.upcoming}</strong><span>Vencen en 7 días</span></div><div><strong>${money(overview.outstanding)}</strong><span>Saldo por cobrar</span></div><div><strong>{overview.total}</strong><span>Facturas vigentes</span></div></div>
    {Number(overview.legacy)>0&&<p role="alert" className="notice notice-error">{overview.legacy} factura(s) anteriores requieren confirmar su total o vincular su folio antes de entrar al saldo. Revise <Link href={`/finanzas?empresa=${company}`}>Finanzas</Link> y <Link href={`/cobros-extraordinarios?empresa=${company}`}>Cobros extraordinarios</Link>.</p>}
    {unverified.length>0&&<section className="section-card"><h2>Facturas de servicio por conciliar</h2><ul className="record-list">{unverified.map(invoice=><li key={invoice.service_id}><Link href={`/finanzas/${invoice.service_id}`}>{invoice.invoice_number} · {invoice.client_name} →</Link></li>)}</ul></section>}
    <p className="helper-text">Cada folio se cuenta una vez. El total es el registrado desde la factura emitida externamente; los cargos aprobados sin factura no se incluyen. La vista y su CSV muestran hasta 500 facturas por empresa. No se emiten DTE desde esta pantalla.</p>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">FACTURAS DE CLIENTES</div><h2>Seguimiento de pago</h2></div><span className="count-pill">{visible.length}</span></div>
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
              <label>Monto abonado CLP (máximo ${money(balance)})<input name="amount_clp" type="number" min="0.01" max={balance} step="0.01" required/></label>
              <label>Fecha del pago<input name="paid_on" type="date" min={day(invoice.issued_on)} max={today} defaultValue={today} required/></label>
              <label className="field-full">Referencia del comprobante<input name="reference" minLength={2} maxLength={120} required/></label>
              <div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar abono</SubmitButton></div>
            </form></details>}
            {Number(invoice.paid_clp)===0&&<details className="cancel-control"><summary>Anular factura registrada por error</summary><form action={voidExtraReceivableInvoiceAction} className="form-grid detail-form"><input type="hidden" name="invoice_id" value={invoice.id}/><input type="hidden" name="company" value={company}/><label className="field-full">Motivo<input name="reason" minLength={5} maxLength={500} required/></label><div className="field-full form-footer"><SubmitButton className="button button-outline">Confirmar anulación</SubmitButton></div></form></details>}
          </>}
        </article>;
      })}</div>:<p className="muted">No hay facturas en esta vista. Cambie el estado o registre una factura desde el servicio, el EDP o la guía de material.</p>}
    </section>
  </>;
}
