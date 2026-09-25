import { z } from "zod";
import type { Actor } from "./auth";
import { canManage } from "./auth";
import { db, transaction, type Db } from "./db";

const uuid = z.uuid();
const optionalId = z.union([uuid,z.literal("")]).default("");
const note = (max = 500) => z.string().trim().min(5).max(max);
const optional = (max = 500) => z.string().trim().max(max).optional().default("");
const date = z.iso.date();
const optionalDate = z.union([date,z.literal("")]).default("");
const positive = z.coerce.number().finite().positive().max(100_000_000);
const nonnegative = z.coerce.number().finite().min(0).max(100_000_000);
export class ContinuityError extends Error {}
function reject(message: string): never { throw new ContinuityError(message); }
function guard(actor: Actor) { if (!canManage(actor)) reject("Este módulo requiere acceso de operaciones."); }
async function audit(tx: Db, actor: Actor, action: string, entityType: string, entityId: string, change: unknown) {
  await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,$2,$3,$4,$5)",
    [actor.id,action,entityType,entityId,JSON.stringify(change)]);
}

export type AssetBrief = { id: string; code: string; label: string; kind: string; available: boolean; reading_unit: string; current_reading: string; brand: string | null; model: string | null; model_year: number | null };
export async function listAssets(actor: Actor) {
  guard(actor);
  return db.query<AssetBrief>("SELECT id,code,label,kind,available,reading_unit,current_reading,brand,model,model_year FROM assets WHERE deleted_at IS NULL ORDER BY kind,label");
}

