import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "./auth";
import { canManage } from "./auth";
import { db, transaction, type Db } from "./db";

const uuid = z.uuid();
const label = (max = 180) => z.string().trim().min(2).max(max);
const optional = (max = 1000) => z.string().trim().max(max).optional().default("");
const quantity = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(text) || Number(text) <= 0 || Number(text) > 100_000_000) {
    ctx.addIssue({ code: "custom", message: "La cantidad debe ser positiva, con hasta tres decimales." });
    return z.NEVER;
  }
  return text;
});
const minimum = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(text) || Number(text) > 100_000_000) {
    ctx.addIssue({ code: "custom", message: "El mínimo debe ser cero o mayor, con hasta tres decimales." });
    return z.NEVER;
  }
  return text;
});
const priority = z.enum(["normal", "alta", "critica"]);
const date = z.union([z.literal(""), z.iso.date()]).default("");

export const purchaseStatus: Record<string, string> = {
  solicitada: "Solicitada", aprobada: "Aprobada", ordenada: "Orden emitida",
  parcial: "Recepción parcial", recibida: "Recibida", cancelada: "Cancelada",
};
export class SupplyError extends Error {}
function reject(message: string): never { throw new SupplyError(message); }
function requireOperations(actor: Actor) { if (!canManage(actor)) reject("No tiene acceso a compras ni inventario."); }
function requireAdmin(actor: Actor) { if (actor.role !== "admin") reject("Esta decisión requiere un usuario administrador."); }
async function audit(tx: Db, actor: Actor, action: string, type: string, id: string, data: unknown) {
  await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,$2,$3,$4,$5)",
    [actor.id, action, type, id, JSON.stringify(data)]);
}
async function purchaseEvent(tx: Db, actor: Actor, id: string, kind: string, description: string, data: unknown) {
  await tx.query("INSERT INTO purchase_events (request_id,actor_id,kind,description) VALUES ($1,$2,$3,$4)", [id, actor.id, kind, description]);
  await audit(tx, actor, kind, "purchase_request", id, data);
}

export async function createWarehouse(actor: Actor, input: unknown) {
  requireOperations(actor);
  const data = z.object({ code: label(30), name: label(120) }).parse(input);
  return transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>("INSERT INTO warehouses (code,name) VALUES ($1,$2) RETURNING id", [data.code.toUpperCase(), data.name]);
    await audit(tx, actor, "create", "warehouse", row.id, data);
    return row.id;
  });
}

export async function createStockItem(actor: Actor, input: unknown) {
  requireOperations(actor);
  const data = z.object({ code: label(40), name: label(160), unit: z.enum(["un","kg","lt","m","m3"]), minimum_qty: minimum.default("0") }).parse(input);
  return transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>("INSERT INTO stock_items (code,name,unit,minimum_qty) VALUES ($1,$2,$3,$4) RETURNING id",
      [data.code.toUpperCase(), data.name, data.unit, data.minimum_qty]);
    await audit(tx, actor, "create", "stock_item", row.id, data);
    return row.id;
  });
}

export type Purchase = {
  id: string; folio: string; title: string; category: string; priority: string; status: string;
  notes: string | null; supplier: string | null; order_reference: string | null;
  issuer:"rerchar"|"e_y_j";supplier_tax_id:string|null;supplier_address:string|null;payment_terms:string|null;vat_rate:string;ordered_at:Date|null;
  expected_date: Date | string | null; requested_by: string; requested_name: string;
  approved_name: string | null; created_at: Date; updated_at: Date;
};
export type PurchaseLine = { id: string; item_id: string; code: string; name: string; unit: string; quantity: string; received_qty: string;unit_price_clp:string|null };
export type PurchaseReceipt = { id: string; item_name: string; warehouse_name: string; quantity: string; guide_number: string; invoice_number: string | null; payment_status: string; recorded_name: string; created_at: Date };
export type PurchaseEvent = { id: string; kind: string; description: string; actor_name: string; created_at: Date };
const purchaseSelect = `SELECT p.*, u.name AS requested_name, a.name AS approved_name FROM purchase_requests p
 JOIN users u ON u.id=p.requested_by LEFT JOIN users a ON a.id=p.approved_by`;

