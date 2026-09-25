import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { Actor } from "./auth";
import { canManage, canPlan, canReadService, canWorkService } from "./auth";
import { db, transaction, type Db } from "./db";
import { hashPassword } from "./password";
import { findMissingRequirements } from "./personnel";

const uuid = z.uuid();
const required = (max = 180) => z.string().trim().min(2).max(max);
const optional = (max = 1000) => z.string().trim().max(max).optional().default("");
const positive = z.coerce.number().positive().max(100_000_000);
const statusName: Record<string, string> = {
  solicitada: "Solicitada", programada: "Programada", en_ruta: "En ruta", completada: "Completada", cancelada: "Cancelada",
};
export { statusName };

export class PilotError extends Error {}
function reject(message: string): never { throw new PilotError(message); }
function needManage(actor: Actor) { if (!canManage(actor)) reject("No tiene permiso para administrar maestros."); }

export type ServiceRow = {
  id: string; folio: string; client_id: string; site_id: string; client_name: string; site_name: string;
  service_type: string; waste_type: string; estimated_kg: string | null; origin: string; destination: string;
  priority: string; scheduled_for: Date | null; status: string; notes: string | null;
  assigned_asset_id: string | null; ramp_asset_id: string | null; driver_id: string | null;
  asset_label: string | null; ramp_label: string | null; driver_name: string | null;
  guide_number: string | null; gross_kg: string | null; tare_kg: string | null;
  created_at: Date; updated_at: Date;
};

const serviceSelect = `SELECT s.*, c.name AS client_name, cs.name AS site_name,
  a.label AS asset_label, r.label AS ramp_label, u.name AS driver_name
  FROM service_requests s JOIN clients c ON c.id = s.client_id
  JOIN client_sites cs ON cs.id = s.site_id
  LEFT JOIN assets a ON a.id = s.assigned_asset_id
  LEFT JOIN assets r ON r.id = s.ramp_asset_id
  LEFT JOIN users u ON u.id = s.driver_id`;

export async function listServices(actor: Actor, term = "", state = "") {
  const q = term.trim().slice(0, 100);
  return db.query<ServiceRow>(
    `${serviceSelect} WHERE s.deleted_at IS NULL
     AND ($1::text = '' OR c.name ILIKE '%' || $1 || '%' OR s.waste_type ILIKE '%' || $1 || '%' OR s.folio::text = $1)
     AND ($2::text = '' OR s.status = $2)
     AND ($3::text <> 'cliente' OR s.client_id = $4::uuid)
     AND ($3::text <> 'conductor' OR s.driver_id = $5::uuid)
     ORDER BY s.created_at DESC, s.folio DESC LIMIT 100`,
    [q, state, actor.role, actor.client_id, actor.id],
  );
}

export type AgendaService = {
  id: string; folio: string; client_name: string; site_name: string; origin: string; destination: string;
  waste_type: string; scheduled_for: Date; asset_label: string | null; driver_name: string | null; status: string;
};

export async function listAgenda(actor: Actor, firstDay: string, dayAfterLast: string) {
  if (![firstDay, dayAfterLast].every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)) || firstDay >= dayAfterLast) reject("Rango de agenda inválido.");
  return db.query<AgendaService>(
    `SELECT s.id,s.folio,c.name AS client_name,cs.name AS site_name,s.origin,s.destination,s.waste_type,
      s.scheduled_for,a.label AS asset_label,u.name AS driver_name,s.status
     FROM service_requests s JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
     LEFT JOIN assets a ON a.id=s.assigned_asset_id LEFT JOIN users u ON u.id=s.driver_id
     WHERE s.deleted_at IS NULL AND s.status IN ('programada','en_ruta')
       AND (s.scheduled_for AT TIME ZONE 'America/Santiago')::date >= $1::date
       AND (s.scheduled_for AT TIME ZONE 'America/Santiago')::date < $2::date
       AND ($3::text <> 'cliente' OR s.client_id=$4::uuid)
       AND ($3::text <> 'conductor' OR s.driver_id=$5::uuid)
     ORDER BY s.scheduled_for,s.folio LIMIT 300`,
    [firstDay, dayAfterLast, actor.role, actor.client_id, actor.id],
  );
}