export async function setAssetDetails(actor: Actor, assetId: string, input: unknown) {
  guard(actor);
  const id = uuid.parse(assetId);
  const data = z.object({ brand: optional(90), model: optional(90), model_year: z.union([z.literal(""),z.coerce.number().int().min(1950).max(2100)]).default(""),
    reading_unit: z.enum(["sin","km","horas"]) }).parse(input);
  await transaction(async (tx) => {
    const [asset] = await tx.query<{ current_reading: string; reading_unit: string }>("SELECT current_reading,reading_unit FROM assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
    if (!asset) reject("Activo no encontrado.");
    if (Number(asset.current_reading)>0 && asset.reading_unit!==data.reading_unit) reject("No cambie la unidad de un activo con lecturas registradas.");
    await tx.query("UPDATE assets SET brand=NULLIF($2,''),model=NULLIF($3,''),model_year=NULLIF($4,'')::integer,reading_unit=$5 WHERE id=$1",
      [id,data.brand,data.model,String(data.model_year),data.reading_unit]);
    await audit(tx,actor,"update_details","asset",id,data);
  });
}

async function readingTx(tx: Db, actor: Actor, assetId: string, value: number, source: "manual" | "combustible" | "mantenimiento", sourceId: string | null, description: string) {
  const [asset] = await tx.query<{ reading_unit: string; current_reading: string }>("SELECT reading_unit,current_reading FROM assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[assetId]);
  if (!asset || asset.reading_unit === "sin") reject("Configure la unidad de lectura del activo antes de registrarla.");
  if (value < Number(asset.current_reading)) reject(`La lectura no puede ser menor a la actual (${asset.current_reading} ${asset.reading_unit}).`);
  await tx.query("UPDATE assets SET current_reading=$2 WHERE id=$1",[assetId,value]);
  const [row] = await tx.query<{ id: string }>(`INSERT INTO asset_readings (asset_id,unit,reading,source,source_id,note,recorded_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[assetId,asset.reading_unit,value,source,sourceId,description,actor.id]);
  await audit(tx,actor,"reading","asset_reading",row.id,{ asset_id:assetId,previous:asset.current_reading,reading:value,unit:asset.reading_unit,source });
  return asset;
}

export async function recordAssetReading(actor: Actor, assetId: string, input: unknown) {
  guard(actor);
  const id = uuid.parse(assetId);
  const data = z.object({ reading: nonnegative, note: note() }).parse(input);
  await transaction((tx) => readingTx(tx,actor,id,data.reading,"manual",null,data.note));
}

export type MaintenancePlan = { id: string; asset_id: string; asset_label: string; asset_code: string; title: string; frequency_kind: string;
  interval_days: number | null; interval_reading: string | null; next_due_date: Date | string | null; next_due_reading: string | null;
  lead_days: number; lead_reading: string; current_reading: string; reading_unit: string; warning: boolean };
export type WorkOrder = { id: string; folio: string; asset_id: string; asset_label: string; asset_code: string; plan_id: string | null; incident_id: string | null;
  kind: string; title: string; description: string | null; status: string; blocks_asset: boolean; scheduled_for: Date | string | null; started_at: Date | null;
  closed_at: Date | null; reading_at_close: string | null; labor_cost: string; parts_cost: string; supplier: string | null;
  resolution: string | null; created_at: Date; created_by_name: string; closed_by_name: string | null };
export type Tire = { id: string; code: string; brand: string | null; size: string | null; status: string; asset_id: string | null;
  position: string | null; asset_label: string | null };

export async function listMaintenance(actor: Actor) {
  guard(actor);
  const [assets, plans, orders, incidents, tires] = await Promise.all([
    listAssets(actor),
    db.query<MaintenancePlan>(`SELECT p.*,a.label AS asset_label,a.code AS asset_code,a.current_reading,a.reading_unit,
      (CASE WHEN p.frequency_kind='fecha' THEN p.next_due_date <= (now() AT TIME ZONE 'America/Santiago')::date + p.lead_days
       ELSE a.current_reading + p.lead_reading >= p.next_due_reading END) AS warning
      FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id WHERE p.active=true AND a.deleted_at IS NULL ORDER BY warning DESC,p.created_at DESC LIMIT 200`),
    db.query<WorkOrder>(`SELECT w.*,a.label AS asset_label,a.code AS asset_code,u.name AS created_by_name,c.name AS closed_by_name
      FROM work_orders w JOIN assets a ON a.id=w.asset_id JOIN users u ON u.id=w.created_by LEFT JOIN users c ON c.id=w.closed_by
      ORDER BY CASE w.status WHEN 'en_trabajo' THEN 0 WHEN 'abierta' THEN 1 ELSE 2 END,w.created_at DESC LIMIT 150`),
    db.query<{ id: string; asset_id: string; description: string; asset_label: string }>(`SELECT i.id,i.asset_id,i.description,a.label AS asset_label
      FROM fleet_incidents i JOIN assets a ON a.id=i.asset_id
      WHERE i.status='abierta' AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.incident_id=i.id AND w.status IN ('abierta','en_trabajo'))
      ORDER BY i.reported_at DESC LIMIT 100`),
    db.query<Tire>(`SELECT t.*,a.label AS asset_label FROM tires t LEFT JOIN assets a ON a.id=t.asset_id ORDER BY t.code LIMIT 300`),
  ]);
  return { assets,plans,orders,incidents,tires };
}

export async function createMaintenancePlan(actor: Actor, input: unknown) {
  guard(actor);
  const data = z.object({ asset_id: uuid, title: z.string().trim().min(3).max(160), frequency_kind: z.enum(["fecha","lectura"]),
    interval_days: z.string().optional().default(""), next_due_date: optionalDate,
    interval_reading: z.string().optional().default(""), next_due_reading: z.string().optional().default(""),
    lead_days: z.coerce.number().int().min(0).max(365).default(15), lead_reading: nonnegative.default(500) }).parse(input);
  const byDate = data.frequency_kind==="fecha";
  const intervalDays = byDate ? z.coerce.number().int().positive().max(3650).parse(data.interval_days) : null;
  const nextDate = byDate ? date.parse(data.next_due_date) : null;
  const intervalReading = byDate ? null : positive.parse(data.interval_reading);
  const nextReading = byDate ? null : nonnegative.parse(data.next_due_reading);
  return transaction(async (tx) => {
    const [asset] = await tx.query<{ reading_unit: string }>("SELECT reading_unit FROM assets WHERE id=$1 AND deleted_at IS NULL",[data.asset_id]);
    if (!asset || (!byDate && asset.reading_unit==="sin")) reject("Para planes por lectura, configure antes el odómetro u horómetro del activo.");
    const [plan] = await tx.query<{id:string}>(`INSERT INTO maintenance_plans (asset_id,title,frequency_kind,interval_days,interval_reading,next_due_date,next_due_reading,lead_days,lead_reading,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [data.asset_id,data.title,data.frequency_kind,intervalDays,intervalReading,nextDate,nextReading,data.lead_days,data.lead_reading,actor.id]);
    await audit(tx,actor,"create","maintenance_plan",plan.id,data);
    return plan.id;
  });
}