export async function listPurchases(actor: Actor, status = "") {
  requireOperations(actor);
  const filter = status === "" || Object.hasOwn(purchaseStatus, status) ? status : "";
  return db.query<Purchase>(`${purchaseSelect} WHERE ($1::text='' OR p.status=$1) ORDER BY p.created_at DESC,p.folio DESC LIMIT 150`, [filter]);
}

export async function getPurchase(actor: Actor, id: string) {
  requireOperations(actor);
  if (!uuid.safeParse(id).success) reject("Solicitud de compra inválida.");
  const [purchase] = await db.query<Purchase>(`${purchaseSelect} WHERE p.id=$1`, [id]);
  if (!purchase) reject("Solicitud de compra no encontrada.");
  const [lines, receipts, events] = await Promise.all([
    db.query<PurchaseLine>(`SELECT l.*,i.code,i.name,i.unit FROM purchase_lines l JOIN stock_items i ON i.id=l.item_id WHERE l.request_id=$1 ORDER BY i.name`, [id]),
    db.query<PurchaseReceipt>(`SELECT r.id,i.name AS item_name,w.name AS warehouse_name,r.quantity,r.guide_number,r.invoice_number,r.payment_status,u.name AS recorded_name,r.created_at
      FROM purchase_receipts r JOIN purchase_lines l ON l.id=r.line_id JOIN stock_items i ON i.id=l.item_id
      JOIN warehouses w ON w.id=r.warehouse_id JOIN users u ON u.id=r.recorded_by
      WHERE r.request_id=$1 ORDER BY r.created_at DESC,r.id DESC`, [id]),
    db.query<PurchaseEvent>(`SELECT e.id,e.kind,e.description,u.name AS actor_name,e.created_at FROM purchase_events e JOIN users u ON u.id=e.actor_id
      WHERE e.request_id=$1 ORDER BY e.created_at DESC,e.id DESC`, [id]),
  ]);
  return { purchase, lines, receipts, events };
}

export async function createPurchase(actor: Actor, input: unknown) {
  requireOperations(actor);
  const data = z.object({ submission_key: uuid, title: z.string().trim().min(3).max(180), category: z.enum(["repuestos","insumos","seguridad","servicios","otros"]),
    priority, item_id: uuid, quantity, notes: optional(2000) }).parse(input);
  return transaction(async (tx) => {
    const [item] = await tx.query("SELECT id FROM stock_items WHERE id=$1 AND active=true", [data.item_id]);
    if (!item) reject("Seleccione un artículo activo.");
    const [created] = await tx.query<{ id: string }>(`INSERT INTO purchase_requests (submission_key,title,category,priority,notes,requested_by)
      VALUES ($1,$2,$3,$4,NULLIF($5,''),$6) ON CONFLICT (submission_key) DO NOTHING RETURNING id`,
      [data.submission_key,data.title,data.category,data.priority,data.notes,actor.id]);
    if (!created) {
      const [existing] = await tx.query<{ id: string; requested_by: string }>("SELECT id,requested_by FROM purchase_requests WHERE submission_key=$1", [data.submission_key]);
      if (!existing || existing.requested_by !== actor.id) reject("La clave de envío ya se usó para otra solicitud.");
      return existing.id;
    }
    await tx.query("INSERT INTO purchase_lines (request_id,item_id,quantity) VALUES ($1,$2,$3)", [created.id,data.item_id,data.quantity]);
    await purchaseEvent(tx, actor, created.id, "create", "Solicitud de compra creada", { title: data.title, item_id: data.item_id, quantity: data.quantity });
    return created.id;
  });
}

export async function addPurchaseLine(actor: Actor, requestId: string, input: unknown) {
  requireOperations(actor);
  const id = uuid.parse(requestId);
  const data = z.object({ item_id: uuid, quantity }).parse(input);
  return transaction(async (tx) => {
    const [request] = await tx.query<{ status: string }>("SELECT status FROM purchase_requests WHERE id=$1 FOR UPDATE", [id]);
    if (!request || request.status !== "solicitada") reject("Sólo puede agregar artículos antes de la aprobación.");
    const [item] = await tx.query("SELECT id FROM stock_items WHERE id=$1 AND active=true", [data.item_id]);
    if (!item) reject("Seleccione un artículo activo.");
    const [line] = await tx.query<{ id: string }>("INSERT INTO purchase_lines (request_id,item_id,quantity) VALUES ($1,$2,$3) RETURNING id", [id,data.item_id,data.quantity]);
    await purchaseEvent(tx, actor, id, "add_line", "Artículo agregado a la solicitud", { item_id: data.item_id, quantity: data.quantity });
    return line.id;
  });
}

