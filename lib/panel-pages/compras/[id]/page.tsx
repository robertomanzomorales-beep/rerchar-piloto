import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCheck, PackageCheck, ReceiptText } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPurchase, purchaseStatus, SupplyError, type StockItem, type Warehouse } from "@/lib/supply";
import { approvePurchaseAction, cancelPurchaseAction, orderPurchaseAction } from "@/app/supply-actions";
import {PurchaseDraftForm,PurchaseLineForm,PurchaseReceiptForm} from "@/components/PurchaseDetailForms";
import { Notice, chileDate } from "@/components/UI";
import { SubmitButton } from "@/components/Transition";
import {moduleReady} from "@/lib/schema-readiness";

export default async function PurchaseDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string; compra_ok?: string }> }) {
  const actor = await requireActor();
  if (!canManage(actor)) redirect("/");
  const { id } = await params;
  let detail;
  try { detail = await getPurchase(actor,id); }
  catch (error) { if (error instanceof SupplyError) notFound(); throw error; }
  const profilesReady=await moduleReady("purchase_supplier_profile");
  const [items, warehouses, suppliers, query] = await Promise.all([
    db.query<StockItem>("SELECT id,code,name,unit,minimum_qty FROM stock_items WHERE active=true ORDER BY name"),
    db.query<Warehouse>("SELECT id,code,name FROM warehouses WHERE active=true ORDER BY name"),
    profilesReady?db.query<{id:string;legal_name:string;tax_id:string}>(`SELECT id,legal_name,tax_id FROM counterparty_profiles
      WHERE kind IN ('proveedor','ambos') AND status='verificada' ORDER BY legal_name`):Promise.resolve([]),
    searchParams,
  ]);
  const { purchase, lines, receipts, events } = detail;
  const receiving = ["ordenada","parcial"].includes(purchase.status) || purchase.status==="aprobada";
  const outstanding = lines.filter((line) => Number(line.received_qty) < Number(line.quantity));
  return <>
    <Link href="/compras" className="back-link"><ArrowLeft size={16}/> Solicitudes de compra</Link>
    <div className="page-title-row"><div><div className="eyebrow">SOLICITUD Y RECEPCIONES</div><h1>SC-{String(purchase.folio).padStart(5,"0")}</h1><p className="page-intro">{purchase.title} · {purchase.requested_name}{purchase.order_reference?` · ${purchase.order_reference}`:""}</p></div><span className={`badge supply-status-${purchase.status}`}>{purchaseStatus[purchase.status]}</span></div>
    <Notice error={query.error} ok={query.ok}/>
    <div className="supply-columns">
      <div>
        <section className="section-card"><div className="section-heading"><div><div className="eyebrow">ARTÍCULOS</div><h2>Detalle del requerimiento</h2></div></div>
          <div className="facts-grid"><div className="fact"><span>Categoría</span><strong className="capitalize">{purchase.category}</strong></div><div className="fact"><span>Criticidad</span><strong className="capitalize">{purchase.priority}</strong></div><div className="fact"><span>Solicitada</span><strong>{chileDate(purchase.created_at)}</strong></div><div className="fact"><span>Solicitante</span><strong>{purchase.requested_name}</strong></div></div>
          {purchase.notes && <div className="note-block"><span>Justificación</span><p>{purchase.notes}</p></div>}
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Artículo</th><th>Pedido</th><th>Recibido</th><th>Pendiente</th></tr></thead><tbody>{lines.map((line) =>
            <tr key={line.id}><td><strong>{line.name}</strong><span className="table-sub">{line.code}</span></td><td>{Number(line.quantity).toLocaleString("es-CL")} {line.unit}</td><td>{Number(line.received_qty).toLocaleString("es-CL")} {line.unit}</td><td><strong>{(Number(line.quantity)-Number(line.received_qty)).toLocaleString("es-CL",{ maximumFractionDigits:3 })} {line.unit}</strong></td></tr>
          )}</tbody></table></div>
          {purchase.status === "solicitada" && <PurchaseLineForm id={id} items={items.filter(item=>!lines.some(line=>line.item_id===item.id))} saved={query.compra_ok==="line"}/>}
        </section>
        {purchase.status === "solicitada" && actor.role === "admin" && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">APROBACIÓN</div><h2><CheckCheck size={19}/> Revisión administrativa</h2></div></div><p className="helper-text">Al aprobar, se cierra la edición de artículos. Luego puede emitir una OC o recibir la compra sin OC.</p><form action={approvePurchaseAction}><input type="hidden" name="request_id" value={id}/><SubmitButton className="button button-primary">Aprobar compra</SubmitButton></form></section>}
        {purchase.status === "aprobada" && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">ORDEN DE COMPRA</div><h2><ReceiptText size={19}/> Preparar borrador</h2></div></div>
          <p className="helper-text">Guarde los datos y revise la vista imprimible. El borrador no tiene número; el correlativo interno de cada empresa se asigna al emitir. Valide el último correlativo oficial antes de usar esta serie fuera del piloto.</p>
          <PurchaseDraftForm id={id} lines={lines} suppliers={suppliers.map(s=>({id:s.id,name:`${s.legal_name} · ${s.tax_id}`}))} profilesReady={profilesReady} canReviewProfiles={actor.role==="admin"} saved={query.compra_ok==="draft"} defaults={{
            issuer:purchase.issuer,supplier_profile_id:purchase.supplier_profile_id??"",supplier:purchase.supplier??"",supplier_tax_id:purchase.supplier_tax_id??"",
            supplier_address:purchase.supplier_address??"",supplier_contact:purchase.supplier_contact??"",cost_center:purchase.cost_center??"",payment_terms:purchase.payment_terms??"Crédito 30 días",
            expected_date:purchase.expected_date?(purchase.expected_date instanceof Date?purchase.expected_date.toISOString():String(purchase.expected_date)).slice(0,10):"",vat_rate:String(Number(purchase.vat_rate)),
          }}/>
          {purchase.supplier&&lines.every(line=>line.unit_price_clp!==null)&&<div className="order-actions"><Link href={`/compras/${id}/orden`} className="button button-outline">Revisar borrador imprimible</Link><form action={orderPurchaseAction} className="form-stack"><input type="hidden" name="request_id" value={id}/><label>Para emitir la OC, escriba EMITIR<input name="confirmation" autoComplete="off" required/></label><SubmitButton className="button button-primary">Emitir orden de compra</SubmitButton></form></div>}
        </section>}
        {receiving && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">RECEPCIÓN</div><h2><PackageCheck size={19}/> Registrar entrega</h2></div></div>
          <p className="helper-text">Una recepción parcial deja saldo pendiente. Cada entrega ingresa al stock de la bodega elegida y deja un movimiento de Kardex. {purchase.status==="aprobada"?"Esta compra se registrará sin orden de compra; indique empresa, proveedor y respaldo.":purchase.without_order?"Compra sin OC; conserve el respaldo de cada entrega.":""}</p>
          <PurchaseReceiptForm id={id} submissionKey={randomUUID()} withoutOrder={purchase.status==="aprobada"||purchase.without_order} needsSupplier={purchase.status==="aprobada"} supplier={purchase.supplier??""} lines={outstanding} warehouses={warehouses.map(warehouse=>({id:warehouse.id,name:`${warehouse.code} · ${warehouse.name}`}))} saved={query.compra_ok==="receive"}/>
        </section>}
        {purchase.status === "recibida" && <section id="compra-receive" className="section-card" role="status"><h2><PackageCheck size={19}/> Pedido recibido en su totalidad</h2><p className="helper-text">Revise el ingreso en Inventario y su Kardex por artículo y bodega.</p><Link href="/inventario" className="button button-outline">Abrir inventario</Link></section>}
        {receipts.length > 0 && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">RESPALDO</div><h2>Recepciones registradas</h2></div><span className="count-pill">{receipts.length}</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Artículo / bodega</th><th>Cantidad</th><th>Documento</th><th>Fecha</th></tr></thead><tbody>{receipts.map((receipt) => <tr key={receipt.id}><td>{receipt.item_name}<span className="table-sub">{receipt.warehouse_name}</span></td><td>{Number(receipt.quantity).toLocaleString("es-CL",{maximumFractionDigits:3})} {receipt.unit}</td><td>{`${receipt.document_kind==="factura"?"Factura":"Guía"} ${receipt.guide_number}`}<span className="table-sub">Factura {receipt.invoice_number ?? "pendiente"} · Pago {receipt.payment_status}</span></td><td>{chileDate(receipt.created_at)}<span className="table-sub">{receipt.recorded_name}</span></td></tr>)}</tbody></table></div></section>}
      </div>
      <aside>
        <section className="section-card side-card"><div className="eyebrow">SEGUIMIENTO</div><h2>Orden y proveedor</h2><div className="supply-meta"><div><span>Aprobado por</span><strong>{purchase.approved_name ?? "Pendiente"}</strong></div><div><span>Proveedor</span><strong>{purchase.supplier ?? "Sin asignar"}</strong></div><div><span>Orden de compra</span><strong>{purchase.order_reference ?? (purchase.without_order?"Sin OC":"Aún sin emitir")}</strong></div><div><span>Entrega prevista</span><strong>{purchase.expected_date ? chileDate(`${purchase.expected_date instanceof Date ? purchase.expected_date.toISOString().slice(0,10) : purchase.expected_date.slice(0,10)}T12:00:00Z`,false) : "Sin fecha"}</strong></div></div>{purchase.ordered_at&&purchase.order_reference&&<Link href={`/compras/${id}/orden`} className="button button-primary">Imprimir / guardar orden PDF</Link>}</section>
        <section className="section-card side-card"><div className="eyebrow">TRAZABILIDAD</div><h2>Historial</h2><ol className="timeline">{events.map((event) => <li key={event.id}><span className="timeline-marker"/><strong>{event.description}</strong><small>{event.actor_name} · {chileDate(event.created_at)}</small></li>)}</ol></section>
        {["solicitada","aprobada"].includes(purchase.status) && actor.role === "admin" && <details className="cancel-control section-card"><summary>Cancelar solicitud</summary><form action={cancelPurchaseAction} className="form-stack compact"><input type="hidden" name="request_id" value={id}/><label>Motivo<textarea name="reason" required minLength={5} maxLength={500} rows={2}/></label><SubmitButton className="button button-outline">Confirmar cancelación</SubmitButton></form></details>}
      </aside>
    </div>
  </>;
}
