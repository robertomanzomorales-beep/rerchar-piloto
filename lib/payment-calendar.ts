import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction} from "./db";

const uuid=z.uuid();
const dataSchema=z.object({client_id:uuid,statement_type:z.enum(["residuos","arriendo"]),
  period_from:z.iso.date(),period_to:z.iso.date(),cutoff_on:z.iso.date(),send_on:z.iso.date(),
  contact_email:z.email().max(180),notes:z.string().trim().max(500).default("")});
type Schedule=z.infer<typeof dataSchema>;
export class PaymentCalendarError extends Error {}
function reject(message:string):never{throw new PaymentCalendarError(message);}
function view(actor:Actor){if(!canManage(actor))reject("Sin acceso a la agenda de estados de pago.");}
function admin(actor:Actor){if(actor.role!=="admin")reject("Sólo administración puede cambiar el calendario de cobros.");}
function dates(data:Schedule){
  if(data.period_from>data.period_to)reject("El período termina antes de comenzar.");
  if(data.period_to>data.cutoff_on)reject("El corte no puede preceder el fin del período.");
  if(data.cutoff_on>data.send_on)reject("El envío no puede preceder el corte.");
}

export type BillingCycle={id:string;client_id:string;client_name:string;statement_type:"residuos"|"arriendo";
  period_from:Date|string;period_to:Date|string;cutoff_on:Date|string;send_on:Date|string;
  contact_email:string;notes:string|null;statement_id:string|null;statement_number:string|null;
  statement_status:"borrador"|"observado"|"enviado"|"aprobado"|null;created_at:Date|string};
export type CompletedService={id:string;folio:string;closed_on:string;service_type:string;waste_type:string;
  guide_number:string|null;quantity:string|null;tariff_unit:string|null;unit_price_clp:string|null;
  total_clp:string|null;invoice_number:string|null;status:string;partial_period:boolean};
const cycleSelect=`SELECT b.*,c.name AS client_name,p.number AS statement_number,p.status AS statement_status
  FROM payment_statement_cycles b JOIN clients c ON c.id=b.client_id
  LEFT JOIN payment_statements p ON p.id=b.statement_id`;

export async function listBillingCycles(actor:Actor){
  view(actor);
  return db.query<BillingCycle>(`${cycleSelect} WHERE b.issuer='e_y_j'
    ORDER BY b.send_on,b.cutoff_on,b.created_at LIMIT 350`);
}

export async function getBillingCycle(actor:Actor,id:string){
  view(actor);if(!uuid.safeParse(id).success)reject("Período no encontrado.");
  const [cycle]=await db.query<BillingCycle>(`${cycleSelect} WHERE b.id=$1 AND b.issuer='e_y_j'`,[id]);
  if(!cycle)reject("Período no encontrado.");
  const [services,statements]=await Promise.all([
    db.query<CompletedService>(`SELECT s.id,s.folio::text,
      CASE WHEN s.service_type='arriendo' THEN to_char(s.rental_from,'YYYY-MM-DD') || ' al ' || to_char(s.rental_to,'YYYY-MM-DD')
        ELSE to_char(s.closed_at AT TIME ZONE 'America/Santiago','YYYY-MM-DD') END AS closed_on,
      s.service_type,s.waste_type,s.status,s.guide_number,
      (s.service_type='arriendo' AND (s.rental_from<$2::date OR s.rental_to>$3::date)) AS partial_period,
      CASE WHEN s.service_type='arriendo' AND (s.rental_from<$2::date OR s.rental_to>$3::date) THEN NULL ELSE v.quantity::text END AS quantity,
      t.unit AS tariff_unit,v.unit_price_clp::text,
      CASE WHEN s.service_type='arriendo' AND (s.rental_from<$2::date OR s.rental_to>$3::date) THEN NULL ELSE v.total_clp::text END AS total_clp,
      f.invoice_number
      FROM service_requests s LEFT JOIN service_valuations v ON v.service_id=s.id
      LEFT JOIN service_tariffs t ON t.id=v.tariff_id
      LEFT JOIN service_invoices f ON f.valuation_id=v.id AND f.status='emitida'
      WHERE s.client_id=$1 AND s.operating_company='e_y_j' AND s.deleted_at IS NULL
        AND (($4::text='arriendo' AND s.service_type='arriendo' AND s.status IN ('programada','completada')
          AND s.rental_from<=$3::date AND s.rental_to>=$2::date)
          OR ($4::text='residuos' AND s.service_type<>'arriendo' AND s.status='completada'
            AND s.closed_at IS NOT NULL
            AND (s.closed_at AT TIME ZONE 'America/Santiago')::date BETWEEN $2::date AND $3::date))
      ORDER BY COALESCE(s.closed_at,s.scheduled_for),s.folio LIMIT 501`,
      [cycle.client_id,cycle.period_from,cycle.period_to,cycle.statement_type]),
    db.query<{id:string;number:string;period_on:Date|string;statement_type:string;status:string}>(
      `SELECT id,number,period_on,statement_type,status FROM payment_statements
       WHERE issuer='e_y_j' AND client_id=$1 AND statement_type=$2
         AND period_on BETWEEN $3::date AND $4::date ORDER BY created_at DESC`,
      [cycle.client_id,cycle.statement_type,cycle.period_from,cycle.period_to]),
  ]);
  return {cycle,services:services.slice(0,500),statements,overflow:services.length>500};
}