export async function approvePurchase(actor: Actor, requestId: string) {
  requireAdmin(actor);
  const id = uuid.parse(requestId);
  await transaction(async (tx) => {
    const [request] = await tx.query<{ status: string }>("SELECT status FROM purchase_requests WHERE id=$1 FOR UPDATE", [id]);
    if (!request || request.status !== "solicitada") reject("Esta solicitud ya fue procesada o no existe.");
    await tx.query("UPDATE purchase_requests SET status='aprobada',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1", [id,actor.id]);
    await purchaseEvent(tx, actor, id, "approve", "Solicitud aprobada", { status: "aprobada" });
  });
}

export async function cancelPurchase(actor: Actor, requestId: string, reason: unknown) {
  requireAdmin(actor);
  const id = uuid.parse(requestId);
  const note = z.string().trim().min(5).max(500).parse(reason);
  await transaction(async (tx) => {
    const [request] = await tx.query<{ status: string }>("SELECT status FROM purchase_requests WHERE id=$1 FOR UPDATE", [id]);
    if (!request || !["solicitada", "aprobada"].includes(request.status)) reject("No es posible cancelar una orden emitida o con recepciones.");
    await tx.query("UPDATE purchase_requests SET status='cancelada',updated_at=now() WHERE id=$1", [id]);
    await purchaseEvent(tx, actor, id, "cancel", `Solicitud cancelada: ${note}`, { reason: note });
  });
}

export async function orderPurchase(actor: Actor, requestId: string, input: unknown) {
  requireOperations(actor);
  const id = uuid.parse(requestId);
  const data = z.object({ supplier: label(160), order_reference: label(80), expected_date: date,
    issuer:z.enum(["rerchar","e_y_j"]),supplier_tax_id:optional(20),supplier_address:optional(250),payment_terms:label(120),
    vat_rate:z.enum(["0","0.19"]).default("0.19"),prices:z.record(uuid,z.union([z.string(),z.number()])) }).parse(input);
  await transaction(async (tx) => {
    const [request] = await tx.query<{ status: string }>("SELECT status FROM purchase_requests WHERE id=$1 FOR UPDATE", [id]);
    if (!request || request.status !== "aprobada") reject("Apruebe la solicitud antes de registrar la orden.");
    const lines=await tx.query<{id:string}>("SELECT id FROM purchase_lines WHERE request_id=$1 FOR UPDATE",[id]);
    if(!lines.length||Object.keys(data.prices).length!==lines.length)reject("Indique el precio unitario de cada artículo de la orden.");
    for(const line of lines){
      const price=String(data.prices[line.id]??"").trim();
      if(!/^\d+(?:\.\d{1,2})?$/.test(price)||Number(price)>100_000_000)reject("Precio unitario inválido en la orden.");
      await tx.query("UPDATE purchase_lines SET unit_price_clp=$2 WHERE id=$1",[line.id,price]);
    }
    await tx.query(`UPDATE purchase_requests SET status='ordenada',supplier=$2,order_reference=$3,expected_date=NULLIF($4,'')::date,
      issuer=$5,supplier_tax_id=NULLIF($6,''),supplier_address=NULLIF($7,''),payment_terms=$8,vat_rate=$9,ordered_at=now(),updated_at=now()
      WHERE id=$1`,[id,data.supplier,data.order_reference,data.expected_date,data.issuer,data.supplier_tax_id,
      data.supplier_address,data.payment_terms,data.vat_rate]);
    await purchaseEvent(tx, actor, id, "order", `Orden ${data.order_reference} emitida para ${data.supplier}`, data);
  });
}

