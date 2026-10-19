import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "./auth";
import { canManage } from "./auth";
import { db, transaction, type Db } from "./db";
import {moduleReady} from "./schema-readiness";

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
  const data = z.object({ code: label(40), name: label(160), unit: z.enum(["un","kg","lt","m","m3","caja_10","caja_50","pallet","bolsa_10","centena"]),
    category:optional(100),minimum_qty: minimum.default("0"),maximum_qty:z.union([z.literal(""),minimum]).default(""),
    unit_cost_clp:z.union([z.literal(""),z.coerce.number().finite().min(0).max(1_000_000_000)]).default("") }).parse(input);
  if(data.maximum_qty!==""&&Number(data.maximum_qty)<Number(data.minimum_qty))reject("El máximo debe ser igual o mayor que el mínimo.");
  return transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(`INSERT INTO stock_items (code,name,unit,minimum_qty,maximum_qty,category,unit_cost_clp)
      VALUES ($1,$2,$3,$4,NULLIF($5,'')::numeric,NULLIF($6,''),NULLIF($7::text,'')::numeric) RETURNING id`,
      [data.code.toUpperCase(), data.name, data.unit, data.minimum_qty,data.maximum_qty,data.category,data.unit_cost_clp]);
    await audit(tx, actor, "create", "stock_item", row.id, data);
    return row.id;
  });
}

export async function updateStockItemValuation(actor: Actor, itemId: string, input: unknown) {
  requireOperations(actor);
  if (!uuid.safeParse(itemId).success) reject("Artículo inválido.");
  const data = z.object({
    category: optional(100),
    unit_cost_clp: z.union([
      z.literal(""),
      z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/).refine(value => Number(value) <= 1_000_000_000),
    ]),
  }).parse(input);
  return transaction(async tx => {
    const [previous] = await tx.query<{category:string|null;unit_cost_clp:string|null}>(
      "SELECT category,unit_cost_clp FROM stock_items WHERE id=$1 AND active=true FOR UPDATE", [itemId]);
    if (!previous) reject("Artículo inexistente o inactivo.");
    await tx.query("UPDATE stock_items SET category=NULLIF($2,''),unit_cost_clp=NULLIF($3,'')::numeric WHERE id=$1",
      [itemId,data.category,data.unit_cost_clp]);
    await audit(tx,actor,"update_valuation","stock_item",itemId,{previous,next:data});
  });
}