export async function createBillingCycle(actor:Actor,input:unknown){
  admin(actor);
  const data=dataSchema.parse(input);dates(data);
  return transaction(async tx=>{
    const [client]=await tx.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.client_id]);
    if(!client)reject("Seleccione un cliente activo.");
    const [overlap]=await tx.query(`SELECT id FROM payment_statement_cycles WHERE issuer='e_y_j' AND client_id=$1
      AND statement_type=$2 AND period_from<=$4::date AND period_to>=$3::date LIMIT 1`,
      [data.client_id,data.statement_type,data.period_from,data.period_to]);
    if(overlap)reject("Ya existe un período que se cruza para este cliente y formato.");
    const [row]=await tx.query<{id:string}>(`INSERT INTO payment_statement_cycles
      (client_id,statement_type,period_from,period_to,cutoff_on,send_on,contact_email,notes,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''),$9) RETURNING id`,
      [data.client_id,data.statement_type,data.period_from,data.period_to,data.cutoff_on,data.send_on,
        data.contact_email,data.notes,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'create','payment_statement_cycle',$2,$3)",
      [actor.id,row.id,JSON.stringify(data)]);
    return row.id;
  });
}

export async function updateBillingCycle(actor:Actor,id:string,input:unknown){
  admin(actor);uuid.parse(id);
  const data=dataSchema.omit({client_id:true,statement_type:true}).parse(input);
  return transaction(async tx=>{
    const [old]=await tx.query<BillingCycle>("SELECT * FROM payment_statement_cycles WHERE id=$1 AND issuer='e_y_j' FOR UPDATE",[id]);
    if(!old)reject("Período no encontrado.");
    dates({...data,client_id:old.client_id,statement_type:old.statement_type});
    const [overlap]=await tx.query(`SELECT id FROM payment_statement_cycles WHERE issuer='e_y_j' AND client_id=$1
      AND statement_type=$2 AND id<>$3 AND period_from<=$5::date AND period_to>=$4::date LIMIT 1`,
      [old.client_id,old.statement_type,id,data.period_from,data.period_to]);
    if(overlap)reject("Este período se cruza con otro del mismo cliente y formato.");
    if(old.statement_id){
      const [linked]=await tx.query<{period_on:Date|string}>("SELECT period_on FROM payment_statements WHERE id=$1",[old.statement_id]);
      const period=String(linked?.period_on instanceof Date?linked.period_on.toISOString().slice(0,10):linked?.period_on).slice(0,10);
      if(period<data.period_from||period>data.period_to)reject("El estado de pago vinculado debe quedar dentro del período.");
    }
    await tx.query(`UPDATE payment_statement_cycles SET period_from=$2,period_to=$3,cutoff_on=$4,send_on=$5,
      contact_email=$6,notes=NULLIF($7,''),updated_at=now() WHERE id=$1`,
      [id,data.period_from,data.period_to,data.cutoff_on,data.send_on,data.contact_email,data.notes]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES($1,'update','payment_statement_cycle',$2,$3,$4)",
      [actor.id,id,JSON.stringify(old),JSON.stringify(data)]);
  });
}

export async function linkBillingStatement(actor:Actor,id:string,statementId:string){
  admin(actor);uuid.parse(id);
  if(statementId)uuid.parse(statementId);
  await transaction(async tx=>{
    const [cycle]=await tx.query<BillingCycle>("SELECT * FROM payment_statement_cycles WHERE id=$1 AND issuer='e_y_j' FOR UPDATE",[id]);
    if(!cycle)reject("Período no encontrado.");
    if(statementId){
      const [statement]=await tx.query<{id:string}>(`SELECT id FROM payment_statements WHERE id=$1 AND issuer='e_y_j'
        AND client_id=$2 AND statement_type=$3 AND period_on BETWEEN $4::date AND $5::date`,
        [statementId,cycle.client_id,cycle.statement_type,cycle.period_from,cycle.period_to]);
      if(!statement)reject("El estado de pago debe ser del mismo cliente, formato y período.");
      const [other]=await tx.query("SELECT id FROM payment_statement_cycles WHERE statement_id=$1 AND id<>$2",[statementId,id]);
      if(other)reject("Ese estado de pago ya está vinculado a otro período.");
    }
    await tx.query("UPDATE payment_statement_cycles SET statement_id=$2,updated_at=now() WHERE id=$1",[id,statementId||null]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES($1,'link_statement','payment_statement_cycle',$2,$3,$4)",
      [actor.id,id,JSON.stringify({statement_id:cycle.statement_id}),JSON.stringify({statement_id:statementId||null})]);
  });
}

export async function eyjBillingCalendarDashboard(asOf?:string){
  const today=asOf??new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if(!z.iso.date().safeParse(today).success)throw new Error("Fecha de panel inválida.");
  try{
    const [row]=await db.query<{cutoffs:string;sends:string;overdue:string}>(`SELECT
      count(*) FILTER (WHERE b.cutoff_on<=$1::date+7 AND b.cutoff_on>=$1::date
        AND COALESCE(p.status,'') NOT IN ('enviado','aprobado'))::text AS cutoffs,
      count(*) FILTER (WHERE b.send_on<=$1::date+7 AND b.send_on>=$1::date
        AND COALESCE(p.status,'') NOT IN ('enviado','aprobado'))::text AS sends,
      count(*) FILTER (WHERE b.send_on<$1::date AND COALESCE(p.status,'') NOT IN ('enviado','aprobado'))::text AS overdue
      FROM payment_statement_cycles b LEFT JOIN payment_statements p ON p.id=b.statement_id
      WHERE b.issuer='e_y_j'`,[today]);
    return {...row,ready:true};
  }catch(error){
    if(typeof error==="object"&&error!==null&&"code" in error&&["42P01","42703"].includes(String(error.code)))
      return {cutoffs:"0",sends:"0",overdue:"0",ready:false};
    throw error;
  }
}
