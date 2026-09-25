import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, ArrowUpRight, PackagePlus } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { listPurchases, purchaseStatus, type StockItem } from "@/lib/supply";
import { createPurchaseAction } from "@/app/supply-actions";
import { Notice, chileDate } from "@/components/UI";
import { SubmitButton } from "@/components/Transition";

export default async function Purchases({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; estado?: string }> }) {
  const actor = await requireActor();
  if (!canManage(actor)) redirect("/");
  const query = await searchParams;
  const [purchases, items] = await Promise.all([
    listPurchases(actor, query.estado),
    db.query<StockItem>("SELECT id,code,name,unit,minimum_qty FROM stock_items WHERE active=true ORDER BY name"),
  ]);
  const pending = purchases.filter((purchase) => purchase.status === "solicitada").length;
  const delivery = purchases.filter((purchase) => ["ordenada","parcial"].includes(purchase.status)).length;
  return <>
    <div className="page-title-row"><div><div className="eyebrow">ABASTECIMIENTO</div><h1>Solicitudes de compra</h1><p className="page-intro">Desde la aprobación hasta la recepción trazable y el ingreso automático al inventario.</p></div><span className="title-icon"><ClipboardList size={23}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <div className="supply-summary"><div><strong>{pending}</strong><span>Por aprobar en esta vista</span></div><div><strong>{delivery}</strong><span>En espera de recepción</span></div><Link href="/inventario" className="button button-outline">Ver bodegas y Kardex <ArrowUpRight size={16}/></Link></div>
    <div className="supply-columns">
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">NUEVA SOLICITUD</div><h2><PackagePlus size={19}/> Requerimiento</h2></div></div>
        <p className="helper-text">Registre el primer artículo. Podrá agregar más artículos antes de su aprobación.</p>
        <form action={createPurchaseAction} className="form-stack"><input type="hidden" name="submission_key" value={randomUUID()}/>
          <label>Qué se necesita<input name="title" required minLength={3} maxLength={180} placeholder="Ej. Repuestos para flota"/></label>
          <div className="two-fields"><label>Categoría<select name="category" defaultValue="repuestos"><option value="repuestos">Repuestos</option><option value="insumos">Insumos</option><option value="seguridad">Seguridad</option><option value="servicios">Servicios</option><option value="otros">Otros</option></select></label>
            <label>Criticidad<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label></div>
          <label>Artículo<select name="item_id" defaultValue="" required><option value="">Seleccione un artículo</option>{items.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name} ({item.unit})</option>)}</select></label>
          <label>Cantidad<input name="quantity" type="number" min="0.001" step="0.001" required/></label>
          <label>Justificación y observaciones<textarea name="notes" rows={3} maxLength={2000} placeholder="Uso previsto y antecedentes"/></label>
          {!items.length && <p className="helper-text">Primero registre un artículo en <Link href="/inventario">Inventario</Link>.</p>}
          <SubmitButton className="button button-primary" disabled={!items.length}>Crear solicitud</SubmitButton>
        </form>
      </section>
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">SEGUIMIENTO</div><h2>Solicitudes registradas</h2></div><span className="count-pill">{purchases.length}</span></div>
        <form method="get" className="supply-filter"><label>Estado<select name="estado" defaultValue={Object.hasOwn(purchaseStatus,query.estado ?? "") ? query.estado : ""}><option value="">Todos</option>{Object.entries(purchaseStatus).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label><button className="button button-outline" type="submit">Filtrar</button></form>
        {purchases.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Compra / artículo</th><th>Criticidad</th><th>Estado</th><th aria-label="Abrir"/></tr></thead><tbody>{purchases.map((purchase) =>
          <tr key={purchase.id}><td><Link className="table-main" href={`/compras/${purchase.id}`}>OC-{String(purchase.folio).padStart(5,"0")} · {purchase.title}</Link><span className="table-sub">{purchase.requested_name} · {chileDate(purchase.created_at)}</span></td>
            <td><span className={`priority priority-${purchase.priority}`}>{purchase.priority}</span></td><td><span className={`badge supply-status-${purchase.status}`}>{purchaseStatus[purchase.status]}</span></td>
            <td><Link href={`/compras/${purchase.id}`} className="table-arrow" aria-label={`Abrir compra OC-${purchase.folio}`}><ArrowUpRight size={18}/></Link></td></tr>
        )}</tbody></table></div> : <p className="muted">No hay solicitudes de compra para este filtro.</p>}
      </section>
    </div>
  </>;
}