export async function receivePurchase(actor: Actor, requestId: string, input: unknown) {
  requireOperations(actor);
  const id = uuid.parse(requestId);
  const data = z.object({ submission_key: uuid, line_id: uuid, warehouse_id: uuid, quantity,
    guide_number: z.string().trim().min(1).max(80), invoice_number: optional(80), payment_status: z.enum(["pendiente","pagada"]) }).parse(input);
  return transaction(async (tx) => {
    const [request] = await tx.query<{ status: string }>("SELECT status FROM purchase_requests WHERE id=$1 FOR UPDATE", [id]);
    if (!request) reject("Solicitud de compra no encontrada.");
    const [repeated] = await tx.query<{ id: string; request_id: string }>("SELECT id,request_id FROM purchase_receipts WHERE submission_key=$1", [data.submission_key]);
    if (repeated) {
      if (repeated.request_id !== id) reject("La clave de recepción ya fue utilizada.");
      return repeated.id;
    }
    if (!["ordenada","parcial"].includes(request.status)) reject("La orden aún no admite recepción.");
    const [line] = await tx.query<{ item_id: string }>("SELECT item_id FROM purchase_lines WHERE id=$1 AND request_id=$2", [data.line_id,id]);
    if (!line) reject("El artículo no pertenece a esta orden.");
    const [warehouse] = await tx.query("SELECT id FROM warehouses WHERE id=$1 AND active=true", [data.warehouse_id]);
    if (!warehouse) reject("Seleccione una bodega activa.");
    const [updated] = await tx.query<{ received_qty: string }>(`UPDATE purchase_lines SET received_qty=received_qty+$2
      WHERE id=$1 AND received_qty+$2<=quantity RETURNING received_qty`, [data.line_id,data.quantity]);
    if (!updated) reject("La cantidad supera el saldo pendiente de la orden.");
    const [receipt] = await tx.query<{ id: string }>(`INSERT INTO purchase_receipts
      (submission_key,request_id,line_id,warehouse_id,quantity,guide_number,invoice_number,payment_status,recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),$8,$9) RETURNING id`,
      [data.submission_key,id,data.line_id,data.warehouse_id,data.quantity,data.guide_number,data.invoice_number,data.payment_status,actor.id]);
    await tx.query(`INSERT INTO stock_balances (item_id,warehouse_id,quantity) VALUES ($1,$2,$3)
      ON CONFLICT (item_id,warehouse_id) DO UPDATE SET quantity=stock_balances.quantity+EXCLUDED.quantity`, [line.item_id,data.warehouse_id,data.quantity]);
    await tx.query(`INSERT INTO inventory_movements (item_id,warehouse_id,kind,qty_delta,note,purchase_receipt_id,created_by)
      VALUES ($1,$2,'recepcion',$3,$4,$5,$6)`, [line.item_id,data.warehouse_id,data.quantity,`Guía ${data.guide_number}`,receipt.id,actor.id]);
    const [pending] = await tx.query("SELECT id FROM purchase_lines WHERE request_id=$1 AND received_qty<quantity LIMIT 1", [id]);
    const status = pending ? "parcial" : "recibida";
    await tx.query("UPDATE purchase_requests SET status=$2,updated_at=now() WHERE id=$1", [id,status]);
    await purchaseEvent(tx, actor, id, "receive", `Recepción ${data.quantity} · guía ${data.guide_number}`, { receipt_id: receipt.id, item_id: line.item_id, warehouse_id: data.warehouse_id, quantity: data.quantity, status });
    return receipt.id;
  });
}

export type Warehouse = { id: string; code: string; name: string };
export type StockItem = { id: string; code: string; name: string; unit: string; minimum_qty: string };
export type StockBalance = { item_id: string; warehouse_id: string; item_code: string; item_name: string; unit: string; warehouse_name: string; minimum_qty: string; quantity: string; reserved: string };
export type InventoryMovement = { id: string; item_name: string; code: string; unit: string; warehouse_name: string; kind: string; qty_delta: string; reserved_delta: string; note: string; actor_name: string; created_at: Date };
export type Reservation = { id: string; item_name: string; warehouse_name: string; unit: string; quantity: string; reason: string; created_by_name: string; created_at: Date };