export type ReportFilters = { from: string; to: string; status: string; client_id: string };
export type ReportService = {
  id: string; folio: string; client_name: string; site_name: string; service_type: string; waste_type: string;
  status: string; origin: string; destination: string; scheduled_for: Date | null; created_at: Date;
  asset_label: string | null; driver_name: string | null; estimated_kg: string | null; gross_kg: string | null; tare_kg: string | null;
};

export function normalizeReportFilters(input: Partial<Record<keyof ReportFilters,string>>): ReportFilters {
  const date = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value ? value : "";
  };
  return {
    from: date(input.from), to: date(input.to),
    status: input.status && Object.hasOwn(statusName,input.status) ? input.status : "",
    client_id: uuid.safeParse(input.client_id).success ? input.client_id! : "",
  };
}

export async function reportServices(actor: Actor, filters: ReportFilters) {
  return db.query<ReportService>(
    `SELECT s.id,s.folio,c.name AS client_name,cs.name AS site_name,s.service_type,s.waste_type,
       s.status,s.origin,s.destination,s.scheduled_for,s.created_at,a.label AS asset_label,u.name AS driver_name,
       s.estimated_kg,s.gross_kg,s.tare_kg
     FROM service_requests s JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
     LEFT JOIN assets a ON a.id=s.assigned_asset_id LEFT JOIN users u ON u.id=s.driver_id
     WHERE s.deleted_at IS NULL
       AND ($1::text='' OR (s.created_at AT TIME ZONE 'America/Santiago')::date >= NULLIF($1,'')::date)
       AND ($2::text='' OR (s.created_at AT TIME ZONE 'America/Santiago')::date <= NULLIF($2,'')::date)
       AND ($3::text='' OR s.status=$3)
       AND ($4::text<>'cliente' OR s.client_id=$5::uuid)
       AND ($4::text<>'conductor' OR s.driver_id=$6::uuid)
       AND ($7::text='' OR s.client_id=NULLIF($7,'')::uuid)
     ORDER BY s.created_at DESC,s.folio DESC LIMIT 1001`,
    [filters.from,filters.to,filters.status,actor.role,actor.client_id,actor.id,filters.client_id],
  );
}

export async function getService(actor: Actor, id: string) {
  if (!uuid.safeParse(id).success) reject("Folio inválido.");
  const [service] = await db.query<ServiceRow>(`${serviceSelect} WHERE s.id = $1 AND s.deleted_at IS NULL`, [id]);
  if (!service || !canReadService(actor, service)) reject("Servicio no encontrado o sin acceso.");
  return service;
}

async function event(tx: Db, serviceId: string, actor: Actor, kind: string, description: string, previous: unknown = null, next: unknown = null) {
  await tx.query(
    "INSERT INTO service_events (service_id, actor_id, kind, description, previous_value, next_value) VALUES ($1,$2,$3,$4,$5,$6)",
    [serviceId, actor.id, kind, description, previous === null ? null : JSON.stringify(previous), next === null ? null : JSON.stringify(next)],
  );
  await tx.query(
    "INSERT INTO audit_events (actor_id, action, entity_type, entity_id, previous_value, next_value) VALUES ($1,$2,'service_request',$3,$4,$5)",
    [actor.id, kind, serviceId, previous === null ? null : JSON.stringify(previous), next === null ? null : JSON.stringify(next)],
  );
}

export async function createClient(actor: Actor, input: unknown) {
  needManage(actor);
  const data = z.object({ name: required(), tax_id: optional(20), contact_name: optional(120) }).parse(input);
  return transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      "INSERT INTO clients (name, tax_id, contact_name) VALUES ($1, NULLIF($2,''), NULLIF($3,'')) RETURNING id",
      [data.name, data.tax_id, data.contact_name],
    );
    await tx.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id, next_value) VALUES ($1,'create','client',$2,$3)", [actor.id, row.id, JSON.stringify({ name: data.name })]);
    return row.id;
  });
}

export async function createSite(actor: Actor, input: unknown) {
  needManage(actor);
  const data = z.object({ client_id: uuid, name: required(), address: optional(250) }).parse(input);
  const [client] = await db.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL", [data.client_id]);
  if (!client) reject("Seleccione un cliente activo.");
  return transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      "INSERT INTO client_sites (client_id, name, address) VALUES ($1,$2,NULLIF($3,'')) RETURNING id",
      [data.client_id, data.name, data.address],
    );
    await tx.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id, next_value) VALUES ($1,'create','client_site',$2,$3)", [actor.id, row.id, JSON.stringify({ name: data.name, client_id: data.client_id })]);
    return row.id;
  });
}

