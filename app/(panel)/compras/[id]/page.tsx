import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCheck, PackageCheck, ReceiptText } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPurchase, purchaseStatus, SupplyError, type StockItem, type Warehouse } from "@/lib/supply";
import { addPurchaseLineAction, approvePurchaseAction, cancelPurchaseAction, orderPurchaseAction, receivePurchaseAction } from "@/app/supply-actions";
import { Notice, chileDate } from "@/components/UI";
import { SubmitButton } from "@/components/Transition";

export default async function PurchaseDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const actor = await requireActor();
  if (!canManage(actor)) redirect("/");
  const { id } = await params;
  let detail;
  try { detail = await getPurchase(actor,id); }
  catch (error) { if (error instanceof SupplyError) notFound(); throw error; }
  const [items, warehouses, query] = await Promise.all([
    db.query<StockItem>("SELECT id,code,name,unit,minimum_qty FROM stock_items WHERE active=true ORDER BY name"),
    db.query<Warehouse>("SELECT id,code,name FROM warehouses WHERE active=true ORDER BY name"),
    searchParams,
  ]);
  const { purchase, lines, receipts, events } = detail;
  const receiving = ["ordenada","parcial"].includes(purchase.status);
  const outstanding = lines.filter((line) => Number(line.received_qty) < Number(line.quantity));
  return <>
    <Link href="/compras" className="back-link"><ArrowLeft size={16}/> Solicitudes de compra</Link>
    <div className="page-title-row"><div><div className="eyebrow">ORDEN Y RECEPCIONES</div><h1>OC-{String(purchase.folio).padStart(5,"0")}</h1><p className="page-intro">{purchase.title} · {purchase.requested_name}</p></div><span className={`badge supply-status-${purchase.status}`}>{purchaseStatus[purchase.status]}</span></div>
    <Notice error={query.error} ok={query.ok}/>
    <div className="supply-columns">
      <div>
        <section className="section-card"><div className="section-heading"><div><div className="eyebrow">ARTÍCULOS</div><h2>Detalle del requerimiento</h2></div></div>
          <div className="facts-grid"><div className="fact"><span>Categoría</span><strong className="capitalize">{purchase.category}</strong></div><div className="fact"><span>Criticidad</span><strong className="capitalize">{purchase.priority}</strong></div><div className="fact"><span>Solicitada</span><strong>{chileDate(purchase.created_at)}</strong></div><div className="fact"><span>Solicitante</span><strong>{purchase.requested_name}</strong></div></div>
          {purchase.notes && <div className="note-block"><span>Justificación</span><p>{purchase.notes}</p></div>}
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Artículo</th><th>Pedido</th><th>Recibido</th><th>Pendiente</th></tr></thead><tbody>{lines.map((line) =>
            <tr key={line.id}><td><strong>{line.name}</strong><span className="table-sub">{line.code}</span></td><td>{Number(line.quantity).toLocaleString("es-CL")} {line.unit}</td><td>{Number(line.received_qty).toLocaleString("es-CL")} {line.unit}</td><td><strong>{(Number(line.quantity)-Number(line.received_qty)).toLocaleString("es-CL",{ maximumFractionDigits:3 })} {line.unit}</strong></td></tr>
          )}</tbody></table></div>
          {purchase.status === "solicitada" && <form action={addPurchaseLineAction} className="form-grid supply-inline"><input type="hidden" name="request_id" value={id}/><label>Agregar artículo<select name="item_id" defaultValue="" required><option value="">Seleccione otro artículo</option>{items.filter((item) => !lines.some((line) => line.item_id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label>Cantidad<input name="quantity" type="number" min="0.001" step="0.001" required/></label><div className="field-full form-footer"><SubmitButton className="button button-outline" disabled={items.length <= lines.length}>Agregar artículo</SubmitButton></div></form>}
        </section>
        {purchase.status === "solicitada" && actor.role === "admin" && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">APROBACIÓN</div><h2><CheckCheck size={19}/> Revisión administrativa</h2></div></div><p className="helper-text">Al aprobar, se cierra la edición de artículos y se puede emitir la orden.</p><form action={approvePurchaseAction}><input type="hidden" name="request_id" value={id}/><SubmitButton className="button button-primary">Aprobar compra</SubmitButton></form></section>}
        {purchase.status === "aprobada" && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">ORDEN DE COMPRA</div><h2><ReceiptText size={19}/> Proveedor y seguimiento</h2></div></div>
          <form action={orderPurchaseAction} className="form-grid"><input type="hidden" name="request_id" value={id}/><label>Proveedor<input name="supplier" required minLength={2} maxLength={160}/></label><label>Referencia de orden<input name="order_reference" required minLength={2} maxLength={80} placeholder="OC-2026-001"/></label><label>Fecha esperada<input type="date" name="expected_date"/></label><div className="field-full form-footer"><SubmitButton className="button button-primary">Registrar orden emitida</SubmitButton></div></form>
        </section>}
        {receiving && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">RECEPCIÓN</div><h2><PackageCheck size={19}/> Registrar entrega</h2></div></div>
          <p className="helper-text">Una recepción parcial deja saldo pendiente. Cada entrega ingresa al stock de la bodega elegida y deja un movimiento de Kardex.</p>
          <form action={receivePurchaseAction} className="form-grid"><input type="hidden" name="request_id" value={id}/><input type="hidden" name="submission_key" value={randomUUID()}/>
            <label>Artículo pendiente<select name="line_id" defaultValue="" required><option value="">Seleccione artículo</option>{outstanding.map((line) => <option key={line.id} value={line.id}>{line.code} · {line.name} (pendiente: {(Number(line.quantity)-Number(line.received_qty)).toLocaleString("es-CL",{ maximumFractionDigits:3 })} {line.unit})</option>)}</select></label>
            <label>Bodega de ingreso<select name="warehouse_id" defaultValue="" required><option value="">Seleccione bodega</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label>Cantidad recibida<input name="quantity" type="number" min="0.001" step="0.001" required/></label><label>Número de guía<input name="guide_number" required maxLength={80}/></label>
            <label>Factura (opcional)<input name="invoice_number" maxLength={80}/></label><label>Pago<select name="payment_status" defaultValue="pendiente"><option value="pendiente">Pendiente</option><option value="pagada">Pagada</option></select></label>
            {!warehouses.length && <p className="helper-text field-full">Registre primero una bodega en <Link href="/inventario">Inventario</Link>.</p>}
            <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!warehouses.length}>Guardar recepción y actualizar stock</SubmitButton></div>
          </form>
        </section>}
        {purchase.status === "recibida" && <section className="section-card"><h2><PackageCheck size={19}/> Pedido recibido en su totalidad</h2><p className="helper-text">Revise el ingreso en Inventario y su Kardex por artículo y bodega.</p><Link href="/inventario" className="button button-outline">Abrir inventario</Link></section>}
        {receipts.length > 0 && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">RESPALDO</div><h2>Recepciones registradas</h2></div><span className="count-pill">{receipts.length}</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Artículo / bodega</th><th>Cantidad</th><th>Documento</th><th>Fecha</th></tr></thead><tbody>{receipts.map((receipt) => <tr key={receipt.id}><td>{receipt.item_name}<span className="table-sub">{receipt.warehouse_name}</span></td><td>{Number(receipt.quantity).toLocaleString("es-CL")}</td><td>Guía {receipt.guide_number}<span className="table-sub">Factura {receipt.invoice_number ?? "pendiente"} · Pago {receipt.payment_status}</span></td><td>{chileDate(receipt.created_at)}<span className="table-sub">{receipt.recorded_name}</span></td></tr>)}</tbody></table></div></section>}
      </div>
      <aside>
        <section className="section-card side-card"><div className="eyebrow">SEGUIMIENTO</div><h2>Orden y proveedor</h2><div className="supply-meta"><div><span>Aprobado por</span><strong>{purchase.approved_name ?? "Pendiente"}</strong></div><div><span>Proveedor</span><strong>{purchase.supplier ?? "Sin asignar"}</strong></div><div><span>Referencia</span><strong>{purchase.order_reference ?? "Sin orden"}</strong></div><div><span>Entrega prevista</span><strong>{purchase.expected_date ? chileDate(`${purchase.expected_date instanceof Date ? purchase.expected_date.toISOString().slice(0,10) : purchase.expected_date.slice(0,10)}T12:00:00Z`,false) : "Sin fecha"}</strong></div></div></section>
        <section className="section-card side-card"><div className="eyebrow">TRAZABILIDAD</div><h2>Historial</h2><ol className="timeline">{events.map((event) => <li key={event.id}><span className="timeline-marker"/><strong>{event.description}</strong><small>{event.actor_name} · {chileDate(event.created_at)}</small></li>)}</ol></section>
        {["solicitada","aprobada"].includes(purchase.status) && actor.role === "admin" && <details className="cancel-control section-card"><summary>Cancelar solicitud</summary><form action={cancelPurchaseAction} className="form-stack compact"><input type="hidden" name="request_id" value={id}/><label>Motivo<textarea name="reason" required minLength={5} maxLength={500} rows={2}/></label><SubmitButton className="button button-outline">Confirmar cancelación</SubmitButton></form></details>}
      </aside>
    </div>
  </>;
}
