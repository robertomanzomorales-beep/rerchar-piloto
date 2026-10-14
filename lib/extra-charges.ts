import {z} from "zod";
import type {Actor} from "./auth";
import {canPlan} from "./auth";
import {db,transaction} from "./db";
import type {Company} from "./companies";

export class ExtraChargeError extends Error {}
const reject=(message:string):never=>{throw new ExtraChargeError(message);};
const uuid=z.uuid();
const reference=z.string().trim().max(80).default("");
const amount=z.union([z.literal(""),z.string(),z.number()]).transform((raw,ctx)=>{
  const value=String(raw).trim();
  if(!value)return "";
  if(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)<=0||Number(value)>100_000_000_000){
    ctx.addIssue({code:"custom",message:"Ingrese un monto positivo en pesos."});return z.NEVER;
  }
  return value;
});
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function staff(actor:Actor){if(!canPlan(actor))reject("Se requiere acceso de operaciones o administración.");}
function admin(actor:Actor){if(actor.role!=="admin")reject("La decisión comercial requiere administración.");}
export const extraChargeLabels={flete_falso:"Flete falso",sobrestadia:"Sobreestadía",otro:"Otro cargo"} as const;
export type ExtraCharge={id:string;service_id:string;service_day:Date|string;kind:keyof typeof extraChargeLabels;reason:string;
  source_outcome:string;source_observation:string;amount_clp:string|null;quote_reference:string|null;client_order_reference:string|null;
  status:"propuesto"|"aprobado"|"descartado"|"facturado";decision_note:string|null;invoice_number:string|null;invoiced_on:Date|string|null;
  created_at:Date;decided_at:Date|null;creator_name:string;decider_name:string|null;folio:string;client_name:string;operating_company:Company};

const select=`SELECT x.*,s.folio::text AS folio,s.operating_company,c.name AS client_name,u.name AS creator_name,d.name AS decider_name
  FROM service_extra_charges x JOIN service_requests s ON s.id=x.service_id JOIN clients c ON c.id=s.client_id
  JOIN users u ON u.id=x.created_by LEFT JOIN users d ON d.id=x.decided_by WHERE s.deleted_at IS NULL`;

export async function listExtraCharges(actor:Actor,company:Company){
  staff(actor);
  if(!["rerchar","e_y_j"].includes(company))reject("Empresa inválida.");
  return db.query<ExtraCharge>(`${select} AND s.operating_company=$1 ORDER BY
    CASE x.status WHEN 'propuesto' THEN 0 WHEN 'aprobado' THEN 1 ELSE 2 END,x.service_day DESC,x.created_at DESC LIMIT 300`,[company]);
}
export async function serviceExtraCharges(actor:Actor,serviceId:string){
  staff(actor);
  if(!uuid.safeParse(serviceId).success)reject("Servicio inválido.");
  return db.query<ExtraCharge>(`${select} AND x.service_id=$1 ORDER BY x.service_day DESC,x.created_at DESC LIMIT 120`,[serviceId]);
}
export async function pendingExtraChargeCount(actor:Actor,company:Company){
  staff(actor);
  const [row]=await db.query<{total:string}>(`SELECT count(*)::text AS total FROM service_extra_charges x
    JOIN service_requests s ON s.id=x.service_id WHERE s.deleted_at IS NULL AND s.operating_company=$1 AND x.status='propuesto'`,[company]);
  return Number(row?.total??0);
}