export async function createAsset(actor: Actor, input: unknown) {
  needManage(actor);
  const data = z.object({ code: required(30), label: required(120), kind: z.enum(["camion", "rampa", "equipo"]), plate: optional(15) }).parse(input);
  return transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      "INSERT INTO assets (code, label, kind, plate) VALUES ($1,$2,$3,NULLIF($4,'')) RETURNING id",
      [data.code.toUpperCase(), data.label, data.kind, data.plate.toUpperCase()],
    );
    await tx.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id, next_value) VALUES ($1,'create','asset',$2,$3)", [actor.id, row.id, JSON.stringify({ code: data.code, kind: data.kind })]);
    return row.id;
  });
}

export async function createUser(actor: Actor, input: unknown) {
  if (actor.role !== "admin") reject("Sólo administración puede crear cuentas.");
  const data = z.object({
    name: required(120), email: z.email().transform((v) => v.trim().toLowerCase()),
    password: z.string().min(12).max(128), role: z.enum(["admin", "operaciones", "conductor", "cliente"]),
    client_id: z.union([uuid, z.literal("")]).default(""),
  }).parse(input);
  if (data.role === "cliente" && !data.client_id) reject("Asigne un cliente a esta cuenta.");
  if (data.role !== "cliente" && data.client_id) reject("Sólo la cuenta de cliente admite vínculo con un cliente.");
  const hash = await hashPassword(data.password);
  return transaction(async (tx) => {
    const [admin]=await tx.query<{id:string}>("SELECT id FROM users WHERE id=$1 AND role='admin' AND active=true FOR UPDATE",[actor.id]);
    if(!admin)reject("Su acceso de administración ya no está activo.");
    if(data.client_id){
      const [client]=await tx.query<{id:string}>("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.client_id]);
      if(!client)reject("Seleccione un cliente activo para esta cuenta.");
    }
    const [row] = await tx.query<{ id: string }>(
      "INSERT INTO users (name,email,password_hash,role,client_id) VALUES ($1,$2,$3,$4,NULLIF($5,'')::uuid) RETURNING id",
      [data.name, data.email, hash, data.role, data.client_id],
    );
    await tx.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id, next_value) VALUES ($1,'create','user',$2,$3)", [actor.id, row.id, JSON.stringify({ role: data.role, client_id: data.client_id || null })]);
    return row.id;
  });
}

const createSchema = z.object({
  submission_key: uuid, client_id: uuid, site_id: uuid,
  service_type: z.enum(["retiro", "traslado", "compra", "venta", "otro"]),
  waste_type: required(120), estimated_kg: z.union([positive, z.literal("")]).optional(),
  origin: required(250), destination: required(250),
  priority: z.enum(["normal", "alta", "critica"]), notes: optional(2000),
});

export async function createService(actor: Actor, input: unknown) {
  if (actor.role === "conductor") reject("Su perfil no puede crear solicitudes.");
  const data = createSchema.parse(input);
  if (actor.role === "cliente" && actor.client_id !== data.client_id) reject("No puede crear solicitudes para otro cliente.");
  return transaction(async (tx) => {
    const [site] = await tx.query("SELECT id FROM client_sites WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL", [data.site_id, data.client_id]);
    if (!site) reject("El centro no pertenece al cliente seleccionado.");
    const [created] = await tx.query<{ id: string }>(
      `INSERT INTO service_requests
       (submission_key, client_id, site_id, service_type, waste_type, estimated_kg, origin, destination, priority, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),$11)
       ON CONFLICT (submission_key) DO NOTHING RETURNING id`,
      [data.submission_key, data.client_id, data.site_id, data.service_type, data.waste_type,
        data.estimated_kg === "" || data.estimated_kg === undefined ? null : data.estimated_kg,
        data.origin, data.destination, data.priority, data.notes, actor.id],
    );
    if (!created) {
      const [original] = await tx.query<{ id: string; created_by: string }>("SELECT id, created_by FROM service_requests WHERE submission_key = $1", [data.submission_key]);
      if (original?.created_by !== actor.id) reject("Esta solicitud pertenece a otro usuario.");
      return original.id;
    }
    await event(tx, created.id, actor, "solicitud_creada", "Solicitud registrada", null, { status: "solicitada" });
    return created.id;
  });
}

function parseChileDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) reject("Indique fecha y hora de planificación.");
  const wall = new Date(`${value}:00Z`);
  if (Number.isNaN(wall.getTime())) reject("Fecha inválida.");
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  let instant = wall.getTime();
  for (let i = 0; i < 3; i++) {
    const fields = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const shown = Date.UTC(+fields.year, +fields.month - 1, +fields.day, +fields.hour, +fields.minute);
    instant -= shown - wall.getTime();
  }
  const check = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  const restored = `${check.year}-${check.month}-${check.day}T${check.hour}:${check.minute}`;
  if (restored !== value) reject("Esta hora no existe en la zona horaria de Chile. Seleccione otra.");
  return new Date(instant);
}

export async function assignService(actor: Actor, id: string, input: unknown) {
  if (!canPlan(actor)) reject("No tiene permiso para planificar servicios.");
  const data = z.object({ asset_id: uuid, ramp_asset_id: z.union([uuid,z.literal("")]).default(""), driver_id: uuid, scheduled_for: z.string(), guide_number: optional(50) }).parse(input);
  const date = parseChileDate(data.scheduled_for);
  return transaction(async (tx) => {
    const [service] = await tx.query<{ status: string; client_id:string; site_id:string; assigned_asset_id: string | null; ramp_asset_id: string | null; driver_id: string | null }>(
      "SELECT status, client_id, site_id, assigned_asset_id, ramp_asset_id, driver_id FROM service_requests WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id],
    );
    if (!service || !["solicitada", "programada"].includes(service.status)) reject("La solicitud no está disponible para planificación.");
    // Lock the shared resources before checking collisions so concurrent planners serialize.
    const [asset] = await tx.query("SELECT id FROM assets WHERE id = $1 AND kind='camion' AND available = true AND deleted_at IS NULL FOR UPDATE", [data.asset_id]);
    const [ramp] = data.ramp_asset_id ? await tx.query("SELECT id FROM assets WHERE id=$1 AND kind='rampa' AND available=true AND deleted_at IS NULL FOR UPDATE", [data.ramp_asset_id]) : [];
    const [driver] = await tx.query("SELECT id FROM users WHERE id = $1 AND role = 'conductor' AND active = true FOR UPDATE", [data.driver_id]);
    if (!asset || !driver || (data.ramp_asset_id && !ramp)) reject("Seleccione un camión, una rampa opcional disponible y un conductor activo.");
    const missing = await findMissingRequirements(tx,data.driver_id,service.client_id,service.site_id);
    if (missing.length) reject(`El conductor no cumple la acreditación de esta faena: ${missing.join(", ")}. Revise Personal.`);
    const [collision] = await tx.query(
      `SELECT id FROM service_requests WHERE id <> $1 AND deleted_at IS NULL AND status IN ('programada','en_ruta')
       AND scheduled_for BETWEEN $2::timestamptz - interval '4 hours' AND $2::timestamptz + interval '4 hours'
       AND (assigned_asset_id = $3 OR driver_id = $4 OR ($5::text <> '' AND ramp_asset_id = NULLIF($5,'')::uuid)) LIMIT 1`,
      [id, date, data.asset_id, data.driver_id, data.ramp_asset_id],
    );
    if (collision) reject("El camión, la rampa o el conductor ya tiene otra asignación cercana a este horario.");
    await tx.query(
      `UPDATE service_requests SET assigned_asset_id=$2, driver_id=$3, scheduled_for=$4,
       guide_number=NULLIF($5,''), ramp_asset_id=NULLIF($6,'')::uuid, status='programada', updated_at=now() WHERE id=$1`,
      [id, data.asset_id, data.driver_id, date, data.guide_number, data.ramp_asset_id],
    );
    await event(tx, id, actor, "planificacion", "Recursos y fecha asignados", { status: service.status, asset_id: service.assigned_asset_id, ramp_asset_id: service.ramp_asset_id, driver_id: service.driver_id },
      { status: "programada", scheduled_for: date.toISOString(), asset_id: data.asset_id, ramp_asset_id: data.ramp_asset_id || null, driver_id: data.driver_id });
  });
}