export async function createWorkOrder(actor: Actor, input: unknown) {
  guard(actor);
  const data = z.object({ asset_id: uuid, plan_id: optionalId, incident_id: optionalId,
    kind: z.enum(["preventiva","correctiva","neumaticos"]), title: z.string().trim().min(3).max(160),
    description: optional(1500), scheduled_for: optionalDate, blocks_asset: z.boolean().default(false) }).parse(input);
  if (data.plan_id && data.incident_id) reject("Vincule la orden a un plan o a una avería, no a ambos.");
  return transaction(async (tx) => {
    const [asset] = await tx.query("SELECT id FROM assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[data.asset_id]);
    if (!asset) reject("Activo no encontrado.");
    if (data.plan_id) {
      const [plan] = await tx.query("SELECT id FROM maintenance_plans WHERE id=$1 AND asset_id=$2 AND active=true FOR UPDATE",[data.plan_id,data.asset_id]);
      if (!plan || data.kind!=="preventiva") reject("El plan debe estar vigente y vinculado a una orden preventiva del mismo activo.");
    }
    if (data.incident_id) {
      const [incident] = await tx.query("SELECT id FROM fleet_incidents WHERE id=$1 AND asset_id=$2 AND status='abierta' FOR UPDATE",[data.incident_id,data.asset_id]);
      if (!incident || data.kind!=="correctiva") reject("Seleccione una avería abierta del mismo activo y una orden correctiva.");
    }
    const [order] = await tx.query<{id:string}>(`INSERT INTO work_orders (asset_id,plan_id,incident_id,kind,title,description,scheduled_for,blocks_asset,created_by)
      VALUES ($1,NULLIF($2,'')::uuid,NULLIF($3,'')::uuid,$4,$5,NULLIF($6,''),NULLIF($7,'')::date,$8,$9) RETURNING id`,
      [data.asset_id,data.plan_id,data.incident_id,data.kind,data.title,data.description,data.scheduled_for,data.blocks_asset||!!data.incident_id,actor.id]);
    await audit(tx,actor,"create","work_order",order.id,data);
    return order.id;
  });
}

export async function getWorkOrder(actor: Actor, id: string) {
  guard(actor);
  if (!uuid.safeParse(id).success) reject("Orden de trabajo inválida.");
  const [order] = await db.query<WorkOrder>(`SELECT w.*,a.label AS asset_label,a.code AS asset_code,u.name AS created_by_name,c.name AS closed_by_name
    FROM work_orders w JOIN assets a ON a.id=w.asset_id JOIN users u ON u.id=w.created_by LEFT JOIN users c ON c.id=w.closed_by WHERE w.id=$1`,[id]);
  if (!order) reject("Orden de trabajo no encontrada.");
  const [reservations, history] = await Promise.all([
    db.query<{id:string;quantity:string;status:string;item_name:string;unit:string;warehouse_name:string}>(`SELECT r.id,r.quantity,r.status,i.name AS item_name,i.unit,w.name AS warehouse_name
      FROM inventory_reservations r JOIN stock_items i ON i.id=r.item_id JOIN warehouses w ON w.id=r.warehouse_id WHERE r.work_order_id=$1 ORDER BY r.created_at`,[id]),
    db.query<{id:string;action:string;created_at:Date;actor_name:string}>(`SELECT e.id,e.action,e.created_at,u.name AS actor_name FROM audit_events e JOIN users u ON u.id=e.actor_id
      WHERE e.entity_type='work_order' AND e.entity_id=$1 ORDER BY e.created_at DESC,e.id DESC`,[id]),
  ]);
  return {order,reservations,history};
}

export async function startWorkOrder(actor: Actor, orderId: string) {
  guard(actor);
  const id = uuid.parse(orderId);
  await transaction(async (tx) => {
    const [order] = await tx.query<{status:string;asset_id:string;blocks_asset:boolean}>("SELECT status,asset_id,blocks_asset FROM work_orders WHERE id=$1 FOR UPDATE",[id]);
    if (!order || order.status!=="abierta") reject("Esta orden no está disponible para iniciar.");
    await tx.query("SELECT id FROM assets WHERE id=$1 FOR UPDATE",[order.asset_id]);
    await tx.query("UPDATE work_orders SET status='en_trabajo',started_at=now() WHERE id=$1",[id]);
    if (order.blocks_asset) await tx.query("UPDATE assets SET available=false WHERE id=$1",[order.asset_id]);
    await audit(tx,actor,"start","work_order",id,{status:"en_trabajo",blocks_asset:order.blocks_asset});
  });
}

export async function reserveForWorkOrder(actor: Actor, orderId: string, input: unknown) {
  guard(actor);
  const id = uuid.parse(orderId);
  const data = z.object({item_id:uuid,warehouse_id:uuid,quantity:positive,reason:note()}).parse(input);
  return transaction(async (tx) => {
    const [order] = await tx.query<{status:string}>("SELECT status FROM work_orders WHERE id=$1 FOR UPDATE",[id]);
    if (!order || !["abierta","en_trabajo"].includes(order.status)) reject("La orden ya está cerrada.");
    const [pair] = await tx.query(`SELECT i.id FROM stock_items i JOIN warehouses w ON w.id=$2
      WHERE i.id=$1 AND i.active=true AND w.active=true`,[data.item_id,data.warehouse_id]);
    if (!pair) reject("Artículo o bodega no disponible.");
    const [balance] = await tx.query(`UPDATE stock_balances SET reserved=reserved+$3 WHERE item_id=$1 AND warehouse_id=$2
      AND quantity-reserved >= $3 RETURNING reserved`,[data.item_id,data.warehouse_id,data.quantity]);
    if (!balance) reject("No hay stock libre suficiente para esta orden.");
    const [reservation] = await tx.query<{id:string}>(`INSERT INTO inventory_reservations (item_id,warehouse_id,quantity,reason,created_by,work_order_id)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,[data.item_id,data.warehouse_id,data.quantity,data.reason,actor.id,id]);
    await tx.query(`INSERT INTO inventory_movements (item_id,warehouse_id,kind,reserved_delta,note,reservation_id,created_by)
      VALUES ($1,$2,'reserva',$3,$4,$5,$6)`,[data.item_id,data.warehouse_id,data.quantity,`OT: ${data.reason}`,reservation.id,actor.id]);
    await audit(tx,actor,"reserve_parts","work_order",id,{reservation_id:reservation.id,...data});
    return reservation.id;
  });
}

export async function closeWorkOrder(actor: Actor, orderId: string, input: unknown) {
  guard(actor);
  const id = uuid.parse(orderId);
  const data = z.object({ resolution: note(1600), supplier: optional(150), labor_cost:nonnegative,parts_cost:nonnegative,
    reading: z.union([z.literal(""),nonnegative]).default("") }).parse(input);
  await transaction(async (tx) => {
    const [order] = await tx.query<{asset_id:string;plan_id:string|null;incident_id:string|null;status:string;blocks_asset:boolean}>(
      "SELECT asset_id,plan_id,incident_id,status,blocks_asset FROM work_orders WHERE id=$1 FOR UPDATE",[id]);
    if (!order || order.status!=="en_trabajo") reject("Inicie la orden antes de cerrarla.");
    const [asset] = await tx.query<{current_reading:string;reading_unit:string}>("SELECT current_reading,reading_unit FROM assets WHERE id=$1 FOR UPDATE",[order.asset_id]);
    if (data.reading!=="") await readingTx(tx,actor,order.asset_id,data.reading,"mantenimiento",id,`Cierre OT: ${data.resolution.slice(0,160)}`);
    const finalReading = data.reading==="" ? Number(asset.current_reading) : data.reading;
    const reservations = await tx.query<{id:string;item_id:string;warehouse_id:string;quantity:string}>(`SELECT id,item_id,warehouse_id,quantity
      FROM inventory_reservations WHERE work_order_id=$1 AND status='activa' ORDER BY id FOR UPDATE`,[id]);
    for (const reservation of reservations) {
      await tx.query("UPDATE stock_balances SET quantity=quantity-$3,reserved=reserved-$3 WHERE item_id=$1 AND warehouse_id=$2",
        [reservation.item_id,reservation.warehouse_id,reservation.quantity]);
      await tx.query("UPDATE inventory_reservations SET status='consumida',closed_by=$2,closed_at=now() WHERE id=$1",[reservation.id,actor.id]);
      await tx.query(`INSERT INTO inventory_movements (item_id,warehouse_id,kind,qty_delta,reserved_delta,note,reservation_id,created_by)
        VALUES ($1,$2,'consumo',$3,$3,$4,$5,$6)`,[reservation.item_id,reservation.warehouse_id,`-${reservation.quantity}`,`Consumo OT ${id.slice(0,8)}`,reservation.id,actor.id]);
      await audit(tx,actor,"consume","inventory_reservation",reservation.id,{work_order_id:id,quantity:reservation.quantity});
    }
    await tx.query(`UPDATE work_orders SET status='cerrada',closed_at=now(),closed_by=$2,resolution=$3,supplier=NULLIF($4,''),
      labor_cost=$5,parts_cost=$6,reading_at_close=$7 WHERE id=$1`,[id,actor.id,data.resolution,data.supplier,data.labor_cost,data.parts_cost,asset.reading_unit==="sin" ? null : finalReading]);
    if (order.plan_id) {
      const [plan] = await tx.query<{frequency_kind:string}>("SELECT frequency_kind FROM maintenance_plans WHERE id=$1 FOR UPDATE",[order.plan_id]);
      if (plan?.frequency_kind==="fecha") await tx.query(`UPDATE maintenance_plans SET next_due_date=(now() AT TIME ZONE 'America/Santiago')::date + interval_days WHERE id=$1`,[order.plan_id]);
      if (plan?.frequency_kind==="lectura") await tx.query("UPDATE maintenance_plans SET next_due_reading=$2+interval_reading WHERE id=$1",[order.plan_id,finalReading]);
    }
    if (order.incident_id) {
      const [incident] = await tx.query<{status:string}>("SELECT status FROM fleet_incidents WHERE id=$1 FOR UPDATE",[order.incident_id]);
      if (incident?.status==="abierta") {
        await tx.query("UPDATE fleet_incidents SET status='resuelta',resolution=$2,resolved_by=$3,resolved_at=now() WHERE id=$1",[order.incident_id,data.resolution,actor.id]);
        await audit(tx,actor,"incident_resolved","fleet_incident",order.incident_id,{work_order_id:id,resolution:data.resolution});
      }
    }
    const [incidentOpen] = await tx.query("SELECT id FROM fleet_incidents WHERE asset_id=$1 AND status='abierta' LIMIT 1",[order.asset_id]);
    const [blockingOrder] = await tx.query("SELECT id FROM work_orders WHERE asset_id=$1 AND status='en_trabajo' AND blocks_asset=true LIMIT 1",[order.asset_id]);
    await tx.query("UPDATE assets SET available=$2 WHERE id=$1",[order.asset_id,!incidentOpen&&!blockingOrder]);
    await audit(tx,actor,"close","work_order",id,{...data,consumed_reservations:reservations.map((r)=>r.id)});
  });
}

export async function cancelWorkOrder(actor: Actor, orderId: string, reason: unknown) {
  guard(actor);
  const id = uuid.parse(orderId);
  const explanation = note().parse(reason);
  await transaction(async (tx) => {
    const [order] = await tx.query<{status:string}>("SELECT status FROM work_orders WHERE id=$1 FOR UPDATE",[id]);
    if (!order || order.status!=="abierta") reject("Sólo se puede cancelar una orden aún no iniciada.");
    const [reserved] = await tx.query("SELECT id FROM inventory_reservations WHERE work_order_id=$1 AND status='activa' LIMIT 1",[id]);
    if (reserved) reject("Libere las reservas de repuestos antes de cancelar la orden.");
    await tx.query("UPDATE work_orders SET status='cancelada',resolution=$2,closed_by=$3,closed_at=now() WHERE id=$1",[id,explanation,actor.id]);
    await audit(tx,actor,"cancel","work_order",id,{reason:explanation});
  });
}

export type FuelEntry = {id:string;asset_id:string;asset_label:string;asset_code:string;driver_name:string|null;service_folio:string|null;
  fuel_date:Date|string;liters:string;cost_clp:string;reading:string;full_tank:boolean;km_per_liter:string|null;supplier:string;receipt_number:string;notes:string|null};
export async function listFuel(actor: Actor) {
  guard(actor);
  const [assets,drivers,services,entries] = await Promise.all([
    listAssets(actor),
    db.query<{id:string;name:string}>("SELECT id,name FROM users WHERE role='conductor' AND active=true ORDER BY name"),
    db.query<{id:string;folio:string;asset_id:string}>(`SELECT id,folio,assigned_asset_id AS asset_id FROM service_requests
      WHERE assigned_asset_id IS NOT NULL AND status IN ('programada','en_ruta','completada') ORDER BY created_at DESC LIMIT 200`),
    db.query<FuelEntry>(`SELECT f.*,a.label AS asset_label,a.code AS asset_code,u.name AS driver_name,s.folio AS service_folio
      FROM fuel_entries f JOIN assets a ON a.id=f.asset_id LEFT JOIN users u ON u.id=f.driver_id
      LEFT JOIN service_requests s ON s.id=f.service_id ORDER BY f.fuel_date DESC,f.created_at DESC LIMIT 300`),
  ]);
  return {assets,drivers,services,entries};
}

export async function registerFuel(actor: Actor, input: unknown) {
  guard(actor);
  const data = z.object({submission_key:uuid,asset_id:uuid,driver_id:optionalId,service_id:optionalId,
    fuel_date:date,liters:positive,cost_clp:nonnegative,reading:nonnegative,full_tank:z.boolean(),
    supplier:z.string().trim().min(2).max(160),receipt_number:z.string().trim().min(2).max(80),notes:optional(1000)}).parse(input);
  return transaction(async (tx) => {
    const [asset] = await tx.query<{reading_unit:string;current_reading:string}>("SELECT reading_unit,current_reading FROM assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[data.asset_id]);
    if (!asset || asset.reading_unit==="sin") reject("Seleccione un activo con odómetro u horómetro configurado.");
    const [previousKey] = await tx.query<{id:string}>("SELECT id FROM fuel_entries WHERE submission_key=$1",[data.submission_key]);
    if (previousKey) return previousKey.id;
    if (data.driver_id) {
      const [driver] = await tx.query("SELECT id FROM users WHERE id=$1 AND role='conductor' AND active=true",[data.driver_id]);
      if (!driver) reject("El conductor no está habilitado como usuario activo.");
    }
    if (data.service_id) {
      const [service] = await tx.query<{driver_id:string|null}>("SELECT driver_id FROM service_requests WHERE id=$1 AND assigned_asset_id=$2 AND deleted_at IS NULL",[data.service_id,data.asset_id]);
      if (!service || (data.driver_id && service.driver_id!==data.driver_id)) reject("El servicio no corresponde a este activo y conductor.");
    }
    if (data.reading < Number(asset.current_reading)) reject("El kilometraje u horómetro es menor a la lectura actual.");
    const [last] = await tx.query<{reading:string;full_tank:boolean}>(`SELECT reading,full_tank FROM fuel_entries WHERE asset_id=$1
      ORDER BY created_at DESC,id DESC LIMIT 1`,[data.asset_id]);
    let efficiency: number | null = null;
    if (asset.reading_unit==="km" && data.full_tank && last?.full_tank && data.reading>Number(last.reading)) {
      efficiency = Number(((data.reading-Number(last.reading))/data.liters).toFixed(3));
      if (efficiency<=0) efficiency=null;
    }
    const [entry] = await tx.query<{id:string}>(`INSERT INTO fuel_entries
      (submission_key,asset_id,driver_id,service_id,fuel_date,liters,cost_clp,reading,full_tank,km_per_liter,supplier,receipt_number,notes,created_by)
      VALUES ($1,$2,NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,$5,$6,$7,$8,$9,$10,$11,$12,NULLIF($13,''),$14) RETURNING id`,
      [data.submission_key,data.asset_id,data.driver_id,data.service_id,data.fuel_date,data.liters,data.cost_clp,data.reading,data.full_tank,efficiency,data.supplier,data.receipt_number,data.notes,actor.id]);
    await readingTx(tx,actor,data.asset_id,data.reading,"combustible",entry.id,`Carga de combustible ${data.receipt_number}`);
    await audit(tx,actor,"fuel","fuel_entry",entry.id,{...data,km_per_liter:efficiency});
    return entry.id;
  });
}

export async function createTire(actor: Actor, input: unknown) {
  guard(actor);
  const data = z.object({code:z.string().trim().min(2).max(45),brand:optional(90),size:optional(60)}).parse(input);
  return transaction(async (tx) => {
    const [tire] = await tx.query<{id:string}>("INSERT INTO tires (code,brand,size) VALUES ($1,NULLIF($2,''),NULLIF($3,'')) RETURNING id",[data.code.toUpperCase(),data.brand,data.size]);
    await tx.query("INSERT INTO tire_events (tire_id,kind,note,actor_id) VALUES ($1,'alta','Neumático registrado',$2)",[tire.id,actor.id]);
    await audit(tx,actor,"create","tire",tire.id,data);
    return tire.id;
  });
}

export async function moveTire(actor: Actor, tireId: string, input: unknown) {
  guard(actor);
  const id = uuid.parse(tireId);
  const data = z.object({action:z.enum(["instalar","retirar"]),asset_id:optionalId,position:optional(35),reason:note()}).parse(input);
  await transaction(async (tx) => {
    const [tire] = await tx.query<{status:string;asset_id:string|null;position:string|null}>("SELECT status,asset_id,position FROM tires WHERE id=$1 FOR UPDATE",[id]);
    if (!tire) reject("Neumático no encontrado.");
    if (data.action==="instalar") {
      if (tire.status==="retirado" || !data.asset_id || !data.position) reject("Seleccione un neumático disponible, activo y posición.");
      if (tire.asset_id===data.asset_id && tire.position===data.position) reject("Ya está instalado en esa posición.");
      const [asset] = await tx.query<{current_reading:string}>("SELECT current_reading FROM assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[data.asset_id]);
      if (!asset) reject("Activo no encontrado.");
      const [occupied] = await tx.query("SELECT id FROM tires WHERE asset_id=$1 AND position=$2 AND status='instalado' AND id<>$3",[data.asset_id,data.position,id]);
      if (occupied) reject("La posición ya está ocupada por otro neumático.");
      await tx.query("UPDATE tires SET status='instalado',asset_id=$2,position=$3 WHERE id=$1",[id,data.asset_id,data.position]);
      await tx.query(`INSERT INTO tire_events (tire_id,kind,asset_id,position,reading,note,actor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id,tire.status==="instalado" ? "rotacion" : "instalacion",data.asset_id,data.position,asset.current_reading,data.reason,actor.id]);
    } else {
      if (tire.status!=="instalado") reject("Sólo puede retirar un neumático instalado.");
      await tx.query("UPDATE tires SET status='disponible',asset_id=NULL,position=NULL WHERE id=$1",[id]);
      await tx.query("INSERT INTO tire_events (tire_id,kind,asset_id,position,note,actor_id) VALUES ($1,'retiro',$2,$3,$4,$5)",
        [id,tire.asset_id,tire.position,data.reason,actor.id]);
    }
    await audit(tx,actor,"move","tire",id,{before:tire,...data});
  });
}
