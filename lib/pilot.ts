import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { Actor } from "./auth";
import { canManage, canPlan, canReadService, canWorkService } from "./auth";
import { db, transaction, type Db } from "./db";
import { hashPassword } from "./password";
import { findMissingExternalRequirements, findMissingRequirements } from "./personnel";
import type { Company } from "./companies";
import {catalogName} from "./material-stock";

const uuid = z.uuid();
const required = (max = 180) => z.string().trim().min(2).max(max);
const optional = (max = 1000) => z.string().trim().max(max).optional().default("");
const positive = z.coerce.number().positive().max(100_000_000);
const statusName: Record<string, string> = {
  solicitada: "Solicitada", programada: "Programada", en_ruta: "En ruta", pendiente_revision: "Revisión administrativa", completada: "Completada", cancelada: "Cancelada",
};
export { statusName };

export class PilotError extends Error {}
function reject(message: string): never { throw new PilotError(message); }
function needManage(actor: Actor) { if (!canManage(actor)) reject("No tiene permiso para administrar maestros."); }

export type ServiceRow = {
  id: string; folio: string; client_id: string; site_id: string; client_name: string; site_name: string;
  operating_company: Company | null; quote_id: string | null;
  request_category:string;service_type: string; waste_type: string; estimated_kg: string | null; origin: string; destination: string;
  rental_from:Date|string|null;rental_to:Date|string|null;
  priority: string; scheduled_for: Date | null; status: string; notes: string | null;
  assigned_asset_id: string | null; ramp_asset_id: string | null; driver_id: string | null; external_driver_id: string | null;
  asset_label: string | null; ramp_label: string | null; driver_name: string | null;
  external_driver_tax_id: string | null; external_driver_company: string | null;
  guide_number: string | null; gross_kg: string | null; tare_kg: string | null;
  created_at: Date; updated_at: Date;
};

const serviceSelect = `SELECT s.*, c.name AS client_name, cs.name AS site_name,
  CASE WHEN a.plate IS NOT NULL AND trim(a.plate)<>'' THEN a.plate || ' · ' || a.label ELSE a.label END AS asset_label,
  CASE WHEN r.plate IS NOT NULL AND trim(r.plate)<>'' THEN r.plate || ' · ' || r.label ELSE r.label END AS ramp_label,
  COALESCE(u.name,ed.name) AS driver_name,ed.tax_id AS external_driver_tax_id,ed.company_name AS external_driver_company
  FROM service_requests s JOIN clients c ON c.id = s.client_id
  JOIN client_sites cs ON cs.id = s.site_id
  LEFT JOIN assets a ON a.id = s.assigned_asset_id
  LEFT JOIN assets r ON r.id = s.ramp_asset_id
  LEFT JOIN users u ON u.id = s.driver_id
  LEFT JOIN external_drivers ed ON ed.id = s.external_driver_id`;

export async function listServices(actor: Actor, term = "", state = "", company = "", type = "") {
  const q = term.trim().slice(0, 100);
  const kind=["retiro","traslado","arriendo","compra","venta","otro"].includes(type)?type:"";
  return db.query<ServiceRow>(
    `${serviceSelect} WHERE s.deleted_at IS NULL
     AND ($1::text = '' OR c.name ILIKE '%' || $1 || '%' OR s.waste_type ILIKE '%' || $1 || '%' OR s.folio::text = $1)
     AND ($2::text = '' OR s.status = $2)
     AND ($3::text <> 'cliente' OR s.client_id = $4::uuid)
     AND ($3::text <> 'conductor' OR s.driver_id = $5::uuid)
     AND ($6::text = '' OR ($6 = 'pendiente' AND s.operating_company IS NULL) OR s.operating_company = $6)
     AND ($7::text = '' OR s.service_type = $7)
     ORDER BY s.created_at DESC, s.folio DESC LIMIT 100`,
    [q, state, actor.role, actor.client_id, actor.id, company,kind],
  );
}

export type AgendaService = {
  id: string; folio: string; client_name: string; site_name: string; origin: string; destination: string;
  operating_company:Company|null;
  waste_type: string; scheduled_for: Date; asset_label: string | null; driver_name: string | null; status: string;
};