export async function cancelService(actor: Actor, id: string, reason: string) {
  if (!canPlan(actor)) reject("Sólo operaciones puede cancelar una solicitud.");
  const explanation = z.string().trim().min(5).max(500).parse(reason);
  return transaction(async (tx) => {
    const [service] = await tx.query<{ status: string }>("SELECT status FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id]);
    if (!service || !["solicitada", "programada"].includes(service.status)) reject("Este servicio ya está en ejecución o no puede cancelarse.");
    await tx.query("UPDATE service_requests SET status='cancelada',updated_at=now() WHERE id=$1", [id]);
    await event(tx, id, actor, "cancelacion", `Solicitud cancelada: ${explanation}`, { status: service.status }, { status: "cancelada", reason: explanation });
  });
}

export type FleetAsset = { id: string; code: string; label: string; kind: string; plate: string | null; available: boolean; open_incidents: string; current_reading: string; reading_unit: string };
export type FleetIncident = { id: string; asset_id: string; asset_label: string; code: string; description: string; severity: string; reported_at: Date; reported_by_name: string };

export async function listFleet(actor: Actor) {
  if (!canManage(actor)) reject("No tiene permiso para revisar flota y averías.");
  const [assets, incidents] = await Promise.all([
    db.query<FleetAsset>(`SELECT a.id,a.code,a.label,a.kind,a.plate,a.available,a.current_reading,a.reading_unit,count(i.id)::text AS open_incidents
      FROM assets a LEFT JOIN fleet_incidents i ON i.asset_id=a.id AND i.status='abierta'
      WHERE a.deleted_at IS NULL GROUP BY a.id ORDER BY a.kind,a.label`),
    db.query<FleetIncident>(`SELECT i.id,i.asset_id,i.description,i.severity,i.reported_at,a.label AS asset_label,a.code,u.name AS reported_by_name
      FROM fleet_incidents i JOIN assets a ON a.id=i.asset_id JOIN users u ON u.id=i.reported_by
      WHERE i.status='abierta' ORDER BY i.reported_at DESC LIMIT 100`),
  ]);
  return { assets, incidents };
}

export async function reportFleetIncident(actor: Actor, input: unknown) {
  needManage(actor);
  const data = z.object({ asset_id: uuid, description: z.string().trim().min(5).max(1000), severity: z.enum(["baja","media","alta","critica"]) }).parse(input);
  return transaction(async (tx) => {
    const [asset] = await tx.query("SELECT id FROM assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [data.asset_id]);
    if (!asset) reject("Seleccione un activo registrado.");
    const [created] = await tx.query<{ id: string }>(
      "INSERT INTO fleet_incidents (asset_id,description,severity,reported_by) VALUES ($1,$2,$3,$4) RETURNING id",
      [data.asset_id,data.description,data.severity,actor.id],
    );
    await tx.query("UPDATE assets SET available=false WHERE id=$1", [data.asset_id]);
    await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'incident_reported','fleet_incident',$2,$3)",
      [actor.id,created.id,JSON.stringify(data)]);
    return created.id;
  });
}

export async function resolveFleetIncident(actor: Actor, id: string, resolution: string) {
  needManage(actor);
  const incidentId = uuid.parse(id);
  const explanation = z.string().trim().min(5).max(1000).parse(resolution);
  return transaction(async (tx) => {
    const [incident] = await tx.query<{ asset_id: string; status: string }>("SELECT asset_id,status FROM fleet_incidents WHERE id=$1 FOR UPDATE", [incidentId]);
    if (!incident || incident.status !== "abierta") reject("La avería no está abierta.");
    const [activeOrder] = await tx.query("SELECT id FROM work_orders WHERE incident_id=$1 AND status IN ('abierta','en_trabajo') LIMIT 1",[incidentId]);
    if (activeOrder) reject("La avería tiene una orden de trabajo abierta. Ciérrela o cancele primero esa orden.");
    await tx.query("SELECT id FROM assets WHERE id=$1 FOR UPDATE", [incident.asset_id]);
    await tx.query("UPDATE fleet_incidents SET status='resuelta',resolution=$2,resolved_by=$3,resolved_at=now() WHERE id=$1", [incidentId,explanation,actor.id]);
    const [open] = await tx.query("SELECT id FROM fleet_incidents WHERE asset_id=$1 AND status='abierta' LIMIT 1", [incident.asset_id]);
    const [blocking] = await tx.query("SELECT id FROM work_orders WHERE asset_id=$1 AND status='en_trabajo' AND blocks_asset=true LIMIT 1",[incident.asset_id]);
    if (!open && !blocking) await tx.query("UPDATE assets SET available=true WHERE id=$1", [incident.asset_id]);
    await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'incident_resolved','fleet_incident',$2,$3)",
      [actor.id,incidentId,JSON.stringify({ resolution: explanation, available: !open && !blocking })]);
  });
}

