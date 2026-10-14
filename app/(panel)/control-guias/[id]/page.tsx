import Link from "next/link";
import {notFound} from "next/navigation";
import {ArrowLeft,Weight,AlertTriangle} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {getMaterialGuide,materialGuideTotals,MaterialGuideError} from "@/lib/material-guides";
import {listMaterialCatalog,guideStockPostings} from "@/lib/material-stock";
import {GuideHeaderFields,GuideItemFields} from "@/components/MaterialGuideForms";
import {saveMaterialGuideItemAction,updateMaterialGuideAction} from "@/app/material-guide-actions";
import {linkMaterialSaleInvoiceAction} from "@/app/material-guide-actions";
import {getMaterialSaleInvoices} from "@/lib/material-sale-billing";
import {SubmitButton} from "@/components/Transition";
import {Notice} from "@/components/UI";
import PrintButton from "@/components/PrintButton";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

const kg=(v:number|string|null)=>v==null?"Pendiente":`${Number(v).toLocaleString("es-CL",{maximumFractionDigits:2})} kg`;
const money=(v:number|string|null)=>v==null?"Pendiente":`$${Number(v).toLocaleString("es-CL",{maximumFractionDigits:2})}`;
const day=(v:Date|string)=>new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeZone:"UTC"}).format(new Date(v));
const iso=(v:Date|string)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const company="RERCHAR CHILE SPA";