export async function listAgenda(actor: Actor, firstDay: string, dayAfterLast: string, company = "") {
  if (![firstDay, dayAfterLast].every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)) || firstDay >= dayAfterLast) reject("Rango de agenda inválido.");
  return db.query<AgendaService>(
    `SELECT s.id,s.folio,s.operating_company,c.name AS client_name,cs.name AS site_name,s.origin,s.destination,s.waste_type,
      s.scheduled_for,CASE WHEN a.plate IS NOT NULL AND trim(a.plate)<>'' THEN a.plate || ' · ' || a.label ELSE a.label END AS asset_label,
      COALESCE(u.name,ed.name) AS driver_name,s.status
     FROM service_requests s JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
     LEFT JOIN assets a ON a.id=s.assigned_asset_id LEFT JOIN users u ON u.id=s.driver_id
     LEFT JOIN external_drivers ed ON ed.id=s.external_driver_id
     WHERE s.deleted_at IS NULL AND s.status IN ('programada','en_ruta')
       AND (s.scheduled_for AT TIME ZONE 'America/Santiago')::date >= $1::date
       AND (s.scheduled_for AT TIME ZONE 'America/Santiago')::date < $2::date
       AND ($3::text <> 'cliente' OR s.client_id=$4::uuid)
       AND ($3::text <> 'conductor' OR s.driver_id=$5::uuid)
       AND ($6::text='' OR s.operating_company=$6)
     ORDER BY s.scheduled_for,s.folio LIMIT 300`,
    [firstDay, dayAfterLast, actor.role, actor.client_id, actor.id, company],
  );
}

export type ReportFilters = { from: string; to: string; status: string; client_id: string; company: string };
export type ReportService = {
  id: string; folio: string; client_name: string; site_name: string; service_type: string; waste_type: string;
  operating_company: Company | null;
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
    company: ["rerchar", "e_y_j", "pendiente"].includes(input.company ?? "") ? input.company! : "",
  };
}

export async function reportServices(actor: Actor, filters: ReportFilters) {
  return db.query<ReportService>(
    `SELECT s.id,s.folio,s.operating_company,c.name AS client_name,cs.name AS site_name,s.service_type,s.waste_type,
       s.status,s.origin,s.destination,s.scheduled_for,s.created_at,a.label AS asset_label,COALESCE(u.name,ed.name) AS driver_name,
       s.estimated_kg,s.gross_kg,s.tare_kg
     FROM service_requests s JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
     LEFT JOIN assets a ON a.id=s.assigned_asset_id LEFT JOIN users u ON u.id=s.driver_id
     LEFT JOIN external_drivers ed ON ed.id=s.external_driver_id
     WHERE s.deleted_at IS NULL
       AND ($1::text='' OR (s.created_at AT TIME ZONE 'America/Santiago')::date >= NULLIF($1,'')::date)
       AND ($2::text='' OR (s.created_at AT TIME ZONE 'America/Santiago')::date <= NULLIF($2,'')::date)
       AND ($3::text='' OR s.status=$3)
       AND ($4::text<>'cliente' OR s.client_id=$5::uuid)
       AND ($4::text<>'conductor' OR s.driver_id=$6::uuid)
       AND ($7::text='' OR s.client_id=NULLIF($7,'')::uuid)
       AND ($8::text='' OR ($8='pendiente' AND s.operating_company IS NULL) OR s.operating_company=$8)
     ORDER BY s.created_at DESC,s.folio DESC LIMIT 1001`,
    [filters.from,filters.to,filters.status,actor.role,actor.client_id,actor.id,filters.client_id,filters.company],
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
  const data = z.object({ name: required(), tax_id: optional(20), contact_name: required(120), email:z.union([z.email(),z.literal("")]).default(""),address:optional(250) }).parse(input);
  return transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      "INSERT INTO clients (name,tax_id,contact_name,email,address) VALUES ($1,NULLIF($2,''),$3,NULLIF($4,''),NULLIF($5,'')) RETURNING id",
      [data.name,data.tax_id,data.contact_name,data.email,data.address],
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
  const readingUnit = data.kind === "camion" ? "km" : "sin";
  return transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      "INSERT INTO assets (code, label, kind, plate, reading_unit) VALUES ($1,$2,$3,NULLIF($4,''),$5) RETURNING id",
      [data.code.toUpperCase(), data.label, data.kind, data.plate.toUpperCase(), readingUnit],
    );
    await tx.query("INSERT INTO audit_events (actor_id, action, entity_type, entity_id, next_value) VALUES ($1,'create','asset',$2,$3)", [actor.id, row.id, JSON.stringify({ code: data.code, kind: data.kind, reading_unit: readingUnit })]);
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
  operating_company: z.enum(["rerchar", "e_y_j"]), quote_id: z.union([uuid,z.literal("")]).default(""),
  material_id:z.union([uuid,z.literal("")]).default(""),
  request_category: z.enum(["servicios", "compra", "venta", "otro"]).optional(),
  service_type: z.enum(["retiro", "traslado", "arriendo", "compra", "venta", "otro"]),
  waste_type: required(120), estimated_kg: z.union([positive, z.literal("")]).optional(),
  origin: required(250), destination: required(250),
  rental_from:z.union([z.iso.date(),z.literal("")]).optional().default(""),
  rental_to:z.union([z.iso.date(),z.literal("")]).optional().default(""),
  priority: z.enum(["normal", "alta", "critica"]), notes: optional(2000),
});