export async function listInventory(actor: Actor, itemId = "", warehouseId = "") {
  requireOperations(actor);
  const [warehouses, items, balances, movements, reservations] = await Promise.all([
    db.query<Warehouse>("SELECT id,code,name FROM warehouses WHERE active=true ORDER BY name"),
    db.query<StockItem>("SELECT id,code,name,unit,minimum_qty FROM stock_items WHERE active=true ORDER BY name"),
    db.query<StockBalance>(`SELECT i.id AS item_id,w.id AS warehouse_id,i.code AS item_code,i.name AS item_name,i.unit,w.name AS warehouse_name,i.minimum_qty,
       COALESCE(b.quantity,0)::text AS quantity,COALESCE(b.reserved,0)::text AS reserved
       FROM stock_items i CROSS JOIN warehouses w LEFT JOIN stock_balances b ON b.item_id=i.id AND b.warehouse_id=w.id
       WHERE i.active=true AND w.active=true ORDER BY w.name,i.name`),
    db.query<InventoryMovement>(`SELECT m.id,i.name AS item_name,i.code,i.unit,w.name AS warehouse_name,m.kind,m.qty_delta,m.reserved_delta,m.note,u.name AS actor_name,m.created_at
       FROM inventory_movements m JOIN stock_items i ON i.id=m.item_id JOIN warehouses w ON w.id=m.warehouse_id
       JOIN users u ON u.id=m.created_by WHERE ($1::text='' OR m.item_id=NULLIF($1,'')::uuid)
       AND ($2::text='' OR m.warehouse_id=NULLIF($2,'')::uuid) ORDER BY m.created_at DESC,m.id DESC LIMIT 150`,
      [uuid.safeParse(itemId).success ? itemId : "",uuid.safeParse(warehouseId).success ? warehouseId : ""]),
    db.query<Reservation>(`SELECT r.id,i.name AS item_name,w.name AS warehouse_name,i.unit,r.quantity,r.reason,u.name AS created_by_name,r.created_at
      FROM inventory_reservations r JOIN stock_items i ON i.id=r.item_id JOIN warehouses w ON w.id=r.warehouse_id
      JOIN users u ON u.id=r.created_by WHERE r.status='activa' ORDER BY r.created_at DESC LIMIT 100`),
  ]);
  return { warehouses, items, balances, movements, reservations };
}

async function activePair(tx: Db, itemId: string, warehouseId: string) {
  const [pair] = await tx.query(`SELECT i.id FROM stock_items i CROSS JOIN warehouses w
    WHERE i.id=$1 AND w.id=$2 AND i.active=true AND w.active=true`, [itemId,warehouseId]);
  if (!pair) reject("Artículo o bodega inexistente o inactiva.");
}