export default async function MaterialGuideDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string;editar?:string}>}){
  const actor=await requireActor(),{id}=await params;
  if(!await moduleReady("guias"))return <ModuleUnavailable title="Control de guías" company="rerchar"/>;
  let detail;
  try{detail=await getMaterialGuide(actor,id);}catch(error){if(error instanceof MaterialGuideError)notFound();throw error;}
  const billingReady=await moduleReady("material_sale_billing");
  const [clients,catalog,postings,query,invoices]=await Promise.all([db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name"),
    listMaterialCatalog(actor),guideStockPostings(actor,id),searchParams,
    billingReady&&actor.role==="admin"?getMaterialSaleInvoices(actor,id):Promise.resolve([])]);
  const {guide,items}=detail,editing=items.find(i=>i.id===query.editar);
  const invoicesByItem=new Map(invoices.map(invoice=>[invoice.item_id,invoice]));
  const posted=new Map(postings.map(p=>[p.guide_item_id,Number(p.posted_kg)]));
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const mismatch=!!guide.freight_guide_reference&&guide.freight_guide_reference.trim()!==guide.guide_number.trim();
  return <>
    <div className="order-actions print-hide"><Link href="/control-guias" className="back-link"><ArrowLeft size={16}/> Todas las guías</Link><PrintButton label="Imprimir control / guardar PDF"/></div>
    <div className="print-hide"><Notice error={query.error} ok={query.ok}/></div>
    <article className="order-sheet"><header className="order-header"><div><div className="order-system">{company}</div><h1>Control de guía · {guide.movement_type}</h1></div><div className="order-number"><small>N° GUÍA</small><h1>{guide.guide_number}</h1></div></header>
      <div className="order-section"><div className="order-grid"><div><small>Fecha / detalle</small><strong>{day(guide.movement_on)} · {guide.movement_detail||guide.movement_type}</strong></div><div><small>Contraparte</small><strong>{guide.counterparty_name}</strong></div><div><small>Origen → destino</small><strong>{guide.origin} → {guide.destination}</strong></div><div><small>Conductor / patentes</small><strong>{guide.driver_name||"—"} · {guide.truck_plate||"—"} / {guide.trailer_plate||"—"}</strong></div></div></div>
      {items.map(i=>{const totals=materialGuideTotals(i),invoice=invoicesByItem.get(i.id);const alerts=[
        ...(guide.movement_type==="venta"&&i.arrival_kg==null?["Pendiente peso de llegada"]:[]),
        ...(guide.movement_type==="venta"&&!i.invoice_number?["Pendiente factura"]:[]),
        ...(i.invoice_number&&(invoice?Number(invoice.total_clp)>Number(invoice.paid_clp):i.receivable_invoice_id?false:i.invoice_status!=="pagada")?["Pendiente cobro"]:[]),
        ...(totals.destination_difference_kg!=null&&Math.abs(totals.destination_difference_kg)>0.01?["Diferencia de pesaje"]:[]),
        ...(totals.invoice_difference_kg!=null&&Math.abs(totals.invoice_difference_kg)>0.01?["Diferencia de factura"]:[])];
        if(guide.movement_type==="venta"&&Number(i.stock_kg||0)>0&&Math.abs((posted.get(i.id)??0)-Number(i.stock_kg))>0.01)alerts.push("Salida desde stock aún sin conciliar");
        return <div className="order-section" key={i.id}><h2>Ítem {i.line_number} · {i.material_name}</h2>
          {alerts.length>0&&<p className="guide-alert"><AlertTriangle size={16}/>{alerts.join(" · ")}</p>}
          <div className="order-grid"><div><small>Faena / ticket</small><strong>{kg(i.origin_kg)} · {i.origin_ticket||"—"}</strong></div><div><small>Complemento desde stock / descontado</small><strong>{kg(i.stock_kg)} / {kg(posted.get(i.id)??0)}</strong></div><div><small>Salida total / ticket</small><strong>{kg(totals.departure_kg)} · {i.departure_ticket||"—"}</strong></div><div><small>Destino / ticket</small><strong>{kg(i.arrival_kg)} · {i.destination_ticket||"—"}</strong></div><div><small>Devuelto / retorno</small><strong>{kg(i.returned_kg)} · {kg(i.return_kg)} · {i.return_ticket||"—"}</strong></div><div><small>Diferencia salida / llegada</small><strong>{kg(totals.destination_difference_kg)}</strong></div><div><small>Impureza destino / peso factura</small><strong>{kg(i.destination_impurity_kg)} · {kg(i.invoice_kg)}</strong></div><div><small>Diferencia pesaje / factura</small><strong>{kg(totals.invoice_difference_kg)}</strong></div><div><small>Precio acordado / facturado ($/kg)</small><strong>{money(i.agreed_price_clp)} · {money(i.invoice_price_clp)}</strong></div><div><small>Valor estimado / facturado</small><strong>{money(totals.estimated_clp)} · {money(totals.billed_clp)}</strong></div><div><small>Diferencia valorizada</small><strong>{money(totals.value_difference_clp)}</strong></div><div><small>Factura / estado</small><strong>{i.invoice_number||"Pendiente"} · {invoice?Number(invoice.total_clp)<=Number(invoice.paid_clp)?"pagada":"en cobranza":i.invoice_status||"—"}</strong></div><div><small>Emisión / pago</small><strong>{i.invoice_issued_on?day(i.invoice_issued_on):"—"} · {invoice?"Pagos en Cobranza":i.payment_on?day(i.payment_on):"—"}</strong></div><div><small>Guía valorizada</small><strong>{i.valued_guide_number||"—"}</strong></div></div>
          {i.notes&&<p>{i.notes}</p>}<Link className="back-link print-hide" href={`/control-guias/${id}?editar=${i.id}#material`}>Editar este material</Link>
        </div>;})}
      <div className="order-section"><h2>Flete y cierre</h2><div className="order-grid"><div><small>Transportista / valor</small><strong>{guide.freight_company||"—"} · {money(guide.freight_cost_clp)}</strong></div><div><small>Factura / estado</small><strong>{guide.freight_invoice_number||"—"} · {guide.freight_invoice_status||"—"}</strong></div><div><small>Guía transportista / pago</small><strong>{guide.freight_guide_reference||"—"} · {guide.freight_payment_required||"—"}</strong></div></div>{mismatch&&<p className="guide-alert"><AlertTriangle size={16}/> La referencia de guía del transportista difiere de esta guía; revisar antes del pago.</p>}{guide.notes&&<p>{guide.notes}</p>}</div>
      <footer className="order-footer">Control operativo interno · Los pesos y valores se calculan con las fórmulas de la planilla de guías 2026. Este documento no reemplaza la guía tributaria.</footer>
    </article>
    {guide.movement_type==="venta"&&actor.role==="admin"&&<section id="cobranza" className="section-card print-hide"><div className="section-heading"><div><div className="eyebrow">VENTA DE MATERIAL · RERCHAR</div><h2>Factura externa y cobranza</h2></div></div>
      {billingReady?<><p className="helper-text">Registre el total real del documento emitido externamente, con impuestos si corresponde. Si varios materiales comparten el folio, se vinculan a una sola cuenta y un solo saldo.</p>
        {items.map(item=>{const invoice=invoicesByItem.get(item.id);return <div className="note-block" key={item.id}><strong>Ítem {item.line_number} · {item.material_name}</strong>
          {invoice?<><p>Factura {invoice.invoice_number} · Total {money(invoice.total_clp)} · Abonado {money(invoice.paid_clp)} · Saldo {money(Math.max(0,Number(invoice.total_clp)-Number(invoice.paid_clp)))} · Vence {day(invoice.due_on)}</p>
            <Link href="/cobranzas?empresa=rerchar">Ver factura y registrar abono →</Link></>:<form action={linkMaterialSaleInvoiceAction} className="form-grid detail-form">
            <input type="hidden" name="guide_id" value={id}/><input type="hidden" name="item_id" value={item.id}/>
            <label>Folio factura<input name="invoice_number" required minLength={2} maxLength={80} defaultValue={item.invoice_number??""}/></label>
            <label>Emisión<input name="issued_on" type="date" min={iso(guide.movement_on)} max={today} defaultValue={item.invoice_issued_on?iso(item.invoice_issued_on):""} required/></label>
            <label>Vencimiento<input name="due_on" type="date" min={item.invoice_issued_on?iso(item.invoice_issued_on):iso(guide.movement_on)} required/></label>
            <label>Total real del documento (CLP)<input name="total_clp" type="number" min="0.01" step="0.01" required/></label>
            <div className="field-full form-footer"><SubmitButton className="button button-primary">Vincular a Cobranza</SubmitButton></div>
          </form>}</div>;})}</>:<p role="alert" className="notice notice-error">La vinculación con Cobranza requiere aplicar la migración 043 a la base de datos. El control operativo de la guía sigue disponible.</p>}
    </section>}
    <section id="material" className="section-card print-hide"><div className="section-heading"><div><div className="eyebrow">MATERIALES DE ESTA GUÍA</div><h2><Weight size={19}/> {editing?`Editar ítem ${editing.line_number}`:"Agregar otro material"}</h2></div></div>
      <p className="helper-text">Cada material tiene sus propios tickets, pesos y factura. En una venta, los kg «desde stock» se descuentan sólo si existe saldo confirmado del material elegido. Los campos vacíos en una edición se borran.</p>
      <form action={saveMaterialGuideItemAction} className="form-grid" key={editing?.id??"new"}><input type="hidden" name="guide_id" value={id}/><input type="hidden" name="item_id" value={editing?.id??""}/><GuideItemFields item={editing} catalog={catalog} lineNumber={items.length+1}/><div className="field-full form-footer"><SubmitButton className="button button-primary">{editing?"Guardar cambios del material":"Agregar material"}</SubmitButton></div></form>
    </section>
    <details className="section-card print-hide"><summary>Corregir datos generales y flete</summary><form action={updateMaterialGuideAction} className="form-grid guide-header-edit"><input type="hidden" name="guide_id" value={id}/><GuideHeaderFields guide={guide} clients={clients} today={today}/><div className="field-full form-footer"><SubmitButton className="button button-outline">Guardar datos generales</SubmitButton></div></form></details>
    <p className="helper-text print-hide">Los saldos de materiales empiezan en cero y sólo incluyen recepciones y saldos iniciales confirmados; la bodega de EPP e insumos se controla aparte.</p>
  </>;
}