export async function createService(actor: Actor, input: unknown) {
  if (actor.role === "conductor") reject("Su perfil no puede crear solicitudes.");
  const data = createSchema.parse(input);
  const category = data.request_category ?? (["compra", "venta", "otro"].includes(data.service_type) ? data.service_type : "servicios");
  if (category === "servicios" ? !["retiro", "traslado", "arriendo"].includes(data.service_type) : category !== data.service_type)
    reject("Seleccione una clase de solicitud y un tipo de operación compatibles.");
  if(data.service_type==="arriendo"){
    if(!data.rental_from||!data.rental_to||data.rental_to<data.rental_from)reject("Indique las fechas de inicio y término del arriendo.");
    if(data.estimated_kg!==""&&data.estimated_kg!==undefined)reject("El arriendo se registra sin kilos estimados.");
  }else if(data.rental_from||data.rental_to)reject("Las fechas de arriendo corresponden sólo a ese servicio.");
  if (actor.role === "cliente" && actor.client_id !== data.client_id) reject("No puede crear solicitudes para otro cliente.");
  return transaction(async (tx) => {
    const [site] = await tx.query("SELECT id FROM client_sites WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL", [data.site_id, data.client_id]);
    if (!site) reject("El centro no pertenece al cliente seleccionado.");
    let materialRows:{id:string;position:number;material_id:string|null;description:string;quantity:string|null;unit:string;unit_price_clp:string;line_note:string|null}[]=[];
    if (data.quote_id) {
      const [quote] = await tx.query<{issuer:Company;client_id:string;status:string;commercial_kind:string;notes:string|null}>(
        "SELECT issuer,client_id,status,commercial_kind,notes FROM client_quotes WHERE id=$1 FOR UPDATE", [data.quote_id]);
      if (!quote || quote.status !== "aceptada" || quote.client_id !== data.client_id || quote.issuer !== data.operating_company)
        reject("La cotización debe estar aceptada y corresponder al mismo cliente y empresa.");
      if((quote.commercial_kind==="compra_material")!==(category==="compra"))reject("La clase de solicitud debe coincidir con la propuesta aceptada.");
      if(category==="compra"){
        if(data.material_id)reject("Los materiales de una propuesta aceptada se copian automáticamente.");
        const [existing]=await tx.query<{id:string;submission_key:string;created_by:string}>(
          "SELECT id,submission_key,created_by FROM service_requests WHERE quote_id=$1 AND deleted_at IS NULL LIMIT 1",[data.quote_id]);
        if(existing){if(existing.submission_key===data.submission_key&&existing.created_by===actor.id)return existing.id;
          reject("Esta propuesta de compra ya tiene una solicitud vinculada.");}
        materialRows=await tx.query("SELECT id,position,material_id,description,quantity,unit,unit_price_clp,line_note FROM client_quote_lines WHERE quote_id=$1 ORDER BY position",[data.quote_id]);
        if(!materialRows.length||materialRows.some(line=>!line.material_id||line.unit!=="kg"))reject("La propuesta de compra debe incluir materiales del catálogo en kg.");
      }
    }else if(category==="compra"&&data.material_id){
      const name=await catalogName(tx,data.material_id);
      materialRows=[{id:"",position:1,material_id:data.material_id,description:name,quantity:data.estimated_kg?Number(data.estimated_kg).toFixed(3):null,unit:"kg",unit_price_clp:"0",line_note:null}];
    }
    const [created] = await tx.query<{ id: string }>(
      `INSERT INTO service_requests
       (submission_key, client_id, site_id, operating_company, quote_id, request_category, service_type, waste_type, estimated_kg, origin, destination, priority, notes, created_by, rental_from, rental_to)
       VALUES ($1,$2,$3,$4,NULLIF($5,'')::uuid,$6,$7,$8,$9,$10,$11,$12,NULLIF($13,''),$14,NULLIF($15,'')::date,NULLIF($16,'')::date)
       ON CONFLICT (submission_key) DO NOTHING RETURNING id`,
      [data.submission_key, data.client_id, data.site_id, data.operating_company, data.quote_id, category, data.service_type,
        category==="compra"&&materialRows.length?materialRows.map(row=>row.description).join(", ").slice(0,120):data.waste_type,
        data.estimated_kg === "" || data.estimated_kg === undefined ? null : data.estimated_kg,
        data.origin, data.destination, data.priority, data.notes, actor.id,data.rental_from,data.rental_to],
    );
    if (!created) {
      const [original] = await tx.query<{ id: string; created_by: string; operating_company:Company|null; quote_id:string|null;service_type:string;request_category:string;rental_from:Date|string|null;rental_to:Date|string|null }>(
        "SELECT id,created_by,operating_company,quote_id,service_type,request_category,rental_from,rental_to FROM service_requests WHERE submission_key=$1",[data.submission_key]);
      const asDay=(value:Date|string|null)=>value instanceof Date?value.toISOString().slice(0,10):value?String(value).slice(0,10):"";
      if (original?.created_by !== actor.id || original.operating_company !== data.operating_company || original.quote_id !== (data.quote_id || null)
        || original.service_type!==data.service_type || original.request_category!==category
        || asDay(original.rental_from)!==data.rental_from || asDay(original.rental_to)!==data.rental_to)
        reject("Esta clave ya corresponde a otra solicitud.");
      return original.id;
    }
    for(const line of materialRows){
      await tx.query(`INSERT INTO service_request_materials
        (service_id,position,material_id,material_name,quantity_kg,unit_price_clp,line_note,source_quote_line_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[created.id,line.position,line.material_id,line.description,line.quantity,
          data.quote_id?line.unit_price_clp:null,line.line_note,data.quote_id?line.id:null]);
    }
    await event(tx, created.id, actor, "solicitud_creada", "Solicitud registrada", null, { status: "solicitada", operating_company:data.operating_company, quote_id:data.quote_id || null });
    return created.id;
  });
}

export async function classifyServiceCompany(actor:Actor,id:string,input:unknown) {
  if(actor.role!=="admin")reject("Sólo administración puede clasificar servicios anteriores.");
  const company=z.enum(["rerchar","e_y_j"]).parse(input);
  if(!uuid.safeParse(id).success)reject("Servicio inválido.");
  await transaction(async tx=>{
    const [service]=await tx.query<{operating_company:Company|null;quote_id:string|null}>(
      "SELECT operating_company,quote_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
    if(!service)reject("Servicio no encontrado.");
    if(service.operating_company)reject("La empresa ya está asignada. Una rectificación requiere revisar los documentos emitidos.");
    const [mismatch]=await tx.query(`SELECT 1 FROM supplier_invoices WHERE service_id=$1 AND issuer<>$2
      UNION ALL SELECT 1 FROM client_quotes q WHERE q.id=$3::uuid AND q.issuer<>$2
      UNION ALL SELECT 1 FROM material_receipts WHERE service_id=$1 AND $2<>'rerchar'
      UNION ALL SELECT 1 FROM service_certificates WHERE service_id=$1 AND $2<>'rerchar'
      UNION ALL SELECT 1 FROM service_valuations v JOIN service_tariffs t ON t.id=v.tariff_id
        JOIN client_contracts c ON c.id=t.contract_id WHERE v.service_id=$1 AND c.operating_company IS NOT NULL
        AND c.operating_company<>$2 LIMIT 1`,[id,company,service.quote_id]);
    if(mismatch)reject("Los documentos vinculados contradicen la empresa seleccionada. Revise el historial antes de clasificar.");
    await tx.query("UPDATE service_requests SET operating_company=$2,updated_at=now() WHERE id=$1",[id,company]);
    await event(tx,id,actor,"empresa_asignada","Empresa operadora validada",null,{operating_company:company});
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

// Los arriendos se programan con sus fechas pactadas. No son una ruta de camión
// ni generan un pesaje; un equipo propio se puede reservar si corresponde.
export async function scheduleRental(actor:Actor,id:string,input:unknown){
  if(!canPlan(actor))reject("Sólo operaciones puede programar arriendos.");
  const data=z.object({asset_id:z.union([uuid,z.literal("")]).default("")}).parse(input);
  if(!uuid.safeParse(id).success)reject("Solicitud inválida.");
  return transaction(async tx=>{
    const [service]=await tx.query<{service_type:string;status:string;rental_from:Date|string;rental_to:Date|string;assigned_asset_id:string|null}>(
      "SELECT service_type,status,rental_from,rental_to,assigned_asset_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
    if(!service||service.service_type!=="arriendo"||!["solicitada","programada"].includes(service.status))reject("El arriendo no está disponible para programar.");
    if(data.asset_id){
      const [asset]=await tx.query("SELECT id FROM assets WHERE id=$1 AND kind='equipo' AND available=true AND deleted_at IS NULL FOR UPDATE",[data.asset_id]);
      if(!asset)reject("Seleccione un equipo disponible del inventario.");
      const [conflict]=await tx.query(`SELECT id FROM service_requests WHERE id<>$1 AND service_type='arriendo'
        AND assigned_asset_id=$2 AND status='programada' AND deleted_at IS NULL
        AND rental_from<=$4::date AND rental_to>=$3::date LIMIT 1`,
        [id,data.asset_id,service.rental_from,service.rental_to]);
      if(conflict)reject("Ese equipo ya está reservado durante el período del arriendo.");
    }
    await tx.query(`UPDATE service_requests SET assigned_asset_id=NULLIF($2,'')::uuid,
      scheduled_for=(rental_from::timestamp + interval '9 hours') AT TIME ZONE 'America/Santiago',
      status='programada',updated_at=now() WHERE id=$1`,[id,data.asset_id]);
    await event(tx,id,actor,"arriendo_programado","Arriendo programado",{status:service.status,asset_id:service.assigned_asset_id},
      {status:"programada",asset_id:data.asset_id||null,rental_from:service.rental_from,rental_to:service.rental_to});
  });
}

export async function completeRental(actor:Actor,id:string){
  if(!canManage(actor))reject("Sólo operaciones puede cerrar arriendos.");
  if(!uuid.safeParse(id).success)reject("Solicitud inválida.");
  return transaction(async tx=>{
    const [service]=await tx.query<{service_type:string;status:string;rental_from:Date|string;rental_to:Date|string}>(
      "SELECT service_type,status,rental_from,rental_to FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
    if(!service||service.service_type!=="arriendo"||service.status!=="programada")reject("Primero programe el arriendo; no se puede cerrar dos veces.");
    const [evidence]=await tx.query("SELECT id FROM service_evidence WHERE service_id=$1 AND storage_key IS NOT NULL LIMIT 1",[id]);
    if(!evidence)reject("Adjunte un respaldo del arriendo antes del cierre.");
    await tx.query("UPDATE service_requests SET status='completada',closed_at=now(),updated_at=now() WHERE id=$1",[id]);
    await event(tx,id,actor,"arriendo_cerrado","Arriendo cerrado con respaldo",{status:service.status},
      {status:"completada",rental_from:service.rental_from,rental_to:service.rental_to});
  });
}

export async function assignService(actor: Actor, id: string, input: unknown) {
  if (!canPlan(actor)) reject("No tiene permiso para planificar servicios.");
  const data = z.object({ asset_id: uuid, ramp_asset_id: z.union([uuid,z.literal("")]).default(""),
    driver_id: z.union([uuid,z.literal("")]).default(""), external_driver_id: z.union([uuid,z.literal("")]).default(""), scheduled_for: z.string() }).parse(input);
  if(Boolean(data.driver_id)===Boolean(data.external_driver_id)) reject("Seleccione un solo conductor, de la empresa o tercero.");
  const date = parseChileDate(data.scheduled_for);
  return transaction(async (tx) => {
    const [service] = await tx.query<{ service_type:string;status: string; client_id:string; site_id:string; assigned_asset_id: string | null; ramp_asset_id: string | null; driver_id: string | null; external_driver_id:string|null }>(
      "SELECT service_type,status, client_id, site_id, assigned_asset_id, ramp_asset_id, driver_id, external_driver_id FROM service_requests WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id],
    );
    if (!service || !["solicitada", "programada"].includes(service.status)) reject("La solicitud no está disponible para planificación.");
    if(service.service_type==="arriendo")reject("Use la programación de arriendo, sin camión ni conductor.");
    // Lock the shared resources before checking collisions so concurrent planners serialize.
    const [asset] = await tx.query("SELECT id FROM assets WHERE id = $1 AND kind='camion' AND available = true AND deleted_at IS NULL FOR UPDATE", [data.asset_id]);
    const [ramp] = data.ramp_asset_id ? await tx.query("SELECT id FROM assets WHERE id=$1 AND kind='rampa' AND available=true AND deleted_at IS NULL FOR UPDATE", [data.ramp_asset_id]) : [];
    const [driver] = data.driver_id
      ? await tx.query("SELECT id FROM users WHERE id = $1 AND role = 'conductor' AND active = true FOR UPDATE", [data.driver_id])
      : await tx.query("SELECT id FROM external_drivers WHERE id = $1 AND active = true FOR UPDATE", [data.external_driver_id]);
    if (!asset || !driver || (data.ramp_asset_id && !ramp)) reject("Seleccione un camión, una rampla opcional disponible y un conductor activo.");
    const missing = data.driver_id
      ? await findMissingRequirements(tx,data.driver_id,service.client_id,service.site_id)
      : await findMissingExternalRequirements(tx,data.external_driver_id,service.client_id,service.site_id);
    if (missing.length) reject(`El conductor no cumple la acreditación de esta faena: ${missing.join(", ")}. Revise Personal.`);
    const [collision] = await tx.query(
      `SELECT id FROM service_requests WHERE id <> $1 AND deleted_at IS NULL AND status IN ('programada','en_ruta')
       AND scheduled_for BETWEEN $2::timestamptz - interval '4 hours' AND $2::timestamptz + interval '4 hours'
       AND (assigned_asset_id = $3 OR ($4::text <> '' AND driver_id = NULLIF($4,'')::uuid)
         OR ($6::text <> '' AND external_driver_id = NULLIF($6,'')::uuid)
         OR ($5::text <> '' AND ramp_asset_id = NULLIF($5,'')::uuid)) LIMIT 1`,
      [id, date, data.asset_id, data.driver_id, data.ramp_asset_id, data.external_driver_id],
    );
    if (collision) reject("El camión, la rampla o el conductor ya tiene otra asignación cercana a este horario.");
    await tx.query(
      `UPDATE service_requests SET assigned_asset_id=$2, driver_id=NULLIF($3,'')::uuid, scheduled_for=$4,
       ramp_asset_id=NULLIF($5,'')::uuid, external_driver_id=NULLIF($6,'')::uuid, status='programada', updated_at=now() WHERE id=$1`,
      [id, data.asset_id, data.driver_id, date, data.ramp_asset_id, data.external_driver_id],
    );
    await event(tx, id, actor, "planificacion", "Recursos y fecha asignados", { status: service.status, asset_id: service.assigned_asset_id, ramp_asset_id: service.ramp_asset_id, driver_id: service.driver_id, external_driver_id:service.external_driver_id },
      { status: "programada", scheduled_for: date.toISOString(), asset_id: data.asset_id, ramp_asset_id: data.ramp_asset_id || null, driver_id: data.driver_id||null, external_driver_id:data.external_driver_id||null });
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
    vehicle_ok: z.boolean(), documents_ok: z.boolean(), containment_ok: z.boolean(), ppe_ok: z.boolean(),
    vehicle_failure:z.boolean().optional().default(false),comment: optional(1000),
  }).parse(input);
  return transaction(async (tx) => {
    const [service] = await tx.query<{ status: string; driver_id: string | null; assigned_asset_id:string|null }>(
      "SELECT status, driver_id, assigned_asset_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id],
    );
    if (!service || !canWorkService(actor, service)) reject("No tiene acceso a este checklist.");
    if (service.status !== "programada") reject("El checklist se registra antes de iniciar la ruta.");
    if (data.vehicle_failure && data.vehicle_ok) reject("Desmarque Vehículo inspeccionado al reportar una falla.");
    if (data.vehicle_failure && data.comment.length < 5) reject("Describa la falla del vehículo en las observaciones del checklist.");
    const [previous] = await tx.query("SELECT vehicle_ok, documents_ok, containment_ok, ppe_ok, comment FROM service_checklists WHERE service_id=$1", [id]);
    await tx.query(
      `INSERT INTO service_checklists (service_id, vehicle_ok, documents_ok, containment_ok, ppe_ok, comment, completed_by)
       VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7)
       ON CONFLICT (service_id) DO UPDATE SET vehicle_ok=$2, documents_ok=$3, containment_ok=$4,
       ppe_ok=$5, comment=NULLIF($6,''), completed_by=$7, completed_at=now()`,
      [id, data.vehicle_ok, data.documents_ok, data.containment_ok, data.ppe_ok, data.comment, actor.id],
    );
    await event(tx, id, actor, "checklist", "Checklist previo actualizado", previous ?? null, data);
    if (data.vehicle_failure) {
      if (!service.assigned_asset_id) reject("El servicio debe tener un camión asignado para informar la avería.");
      const [existing] = await tx.query<{id:string}>(`SELECT id FROM fleet_incidents
        WHERE source_service_id=$1 AND asset_id=$2 AND status='abierta' FOR UPDATE`,[id,service.assigned_asset_id]);
      if (!existing) {
        const [incident]=await tx.query<{id:string}>(`INSERT INTO fleet_incidents
          (asset_id,source_service_id,description,severity,reported_by) VALUES ($1,$2,$3,'alta',$4) RETURNING id`,
          [service.assigned_asset_id,id,`Checklist previo: ${data.comment}`,actor.id]);
        await tx.query("UPDATE assets SET available=false WHERE id=$1",[service.assigned_asset_id]);
        await event(tx,id,actor,"averia_reportada","Avería del checklist enviada a mantenimiento",null,{incident_id:incident.id,asset_id:service.assigned_asset_id});
        await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'incident_from_checklist','fleet_incident',$2,$3)",
          [actor.id,incident.id,JSON.stringify({source_service_id:id,asset_id:service.assigned_asset_id,description:data.comment})]);
      }
    }
  });
}

export async function startService(actor: Actor, id: string) {
  return transaction(async (tx) => {
    const [service] = await tx.query<{ service_type:string;status: string; driver_id: string | null; external_driver_id:string|null; client_id:string; site_id:string }>(
      "SELECT service_type,status, driver_id, external_driver_id, client_id, site_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id],
    );
    if (!service || !canWorkService(actor, service)) reject("No tiene acceso a esta ruta.");
    if(service.service_type==="arriendo")reject("El arriendo se cierra con respaldo desde su propio control.");
    if (service.status !== "programada") reject("Sólo se puede iniciar un servicio programado.");
    if (!service.driver_id && !service.external_driver_id) reject("El servicio no tiene un conductor asignado.");
    const missing=service.driver_id
      ? await findMissingRequirements(tx,service.driver_id,service.client_id,service.site_id)
      : await findMissingExternalRequirements(tx,service.external_driver_id!,service.client_id,service.site_id);
    if(missing.length) reject(`La acreditación del conductor venció o está pendiente: ${missing.join(", ")}. Revise Personal.`);
    const [resources] = await tx.query<{ truck_available: boolean; ramp_available: boolean }>(
      `SELECT a.available AS truck_available,COALESCE(r.available,true) AS ramp_available
       FROM service_requests s JOIN assets a ON a.id=s.assigned_asset_id
       LEFT JOIN assets r ON r.id=s.ramp_asset_id WHERE s.id=$1`, [id],
    );
    if (!resources?.truck_available || !resources.ramp_available) reject("El camión o la rampla tiene una avería activa. Revise el despacho antes de iniciar la ruta.");
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

export async function handoffService(actor: Actor, id: string) {
  return transaction(async (tx) => {
    const [service] = await tx.query<{ status: string; driver_id: string | null; request_category:string }>(
      "SELECT status,driver_id,request_category FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id]);
    if (!service || !canWorkService(actor, service)) reject("No tiene acceso a este servicio.");
    if (service.status !== "en_ruta") reject("La operación debe estar en ruta para entregar sus documentos.");
    if (service.request_category!=="compra") reject("Esta entrega documental corresponde a solicitudes de compra.");
    const documents = await tx.query<{document_kind:string}>(
      "SELECT DISTINCT document_kind FROM service_evidence WHERE service_id=$1 AND storage_key IS NOT NULL AND document_kind IN ('guia_traslado','hoja_servicio')",[id]);
    const kinds = new Set(documents.map(document => document.document_kind));
    if (!kinds.has("guia_traslado") || !kinds.has("hoja_servicio"))
      reject("Adjunte Guía de Traslado y Hoja de Servicio antes de finalizar. El ticket es opcional.");
    await tx.query("UPDATE service_requests SET status='pendiente_revision',updated_at=now() WHERE id=$1",[id]);
    await event(tx,id,actor,"documentacion_entregada","Operación entregada a revisión administrativa",
      {status:"en_ruta"},{status:"pendiente_revision",ticket_optional:true});
  });
}

export async function finishService(actor: Actor, id: string, input: unknown) {
  const data = z.object({ gross_kg: positive, tare_kg: z.coerce.number().min(0), guide_number: optional(50) }).parse(input);
  if (data.gross_kg < data.tare_kg) reject("El peso bruto no puede ser inferior a la tara.");
  return transaction(async (tx) => {
    const [service] = await tx.query<{ service_type:string;status: string; driver_id: string | null; request_category:string }>(
      "SELECT service_type,status,driver_id,request_category FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id],
    );
    if (!service || !canWorkService(actor,service)) reject("No tiene acceso a este servicio.");
    if(service.service_type==="arriendo")reject("El arriendo se cierra sin pesaje desde su propio control.");
    const purchase=service.request_category==="compra";
    if(purchase){
      if(!canManage(actor)||service.status!=="pendiente_revision") reject("La compra debe ser entregada por el conductor y validada por administración.");
      const documents=await tx.query<{document_kind:string}>(
        "SELECT DISTINCT document_kind FROM service_evidence WHERE service_id=$1 AND storage_key IS NOT NULL AND document_kind IN ('guia_traslado','hoja_servicio')",[id]);
      if(new Set(documents.map(document=>document.document_kind)).size!==2)
        reject("Faltan la Guía de Traslado o la Hoja de Servicio.");
    } else {
      if(service.status!=="en_ruta") reject("Sólo se puede cerrar un servicio en ruta.");
      const [evidence]=await tx.query("SELECT id FROM service_evidence WHERE service_id=$1 AND storage_key IS NOT NULL LIMIT 1",[id]);
      if(!evidence)reject("Adjunte al menos una fotografía o documento antes de cerrar.");
    }
    await tx.query(
      `UPDATE service_requests SET status='completada', gross_kg=$2, tare_kg=$3,
       guide_number=COALESCE(NULLIF($4,''),guide_number), closed_at=now(), updated_at=now() WHERE id=$1`,
      [id, data.gross_kg, data.tare_kg, data.guide_number],
    );
    await event(tx, id, actor, "servicio_cerrado", purchase?"Documentos revisados y pesaje validado por administración":"Servicio completado y pesaje registrado",
      { status: service.status }, { status: "completada", gross_kg: data.gross_kg, tare_kg: data.tare_kg, net_kg: data.gross_kg - data.tare_kg });
  });
}

function detectMime(bytes: Buffer) {
  if (bytes.subarray(0, 4).toString() === "%PDF") return { mime: "application/pdf", extension: ".pdf" };
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", extension: ".png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: ".jpg" };
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return { mime: "image/webp", extension: ".webp" };
  reject("Adjunte un archivo PDF, PNG, JPG o WebP válido.");
}

export async function addEvidence(actor: Actor, id: string, description: string, file: File, documentKind="evidencia") {
  const documentKindSafe=z.enum(["evidencia","guia_traslado","guia_valorizada","hoja_servicio","ticket_pesaje","foto_material","factura","certificado","resumen_retiros","otro"]).parse(documentKind);
  if(actor.role==="conductor"&&!(["evidencia","guia_traslado","hoja_servicio","ticket_pesaje","foto_material"] as string[]).includes(documentKindSafe))
    reject("El conductor sólo puede cargar documentos y fotografías de su operación.");
  const descriptionSafe=z.string().trim().max(500).parse(description) || ({guia_traslado:"Guía de Traslado",hoja_servicio:"Hoja de Servicio",ticket_pesaje:"Ticket de pesaje",foto_material:"Fotografía del material"} as Record<string,string>)[documentKindSafe] || "Respaldo del servicio";
  const maxMb=process.env.VERCEL?4:5;
  if (!file || file.size < 1 || file.size > maxMb * 1024 * 1024) reject(`El archivo debe pesar entre 1 byte y ${maxMb} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = detectMime(bytes);
  const service = await getService(actor, id);
  if (!(canManage(actor) ? service.status!=="cancelada" : canWorkService(actor,service) && ["programada","en_ruta"].includes(service.status)))
    reject("No se puede incorporar documentos en este estado.");
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
      if (!current || !(canManage(actor) ? current.status!=="cancelada" : canWorkService(actor,current) && ["programada","en_ruta"].includes(current.status)))
        reject("El servicio cambió de estado. Intente nuevamente.");
      const [evidence] = await tx.query<{ id: string }>(
        `INSERT INTO service_evidence (service_id,description,document_kind,storage_key,original_filename,mime_type,size_bytes,created_by,file_content)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [id,descriptionSafe,documentKindSafe,key,file.name.slice(0,160),kind.mime,file.size,actor.id,databaseStorage?bytes:null],
      );
      await event(tx, id, actor, "evidencia", `Documento incorporado: ${descriptionSafe}`, null, { evidence_id: evidence.id,document_kind:documentKindSafe });
      return evidence.id;
    });
  } catch (error) {
    if(dir)await unlink(resolve(dir,key)).catch(()=>undefined);
    throw error;
  }
}