export async function saveChecklist(actor: Actor, id: string, input: unknown) {
  const data = z.object({
    vehicle_ok: z.boolean(), documents_ok: z.boolean(), containment_ok: z.boolean(), ppe_ok: z.boolean(), comment: optional(1000),
  }).parse(input);
  return transaction(async (tx) => {
    const [service] = await tx.query<{ status: string; driver_id: string | null }>(
      "SELECT status, driver_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id],
    );
    if (!service || !canWorkService(actor, service)) reject("No tiene acceso a este checklist.");
    if (service.status !== "programada") reject("El checklist se registra antes de iniciar la ruta.");
    const [previous] = await tx.query("SELECT vehicle_ok, documents_ok, containment_ok, ppe_ok, comment FROM service_checklists WHERE service_id=$1", [id]);
    await tx.query(
      `INSERT INTO service_checklists (service_id, vehicle_ok, documents_ok, containment_ok, ppe_ok, comment, completed_by)
       VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7)
       ON CONFLICT (service_id) DO UPDATE SET vehicle_ok=$2, documents_ok=$3, containment_ok=$4,
       ppe_ok=$5, comment=NULLIF($6,''), completed_by=$7, completed_at=now()`,
      [id, data.vehicle_ok, data.documents_ok, data.containment_ok, data.ppe_ok, data.comment, actor.id],
    );
    await event(tx, id, actor, "checklist", "Checklist previo actualizado", previous ?? null, data);
  });
}

export async function startService(actor: Actor, id: string) {
  return transaction(async (tx) => {
    const [service] = await tx.query<{ status: string; driver_id: string | null; client_id:string; site_id:string }>(
      "SELECT status, driver_id, client_id, site_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id],
    );
    if (!service || !canWorkService(actor, service)) reject("No tiene acceso a esta ruta.");
    if (service.status !== "programada") reject("Sólo se puede iniciar un servicio programado.");
    if (!service.driver_id) reject("El servicio no tiene un conductor asignado.");
    const missing=await findMissingRequirements(tx,service.driver_id,service.client_id,service.site_id);
    if(missing.length) reject(`La acreditación del conductor venció o está pendiente: ${missing.join(", ")}. Revise Personal.`);
    const [resources] = await tx.query<{ truck_available: boolean; ramp_available: boolean }>(
      `SELECT a.available AS truck_available,COALESCE(r.available,true) AS ramp_available
       FROM service_requests s JOIN assets a ON a.id=s.assigned_asset_id
       LEFT JOIN assets r ON r.id=s.ramp_asset_id WHERE s.id=$1`, [id],
    );
    if (!resources?.truck_available || !resources.ramp_available) reject("El camión o la rampa tiene una avería activa. Revise el despacho antes de iniciar la ruta.");
    const [check] = await tx.query<{ vehicle_ok: boolean; documents_ok: boolean; containment_ok: boolean; ppe_ok: boolean }>(
      "SELECT vehicle_ok, documents_ok, containment_ok, ppe_ok FROM service_checklists WHERE service_id=$1", [id],
    );
    if (!check || ![check.vehicle_ok, check.documents_ok, check.containment_ok, check.ppe_ok].every(Boolean)) {
      reject("Complete las cuatro verificaciones del checklist antes de iniciar.");
    }
    await tx.query("UPDATE service_requests SET status='en_ruta', started_at=now(), updated_at=now() WHERE id=$1", [id]);
    await event(tx, id, actor, "ruta_iniciada", "Servicio iniciado", { status: "programada" }, { status: "en_ruta" });
  });
}