export async function proposeExtraCharge(actor:Actor,serviceId:string,input:unknown){
  staff(actor);
  if(!uuid.safeParse(serviceId).success)reject("Servicio inválido.");
  const data=z.object({submission_key:uuid,service_day:z.iso.date(),kind:z.enum(["flete_falso","sobrestadia","otro"]),
    reason:z.string().trim().min(5).max(1000),amount_clp:amount,quote_reference:reference,client_order_reference:reference}).parse(input);
  if(data.service_day>today())reject("El día del cargo no puede ser futuro.");
  return transaction(async tx=>{
    const [old]=await tx.query<{id:string;service_id:string}>("SELECT id,service_id FROM service_extra_charges WHERE submission_key=$1",[data.submission_key]);
    if(old){if(old.service_id!==serviceId)reject("La clave de envío pertenece a otro servicio.");return old.id;}
    const [source]=await tx.query<{outcome:string;observation:string;operating_company:Company|null}>(`SELECT d.outcome,d.observation,s.operating_company
      FROM service_day_reports d JOIN service_requests s ON s.id=d.service_id
      WHERE d.service_id=$1 AND d.day=$2::date AND s.deleted_at IS NULL FOR UPDATE OF s,d`,[serviceId,data.service_day]);
    if(!source)reject("Registre primero el resultado del día en el parte del servicio.");
    if(!source.operating_company)reject("Confirme la empresa operadora del servicio.");
    const [created]=await tx.query<{id:string}>(`INSERT INTO service_extra_charges
      (submission_key,service_id,service_day,kind,reason,source_outcome,source_observation,amount_clp,quote_reference,client_order_reference,created_by)
      VALUES($1,$2,$3::date,$4,$5,$6,$7,NULLIF($8,'')::numeric,NULLIF($9,''),NULLIF($10,''),$11) RETURNING id`,
      [data.submission_key,serviceId,data.service_day,data.kind,data.reason,source.outcome,source.observation,
        data.amount_clp,data.quote_reference,data.client_order_reference,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'propose','service_extra_charge',$2,$3)",
      [actor.id,created.id,JSON.stringify({service_id:serviceId,company:source.operating_company,...data,source_outcome:source.outcome,source_observation:source.observation})]);
    return created.id;
  });
}

export async function decideExtraCharge(actor:Actor,id:string,input:unknown){
  admin(actor);
  if(!uuid.safeParse(id).success)reject("Cargo inválido.");
  const data=z.object({status:z.enum(["aprobado","descartado"]),decision_note:z.string().trim().min(5).max(500),amount_clp:amount}).parse(input);
  if(data.status==="aprobado"&&!data.amount_clp)reject("Para aprobar, registre el monto neto acordado.");
  await transaction(async tx=>{
    const [before]=await tx.query<{status:string;amount_clp:string|null;operating_company:Company|null}>(`SELECT x.status,x.amount_clp,s.operating_company
      FROM service_extra_charges x JOIN service_requests s ON s.id=x.service_id WHERE x.id=$1 AND s.deleted_at IS NULL FOR UPDATE OF x`,[id]);
    if(!before||before.status!=="propuesto")reject("Este cargo ya fue resuelto o no existe.");
    if(!before.operating_company)reject("Confirme la empresa del servicio antes de decidir.");
    await tx.query(`UPDATE service_extra_charges SET status=$2,decision_note=$3,amount_clp=CASE WHEN $2='aprobado' THEN $4::numeric ELSE amount_clp END,
      decided_by=$5,decided_at=now() WHERE id=$1`,[id,data.status,data.decision_note,data.amount_clp||null,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES($1,'decide','service_extra_charge',$2,$3,$4)",
      [actor.id,id,JSON.stringify(before),JSON.stringify({...data,company:before.operating_company})]);
  });
}

export async function invoiceExtraCharge(actor:Actor,id:string,input:unknown){
  admin(actor);
  if(!uuid.safeParse(id).success)reject("Cargo inválido.");
  const data=z.object({invoice_number:z.string().trim().min(2).max(80),invoiced_on:z.iso.date()}).parse(input);
  if(data.invoiced_on>today())reject("La factura no puede tener fecha futura.");
  await transaction(async tx=>{
    const [before]=await tx.query<{status:string;service_day:Date|string;operating_company:Company|null}>(`SELECT x.status,x.service_day,s.operating_company
      FROM service_extra_charges x JOIN service_requests s ON s.id=x.service_id WHERE x.id=$1 AND s.deleted_at IS NULL FOR UPDATE OF x`,[id]);
    if(!before||before.status!=="aprobado")reject("Apruebe primero el cargo; sólo se registra una factura externa existente.");
    const serviceDay=before.service_day instanceof Date?before.service_day.toISOString().slice(0,10):String(before.service_day).slice(0,10);
    if(data.invoiced_on<serviceDay)reject("La factura no puede anteceder al trabajo.");
    await tx.query("UPDATE service_extra_charges SET status='facturado',invoice_number=$2,invoiced_on=$3::date WHERE id=$1",
      [id,data.invoice_number,data.invoiced_on]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES($1,'record_invoice','service_extra_charge',$2,$3,$4)",
      [actor.id,id,JSON.stringify({status:before.status}),JSON.stringify(data)]);
  });
}