export async function adjustStock(actor: Actor, input: unknown) {
  requireOperations(actor);
  const data = z.object({ item_id: uuid, warehouse_id: uuid, direction: z.enum(["entrada","salida"]), quantity, reason: z.string().trim().min(5).max(500) }).parse(input);
  await transaction(async (tx) => {
    await activePair(tx,data.item_id,data.warehouse_id);
    await tx.query("INSERT INTO stock_balances (item_id,warehouse_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [data.item_id,data.warehouse_id]);
    const signed = data.direction === "entrada" ? data.quantity : `-${data.quantity}`;
    const [balance] = await tx.query(`UPDATE stock_balances SET quantity=quantity+$3 WHERE item_id=$1 AND warehouse_id=$2
      AND quantity+$3>=reserved RETURNING quantity`, [data.item_id,data.warehouse_id,signed]);
    if (!balance) reject("Saldo disponible insuficiente; hay unidades reservadas o faltantes.");
    const [movement] = await tx.query<{ id: string }>(`INSERT INTO inventory_movements (item_id,warehouse_id,kind,qty_delta,note,created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [data.item_id,data.warehouse_id,data.direction === "entrada" ? "ajuste_entrada" : "ajuste_salida",signed,data.reason,actor.id]);
    await audit(tx,actor,"adjust","inventory_movement",movement.id,data);
  });
}

export async function transferStock(actor: Actor, input: unknown) {
  requireOperations(actor);
  const data = z.object({ item_id: uuid, from_id: uuid, to_id: uuid, quantity, reason: z.string().trim().min(5).max(500) }).parse(input);
  if (data.from_id === data.to_id) reject("El origen y el destino deben ser bodegas distintas.");
  await transaction(async (tx) => {
    await activePair(tx,data.item_id,data.from_id);
    await activePair(tx,data.item_id,data.to_id);
    for (const warehouse of [data.from_id,data.to_id].sort()) {
      await tx.query("INSERT INTO stock_balances (item_id,warehouse_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [data.item_id,warehouse]);
      await tx.query("SELECT quantity FROM stock_balances WHERE item_id=$1 AND warehouse_id=$2 FOR UPDATE", [data.item_id,warehouse]);
    }
    const [source] = await tx.query(`UPDATE stock_balances SET quantity=quantity-$3 WHERE item_id=$1 AND warehouse_id=$2
      AND quantity-reserved >= $3 RETURNING quantity`, [data.item_id,data.from_id,data.quantity]);
    if (!source) reject("Saldo libre insuficiente para la transferencia.");
    await tx.query("UPDATE stock_balances SET quantity=quantity+$3 WHERE item_id=$1 AND warehouse_id=$2", [data.item_id,data.to_id,data.quantity]);
    const group = randomUUID();
    for (const [warehouse,kind,delta] of [[data.from_id,"transferencia_salida",`-${data.quantity}`],[data.to_id,"transferencia_entrada",data.quantity]]) {
      await tx.query(`INSERT INTO inventory_movements (item_id,warehouse_id,kind,qty_delta,note,transfer_group,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [data.item_id,warehouse,kind,delta,data.reason,group,actor.id]);
    }
    await audit(tx,actor,"transfer","stock_item",data.item_id,{ ...data, transfer_group: group });
  });
}

export async function reserveStock(actor: Actor, input: unknown) {
  requireOperations(actor);
  const data = z.object({ item_id: uuid, warehouse_id: uuid, quantity, reason: z.string().trim().min(5).max(500) }).parse(input);
  return transaction(async (tx) => {
    await activePair(tx,data.item_id,data.warehouse_id);
    const [balance] = await tx.query(`UPDATE stock_balances SET reserved=reserved+$3
      WHERE item_id=$1 AND warehouse_id=$2 AND quantity-reserved >= $3 RETURNING reserved`, [data.item_id,data.warehouse_id,data.quantity]);
    if (!balance) reject("Saldo libre insuficiente para reservar.");
    const [reservation] = await tx.query<{ id: string }>(`INSERT INTO inventory_reservations (item_id,warehouse_id,quantity,reason,created_by)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`, [data.item_id,data.warehouse_id,data.quantity,data.reason,actor.id]);
    await tx.query(`INSERT INTO inventory_movements (item_id,warehouse_id,kind,reserved_delta,note,reservation_id,created_by)
      VALUES ($1,$2,'reserva',$3,$4,$5,$6)`, [data.item_id,data.warehouse_id,data.quantity,data.reason,reservation.id,actor.id]);
    await audit(tx,actor,"reserve","inventory_reservation",reservation.id,data);
    return reservation.id;
  });
}

export async function closeReservation(actor: Actor, reservationId: string, action: "liberar" | "consumir") {
  requireOperations(actor);
  const id = uuid.parse(reservationId);
  if (action !== "liberar" && action !== "consumir") reject("Acción de reserva inválida.");
  await transaction(async (tx) => {
    const [reservation] = await tx.query<{ item_id: string; warehouse_id: string; quantity: string; status: string }>(
      "SELECT item_id,warehouse_id,quantity,status FROM inventory_reservations WHERE id=$1 FOR UPDATE", [id]);
    if (!reservation || reservation.status !== "activa") reject("La reserva ya fue cerrada o no existe.");
    const consume = action === "consumir";
    await tx.query(`UPDATE stock_balances SET reserved=reserved-$3,quantity=quantity-$4
      WHERE item_id=$1 AND warehouse_id=$2`, [reservation.item_id,reservation.warehouse_id,reservation.quantity,consume ? reservation.quantity : "0"]);
    await tx.query("UPDATE inventory_reservations SET status=$2,closed_by=$3,closed_at=now() WHERE id=$1", [id,consume ? "consumida" : "liberada",actor.id]);
    await tx.query(`INSERT INTO inventory_movements (item_id,warehouse_id,kind,qty_delta,reserved_delta,note,reservation_id,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reservation.item_id,reservation.warehouse_id,consume ? "consumo" : "liberacion",consume ? `-${reservation.quantity}` : "0",`-${reservation.quantity}`,
        consume ? "Consumo de reserva" : "Liberación de reserva",id,actor.id]);
    await audit(tx,actor,consume ? "consume" : "release","inventory_reservation",id,{ quantity: reservation.quantity });
  });
}