export async function finishService(actor: Actor, id: string, input: unknown) {
  const data = z.object({ gross_kg: positive, tare_kg: z.coerce.number().min(0), guide_number: optional(50) }).parse(input);
  if (data.gross_kg < data.tare_kg) reject("El peso bruto no puede ser inferior a la tara.");
  return transaction(async (tx) => {
    const [service] = await tx.query<{ status: string; driver_id: string | null }>(
      "SELECT status, driver_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id],
    );
    if (!service || !canWorkService(actor, service)) reject("No tiene acceso a este servicio.");
    if (service.status !== "en_ruta") reject("Sólo se puede cerrar un servicio en ruta.");
    const [evidence] = await tx.query("SELECT id FROM service_evidence WHERE service_id=$1 AND storage_key IS NOT NULL LIMIT 1", [id]);
    if (!evidence) reject("Adjunte al menos una fotografía o documento antes de cerrar.");
    await tx.query(
      `UPDATE service_requests SET status='completada', gross_kg=$2, tare_kg=$3,
       guide_number=COALESCE(NULLIF($4,''),guide_number), closed_at=now(), updated_at=now() WHERE id=$1`,
      [id, data.gross_kg, data.tare_kg, data.guide_number],
    );
    await event(tx, id, actor, "servicio_cerrado", "Servicio completado y pesaje registrado",
      { status: "en_ruta" }, { status: "completada", gross_kg: data.gross_kg, tare_kg: data.tare_kg, net_kg: data.gross_kg - data.tare_kg });
  });
}

function detectMime(bytes: Buffer) {
  if (bytes.subarray(0, 4).toString() === "%PDF") return { mime: "application/pdf", extension: ".pdf" };
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", extension: ".png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: ".jpg" };
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return { mime: "image/webp", extension: ".webp" };
  reject("Adjunte un archivo PDF, PNG, JPG o WebP válido.");
}

export async function addEvidence(actor: Actor, id: string, description: string, file: File) {
  const descriptionSafe = required(500).parse(description);
  const maxMb=process.env.VERCEL?4:5;
  if (!file || file.size < 1 || file.size > maxMb * 1024 * 1024) reject(`El archivo debe pesar entre 1 byte y ${maxMb} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = detectMime(bytes);
  const service = await getService(actor, id);
  if (!canWorkService(actor, service) || !["programada", "en_ruta"].includes(service.status)) reject("No se puede incorporar evidencia en este estado.");
  const databaseStorage=process.env.EVIDENCE_STORAGE==="database";
  if(process.env.NODE_ENV==="production"&&databaseStorage&&!process.env.DATABASE_URL)
    reject("Configure PostgreSQL antes de guardar evidencias en producción.");
  if(process.env.NODE_ENV==="production"&&!databaseStorage&&(!process.env.STORAGE_DIR||process.env.VERCEL))
    reject("Configure almacenamiento persistente: EVIDENCE_STORAGE=database o un volumen privado.");
  const dir=databaseStorage?null:resolve(process.cwd(),process.env.STORAGE_DIR||".local/archivos");
  const key = `${randomUUID()}${kind.extension}`;
  if(dir){
    await mkdir(dir,{recursive:true,mode:0o700});
    await writeFile(resolve(dir,key),bytes,{flag:"wx",mode:0o600});
  }
  try {
    return await transaction(async (tx) => {
      const [current] = await tx.query<{ status: string; driver_id: string | null }>(
        "SELECT status, driver_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id],
      );
      if (!current || !canWorkService(actor, current) || !["programada", "en_ruta"].includes(current.status)) reject("El servicio cambió de estado. Intente nuevamente.");
      const [evidence] = await tx.query<{ id: string }>(
        `INSERT INTO service_evidence (service_id, description, storage_key, original_filename, mime_type, size_bytes, created_by, file_content)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [id,descriptionSafe,key,file.name.slice(0,160),kind.mime,file.size,actor.id,databaseStorage?bytes:null],
      );
      await event(tx, id, actor, "evidencia", `Evidencia incorporada: ${descriptionSafe}`, null, { evidence_id: evidence.id });
      return evidence.id;
    });
  } catch (error) {
    if(dir)await unlink(resolve(dir,key)).catch(()=>undefined);
    throw error;
  }
}