export type Purchase = {
  id: string; folio: string; title: string; category: string; priority: string; status: string;
  notes: string | null; supplier: string | null; order_reference: string | null;
  order_sequence:string|null;without_order:boolean;
  issuer:"rerchar"|"e_y_j";supplier_profile_id?:string|null;supplier_tax_id:string|null;supplier_address:string|null;supplier_contact:string|null;cost_center:string|null;
  payment_terms:string|null;vat_rate:string;ordered_at:Date|null;
  expected_date: Date | string | null; requested_by: string; requested_name: string;
  approved_name: string | null; created_at: Date; updated_at: Date;
};
export type PurchaseLine = { id: string; item_id: string; code: string; name: string; unit: string; quantity: string; received_qty: string;unit_price_clp:string|null;discount_clp:string };
export type PurchaseReceipt = { id: string; item_name: string; warehouse_name: string; quantity: string; guide_number: string; invoice_number: string | null; document_kind:"guia"|"factura"; payment_status: string; recorded_name: string; created_at: Date };
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
    db.query<PurchaseReceipt>(`SELECT r.id,i.name AS item_name,w.name AS warehouse_name,r.quantity,r.guide_number,r.invoice_number,r.document_kind,r.payment_status,u.name AS recorded_name,r.created_at
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
  const data = z.object({ submission_key: uuid, title: z.string().trim().min(3).max(180), category: z.enum(["repuestos","insumos","seguridad","servicios","operacion","otros"]),
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

export function purchaseTotals(lines:Pick<PurchaseLine,"quantity"|"unit_price_clp"|"discount_clp">[],vatRate:number){
  const amounts=lines.map(line=>Math.round(Number(line.quantity)*(Number(line.unit_price_clp??0)-Number(line.discount_clp))));
  const net=amounts.reduce((sum,amount)=>sum+amount,0);
  const vat=Math.round(net*vatRate);
  return {amounts,net,vat,total:net+vat};
}

export async function savePurchaseDraft(actor: Actor, requestId: string, input: unknown) {
  requireOperations(actor);
  const id = uuid.parse(requestId);
  const data = z.object({ supplier: optional(160), supplier_profile_id:z.union([uuid,z.literal("")]).default(""), expected_date: date,
    issuer:z.enum(["rerchar","e_y_j"]),supplier_tax_id:optional(20),supplier_address:optional(250),
    supplier_contact:optional(120),cost_center:optional(120),payment_terms:optional(120),
    vat_rate:z.enum(["0","0.19"]).default("0.19"),prices:z.record(uuid,z.union([z.string(),z.number()])),
    discounts:z.record(uuid,z.union([z.string(),z.number()])).default({}) }).parse(input);
  const profilesReady=await moduleReady("purchase_supplier_profile");
  if(data.supplier_profile_id&&!profilesReady)reject("El vínculo con la ficha de proveedor todavía no está disponible.");
  await transaction(async (tx) => {
    const [request] = await tx.query<{ status: string }>("SELECT status FROM purchase_requests WHERE id=$1 FOR UPDATE", [id]);
    if (!request || request.status !== "aprobada") reject("Apruebe la solicitud antes de preparar la orden.");
    let supplier=data.supplier,taxId=data.supplier_tax_id,address=data.supplier_address,terms=data.payment_terms;
    if(data.supplier_profile_id){
      const [profile]=await tx.query<{legal_name:string;tax_id:string;legal_address:string;payment_terms:string;status:string;kind:string}>(
        "SELECT legal_name,tax_id,legal_address,payment_terms,status,kind FROM counterparty_profiles WHERE id=$1",
        [data.supplier_profile_id]);
      if(!profile||profile.status!=="verificada"||profile.kind==="cliente")reject("Seleccione una ficha de proveedor verificada.");
      supplier=profile.legal_name;taxId=profile.tax_id;address=profile.legal_address;
      terms=profile.payment_terms==="contado"?"Contado":`Crédito ${profile.payment_terms} días`;
    }else if(supplier.length<2||terms.length<2)reject("Indique proveedor y condiciones de pago, o seleccione una ficha verificada.");
    const lines=await tx.query<{id:string}>("SELECT id FROM purchase_lines WHERE request_id=$1 FOR UPDATE",[id]);
    if(!lines.length||Object.keys(data.prices).length!==lines.length||
       Object.keys(data.discounts).some(key=>!lines.some(line=>line.id===key)))
      reject("Indique el precio unitario de cada artículo de la orden.");
    for(const line of lines){
      const price=String(data.prices[line.id]??"").trim();
      const discount=String(data.discounts[line.id]??"0").trim()||"0";
      if(!/^\d+(?:\.\d{1,2})?$/.test(price)||Number(price)>100_000_000)reject("Precio unitario inválido en la orden.");
      if(!/^\d+(?:\.\d{1,2})?$/.test(discount)||Number(discount)>Number(price))
        reject("El descuento unitario debe ser igual o menor que el precio.");
      await tx.query("UPDATE purchase_lines SET unit_price_clp=$2,discount_clp=$3 WHERE id=$1",[line.id,price,discount]);
    }
    await tx.query(`UPDATE purchase_requests SET supplier=$2,order_reference=NULL,expected_date=NULLIF($3,'')::date,
      issuer=$4,supplier_tax_id=NULLIF($5,''),supplier_address=NULLIF($6,''),payment_terms=$7,vat_rate=$8,
      supplier_contact=NULLIF($9,''),cost_center=NULLIF($10,'')${profilesReady?",supplier_profile_id=NULLIF($11,'')::uuid":""},updated_at=now()
      WHERE id=$1`,[id,supplier,data.expected_date,data.issuer,taxId,
      address,terms,data.vat_rate,data.supplier_contact,data.cost_center,...(profilesReady?[data.supplier_profile_id]:[])]);
    await purchaseEvent(tx, actor, id, "draft_order", "Borrador de OC guardado sin número y sin emitir",
      {...data,supplier,supplier_tax_id:taxId,supplier_address:address,payment_terms:terms});
  });
}

export async function issuePurchaseDraft(actor:Actor,requestId:string,confirmation:unknown){
  requireOperations(actor);
  const id=uuid.parse(requestId);
  if(confirmation!=="EMITIR")reject("Confirme la emisión escribiendo EMITIR.");
  await transaction(async tx=>{
    const [request]=await tx.query<Purchase>("SELECT * FROM purchase_requests WHERE id=$1 FOR UPDATE",[id]);
    if(!request||request.status!=="aprobada"||!request.supplier||!request.payment_terms)
      reject("Guarde y revise el borrador antes de emitir la orden.");
    if(request.supplier_profile_id){
      const [profile]=await tx.query<{legal_name:string;tax_id:string;legal_address:string;payment_terms:string;status:string;kind:string}>(
        "SELECT legal_name,tax_id,legal_address,payment_terms,status,kind FROM counterparty_profiles WHERE id=$1",
        [request.supplier_profile_id]);
      const terms=profile?.payment_terms==="contado"?"Contado":`Crédito ${profile?.payment_terms} días`;
      if(!profile||profile.status!=="verificada"||profile.kind==="cliente"||profile.legal_name!==request.supplier||
         profile.tax_id!==request.supplier_tax_id||profile.legal_address!==request.supplier_address||terms!==request.payment_terms)
        reject("La ficha del proveedor cambió o está pendiente de revisión. Guarde nuevamente el borrador antes de emitir.");
    }
    const lines=await tx.query<PurchaseLine>("SELECT * FROM purchase_lines WHERE request_id=$1 FOR UPDATE",[id]);
    if(!lines.length||lines.some(line=>line.unit_price_clp==null))reject("El borrador requiere precios para cada artículo.");
    let sequence:{last_number:string};
    let reference:string;
    do {
      [sequence]=await tx.query<{last_number:string}>(`INSERT INTO purchase_order_sequences (issuer,last_number)
        VALUES ($1,1) ON CONFLICT (issuer) DO UPDATE SET last_number=purchase_order_sequences.last_number+1
        RETURNING last_number`,[request.issuer]);
      reference=`OC-${request.issuer==="rerchar"?"RER":"EYJ"}-${String(sequence.last_number).padStart(6,"0")}`;
      const [occupied]=await tx.query("SELECT id FROM purchase_requests WHERE issuer=$1 AND order_reference=$2 LIMIT 1",[request.issuer,reference]);
      if(!occupied)break;
    }while(true);
    // Correlativo interno por empresa. La serie histórica oficial se configura al validar el último número emitido.
    await tx.query("UPDATE purchase_requests SET status='ordenada',order_sequence=$2,order_reference=$3,ordered_at=now(),updated_at=now() WHERE id=$1",[id,sequence.last_number,reference]);
    await purchaseEvent(tx,actor,id,"order",`Orden ${reference} emitida para ${request.supplier}`,
      {order_reference:reference,supplier:request.supplier});
  });
}

export async function receivePurchase(actor: Actor, requestId: string, input: unknown) {
  requireOperations(actor);
  const id = uuid.parse(requestId);
  const data = z.object({ submission_key: uuid, line_id: uuid, warehouse_id: uuid, quantity,
    guide_number: z.string().trim().max(80), invoice_number: optional(80), payment_status: z.enum(["pendiente","pagada"]),
    without_order:z.boolean().default(false),supplier:optional(160),issuer:z.enum(["rerchar","e_y_j"]).optional() }).parse(input);
  const profilesReady=await moduleReady("purchase_supplier_profile");
  if(!data.guide_number&&!data.invoice_number)reject("Indique el número de guía o de factura que respalda la recepción.");
  return transaction(async (tx) => {
    const [request] = await tx.query<{ status: string;without_order:boolean;issuer:string }>("SELECT status,without_order,issuer FROM purchase_requests WHERE id=$1 FOR UPDATE", [id]);
    if (!request) reject("Solicitud de compra no encontrada.");
    const [repeated] = await tx.query<{ id: string; request_id: string }>("SELECT id,request_id FROM purchase_receipts WHERE submission_key=$1", [data.submission_key]);
    if (repeated) {
      if (repeated.request_id !== id) reject("La clave de recepción ya fue utilizada.");
      return repeated.id;
    }
    if (request.status==="aprobada") {
      if(!data.without_order||!data.supplier||!data.issuer)reject("Para recibir sin OC, indique proveedor y empresa compradora.");
      await tx.query(`UPDATE purchase_requests SET supplier=$2,issuer=$3,without_order=true,order_reference=NULL,order_sequence=NULL${profilesReady?",supplier_profile_id=NULL":""} WHERE id=$1`,[id,data.supplier,data.issuer]);
    } else if (!["ordenada","parcial"].includes(request.status) || request.without_order!==data.without_order)
      reject("La compra aún no admite esta modalidad de recepción.");
    const [line] = await tx.query<{ item_id: string }>("SELECT item_id FROM purchase_lines WHERE id=$1 AND request_id=$2", [data.line_id,id]);
    if (!line) reject("El artículo no pertenece a esta orden.");
    const [warehouse] = await tx.query("SELECT id FROM warehouses WHERE id=$1 AND active=true", [data.warehouse_id]);
    if (!warehouse) reject("Seleccione una bodega activa.");
    const [updated] = await tx.query<{ received_qty: string }>(`UPDATE purchase_lines SET received_qty=received_qty+$2
      WHERE id=$1 AND received_qty+$2<=quantity RETURNING received_qty`, [data.line_id,data.quantity]);
    if (!updated) reject("La cantidad supera el saldo pendiente de la orden.");
    const [receipt] = await tx.query<{ id: string }>(`INSERT INTO purchase_receipts
      (submission_key,request_id,line_id,warehouse_id,quantity,guide_number,invoice_number,document_kind,payment_status,recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),$8,$9,$10) RETURNING id`,
      [data.submission_key,id,data.line_id,data.warehouse_id,data.quantity,data.guide_number||data.invoice_number,data.invoice_number,data.guide_number?"guia":"factura",data.payment_status,actor.id]);
    await tx.query(`INSERT INTO stock_balances (item_id,warehouse_id,quantity) VALUES ($1,$2,$3)
      ON CONFLICT (item_id,warehouse_id) DO UPDATE SET quantity=stock_balances.quantity+EXCLUDED.quantity`, [line.item_id,data.warehouse_id,data.quantity]);
    await tx.query(`INSERT INTO inventory_movements (item_id,warehouse_id,kind,qty_delta,note,purchase_receipt_id,created_by)
      VALUES ($1,$2,'recepcion',$3,$4,$5,$6)`, [line.item_id,data.warehouse_id,data.quantity,data.guide_number?`Guía ${data.guide_number}`:`Factura ${data.invoice_number}`,receipt.id,actor.id]);
    const [pending] = await tx.query("SELECT id FROM purchase_lines WHERE request_id=$1 AND received_qty<quantity LIMIT 1", [id]);
    const status = pending ? "parcial" : "recibida";
    await tx.query("UPDATE purchase_requests SET status=$2,updated_at=now() WHERE id=$1", [id,status]);
    await purchaseEvent(tx, actor, id, "receive", `Recepción ${data.quantity} · ${data.without_order?"sin OC · ":""}${data.guide_number?`guía ${data.guide_number}`:`factura ${data.invoice_number}`}`, { receipt_id: receipt.id, item_id: line.item_id, warehouse_id: data.warehouse_id, quantity: data.quantity, status, without_order:data.without_order });
    return receipt.id;
  });
}

export type Warehouse = { id: string; code: string; name: string };
export type StockItem = { id: string; code: string; name: string; unit: string; minimum_qty: string; maximum_qty:string|null;category:string|null;unit_cost_clp:string|null };
export type StockBalance = { item_id: string; warehouse_id: string; item_code: string; item_name: string; unit: string; warehouse_name: string; minimum_qty: string; quantity: string; reserved: string };
export type InventoryMovement = { id: string; item_name: string; code: string; unit: string; warehouse_name: string; kind: string; qty_delta: string; reserved_delta: string; note: string; actor_name: string; created_at: Date; document_reference:string|null;cost_center:string|null };
export type Reservation = { id: string; item_name: string; warehouse_name: string; unit: string; quantity: string; reason: string; created_by_name: string; created_at: Date };
export type SerializedTire={id:string;code:string;brand:string|null;size:string|null;status:string;warehouse_name:string|null;asset_label:string|null};

export async function listInventory(actor: Actor, itemId = "", warehouseId = "") {
  requireOperations(actor);
  const [warehouses, items, balances, movements, reservations, tires] = await Promise.all([
    db.query<Warehouse>("SELECT id,code,name FROM warehouses WHERE active=true ORDER BY name"),
    db.query<StockItem>("SELECT id,code,name,unit,minimum_qty,maximum_qty,category,unit_cost_clp FROM stock_items WHERE active=true ORDER BY name"),
    db.query<StockBalance>(`SELECT i.id AS item_id,w.id AS warehouse_id,i.code AS item_code,i.name AS item_name,i.unit,w.name AS warehouse_name,i.minimum_qty,
       COALESCE(b.quantity,0)::text AS quantity,COALESCE(b.reserved,0)::text AS reserved
       FROM stock_items i CROSS JOIN warehouses w LEFT JOIN stock_balances b ON b.item_id=i.id AND b.warehouse_id=w.id
       WHERE i.active=true AND w.active=true ORDER BY w.name,i.name`),
    db.query<InventoryMovement>(`SELECT m.id,i.name AS item_name,i.code,i.unit,w.name AS warehouse_name,m.kind,m.qty_delta,m.reserved_delta,m.note,u.name AS actor_name,m.created_at,m.document_reference,m.cost_center
       FROM inventory_movements m JOIN stock_items i ON i.id=m.item_id JOIN warehouses w ON w.id=m.warehouse_id
       JOIN users u ON u.id=m.created_by WHERE ($1::text='' OR m.item_id=NULLIF($1,'')::uuid)
       AND ($2::text='' OR m.warehouse_id=NULLIF($2,'')::uuid) ORDER BY m.created_at DESC,m.id DESC LIMIT 150`,
      [uuid.safeParse(itemId).success ? itemId : "",uuid.safeParse(warehouseId).success ? warehouseId : ""]),
    db.query<Reservation>(`SELECT r.id,i.name AS item_name,w.name AS warehouse_name,i.unit,r.quantity,r.reason,u.name AS created_by_name,r.created_at
      FROM inventory_reservations r JOIN stock_items i ON i.id=r.item_id JOIN warehouses w ON w.id=r.warehouse_id
      JOIN users u ON u.id=r.created_by WHERE r.status='activa' ORDER BY r.created_at DESC LIMIT 100`),
    db.query<SerializedTire>(`SELECT t.id,t.code,t.brand,t.size,t.status,w.name AS warehouse_name,a.label AS asset_label
      FROM tires t LEFT JOIN warehouses w ON w.id=t.warehouse_id LEFT JOIN assets a ON a.id=t.asset_id
      ORDER BY CASE t.status WHEN 'disponible' THEN 0 ELSE 1 END,t.code LIMIT 300`),
  ]);
  return { warehouses, items, balances, movements, reservations, tires };
}

async function activePair(tx: Db, itemId: string, warehouseId: string) {
  const [pair] = await tx.query(`SELECT i.id FROM stock_items i CROSS JOIN warehouses w
    WHERE i.id=$1 AND w.id=$2 AND i.active=true AND w.active=true`, [itemId,warehouseId]);
  if (!pair) reject("Artículo o bodega inexistente o inactiva.");
}

export async function adjustStock(actor: Actor, input: unknown) {
  requireOperations(actor);
  const data = z.object({ item_id: uuid, warehouse_id: uuid, direction: z.enum(["entrada","salida"]), quantity, reason: z.string().trim().min(5).max(500),
    document_reference:optional(100),cost_center:optional(100) }).parse(input);
  await transaction(async (tx) => {
    await activePair(tx,data.item_id,data.warehouse_id);
    await tx.query("INSERT INTO stock_balances (item_id,warehouse_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [data.item_id,data.warehouse_id]);
    const signed = data.direction === "entrada" ? data.quantity : `-${data.quantity}`;
    const [balance] = await tx.query(`UPDATE stock_balances SET quantity=quantity+$3 WHERE item_id=$1 AND warehouse_id=$2
      AND quantity+$3>=reserved RETURNING quantity`, [data.item_id,data.warehouse_id,signed]);
    if (!balance) reject("Saldo disponible insuficiente; hay unidades reservadas o faltantes.");
    const [movement] = await tx.query<{ id: string }>(`INSERT INTO inventory_movements (item_id,warehouse_id,kind,qty_delta,note,created_by,document_reference,cost_center)
      VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),NULLIF($8,'')) RETURNING id`,
      [data.item_id,data.warehouse_id,data.direction === "entrada" ? "ajuste_entrada" : "ajuste_salida",signed,data.reason,actor.id,data.document_reference,data.cost_center]);
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
