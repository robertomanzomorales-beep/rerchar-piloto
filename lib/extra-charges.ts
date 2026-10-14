import {z} from "zod";
import type {Actor} from "./auth";
import {canPlan} from "./auth";
import {db,transaction} from "./db";
import type {Company} from "./companies";
import {moduleReady} from "./schema-readiness";

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
  receivable_invoice_id:string|null;linked_service_invoice_id:string|null;
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
  const data=z.object({invoice_number:z.string().trim().min(2).max(80),invoiced_on:z.iso.date(),due_on:z.iso.date(),total_clp:amount}).parse(input);
  if(data.invoiced_on>today())reject("La factura no puede tener fecha futura.");
  if(data.due_on<data.invoiced_on)reject("El vencimiento no puede anteceder a la emisión.");
  if(!data.total_clp)reject("Indique el total de la factura externa, incluidos impuestos si corresponde.");
  await transaction(async tx=>{
    const [before]=await tx.query<{status:string;service_day:Date|string;operating_company:Company|null;client_id:string;invoice_number:string|null;
      receivable_invoice_id:string|null;linked_service_invoice_id:string|null}>(`SELECT x.status,x.service_day,s.operating_company,s.client_id,
      x.invoice_number,x.receivable_invoice_id,x.linked_service_invoice_id
      FROM service_extra_charges x JOIN service_requests s ON s.id=x.service_id WHERE x.id=$1 AND s.deleted_at IS NULL FOR UPDATE OF x`,[id]);
    if(!before||!['aprobado','facturado'].includes(before.status))reject("Apruebe primero el cargo; sólo se registra una factura externa existente.");
    if(before.status==='facturado'&&(before.receivable_invoice_id||before.linked_service_invoice_id))reject("Este cargo ya tiene una factura conciliada.");
    if(before.invoice_number&&before.invoice_number!==data.invoice_number)reject("El folio anterior es distinto. Revise su historial antes de conciliar.");
    if(!before.operating_company)reject("Confirme la empresa del servicio.");
    const serviceDay=before.service_day instanceof Date?before.service_day.toISOString().slice(0,10):String(before.service_day).slice(0,10);
    if(data.invoiced_on<serviceDay)reject("La factura no puede anteceder al trabajo.");
    const [main]=await tx.query<{id:string;status:string;total_verified:boolean;issued_on:Date|string;due_on:Date|string;total_clp:string;operating_company:Company;client_id:string}>(
      `SELECT f.id,f.status,f.total_verified,f.issued_on,f.due_on,f.total_clp,s.operating_company,s.client_id FROM service_invoices f
      JOIN service_valuations v ON v.id=f.valuation_id JOIN service_requests s ON s.id=v.service_id
      WHERE f.invoice_number=$1 FOR UPDATE OF f`,[data.invoice_number]);
    let mainId:string|null=null,extraId:string|null=null;
    const sameDate=(value:Date|string,expected:string)=>(value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10))===expected;
    if(main){
      if(main.status==="emitida"&&!main.total_verified)reject("Confirme el total real de la factura principal en Finanzas antes de vincular este cargo.");
      if(main.status!=="emitida"||main.client_id!==before.client_id||main.operating_company!==before.operating_company||
        !sameDate(main.issued_on,data.invoiced_on)||!sameDate(main.due_on,data.due_on)||Number(main.total_clp)!==Number(data.total_clp))
        reject("El folio ya existe con otro cliente, empresa, monto o fecha. Revise la factura principal.");
      mainId=main.id;
    }else{
      const [existing]=await tx.query<{id:string;status:string;client_id:string;issued_on:Date|string;due_on:Date|string;total_clp:string}>(
        `SELECT * FROM extra_receivable_invoices WHERE issuer=$1 AND invoice_number=$2 FOR UPDATE`,[before.operating_company,data.invoice_number]);
      if(existing){
        if(existing.status!=="emitida"||existing.client_id!==before.client_id||!sameDate(existing.issued_on,data.invoiced_on)||
          !sameDate(existing.due_on,data.due_on)||Number(existing.total_clp)!==Number(data.total_clp))
          reject("Ese folio corresponde a otra factura o a una factura anulada.");
        extraId=existing.id;
      }else{
        const [created]=await tx.query<{id:string}>(`INSERT INTO extra_receivable_invoices
          (issuer,client_id,invoice_number,issued_on,due_on,total_clp,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [before.operating_company,before.client_id,data.invoice_number,data.invoiced_on,data.due_on,data.total_clp,actor.id]);
        extraId=created.id;
      }
    }
    await tx.query(`UPDATE service_extra_charges SET status='facturado',invoice_number=$2,invoiced_on=$3::date,
      receivable_invoice_id=$4,linked_service_invoice_id=$5 WHERE id=$1`,[id,data.invoice_number,data.invoiced_on,extraId,mainId]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES($1,'record_invoice','service_extra_charge',$2,$3,$4)",
      [actor.id,id,JSON.stringify({status:before.status,invoice_number:before.invoice_number}),JSON.stringify({...data,receivable_invoice_id:extraId,linked_service_invoice_id:mainId})]);
  });
}

export async function registerExtraReceivablePayment(actor:Actor,invoiceId:string,input:unknown){
  admin(actor);
  if(!uuid.safeParse(invoiceId).success)reject("Factura inválida.");
  const data=z.object({submission_key:uuid,amount_clp:amount,paid_on:z.iso.date(),reference:z.string().trim().min(2).max(120)}).parse(input);
  if(!data.amount_clp)reject("Indique un abono mayor que cero.");
  if(data.paid_on>today())reject("El pago no puede tener una fecha futura.");
  return transaction(async tx=>{
    const [invoice]=await tx.query<{id:string;status:string;issued_on:Date|string;total_clp:string}>(
      "SELECT id,status,issued_on,total_clp FROM extra_receivable_invoices WHERE id=$1 FOR UPDATE",[invoiceId]);
    if(!invoice||invoice.status!=="emitida")reject("La factura no está vigente.");
    const [old]=await tx.query<{id:string;invoice_id:string}>("SELECT id,invoice_id FROM extra_receivable_payments WHERE submission_key=$1",[data.submission_key]);
    if(old){if(old.invoice_id!==invoiceId)reject("La clave de pago pertenece a otra factura.");return old.id;}
    const issued=invoice.issued_on instanceof Date?invoice.issued_on.toISOString().slice(0,10):String(invoice.issued_on).slice(0,10);
    if(data.paid_on<issued)reject("El pago no puede anteceder a la emisión de la factura.");
    const [balance]=await tx.query<{paid:string}>("SELECT COALESCE(sum(amount_clp),0)::text AS paid FROM extra_receivable_payments WHERE invoice_id=$1",[invoiceId]);
    if(Number(balance.paid)+Number(data.amount_clp)>Number(invoice.total_clp))reject("El abono supera el saldo de la factura.");
    const [created]=await tx.query<{id:string}>(`INSERT INTO extra_receivable_payments
      (submission_key,invoice_id,amount_clp,paid_on,reference,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [data.submission_key,invoiceId,data.amount_clp,data.paid_on,data.reference,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'payment','extra_receivable_invoice',$2,$3)",
      [actor.id,invoiceId,JSON.stringify(data)]);
    return created.id;
  });
}

export async function voidExtraReceivableInvoice(actor:Actor,invoiceId:string,input:unknown){
  admin(actor);
  if(!uuid.safeParse(invoiceId).success)reject("Factura inválida.");
  const reason=z.string().trim().min(5).max(500).parse(input);
  const billingReady=await moduleReady("edp_billing");
  const materialBillingReady=await moduleReady("material_sale_billing");
  await transaction(async tx=>{
    const [invoice]=await tx.query<{status:string}>("SELECT status FROM extra_receivable_invoices WHERE id=$1 FOR UPDATE",[invoiceId]);
    if(!invoice||invoice.status!=="emitida")reject("Factura no vigente.");
    const [paid]=await tx.query("SELECT id FROM extra_receivable_payments WHERE invoice_id=$1 LIMIT 1",[invoiceId]);
    if(paid)reject("No se puede anular una factura que registra pagos.");
    const charges=await tx.query<{id:string}>("SELECT id FROM service_extra_charges WHERE receivable_invoice_id=$1 FOR UPDATE",[invoiceId]);
    const statements=billingReady?await tx.query<{id:string}>("SELECT id FROM payment_statements WHERE receivable_invoice_id=$1 FOR UPDATE",[invoiceId]):[];
    const guideItems=materialBillingReady?await tx.query<{id:string}>(
      "SELECT id FROM material_guide_items WHERE receivable_invoice_id=$1 FOR UPDATE",[invoiceId]):[];
    await tx.query("UPDATE extra_receivable_invoices SET status='anulada' WHERE id=$1",[invoiceId]);
    await tx.query(`UPDATE service_extra_charges SET status='aprobado',invoice_number=NULL,invoiced_on=NULL,
      receivable_invoice_id=NULL WHERE receivable_invoice_id=$1`,[invoiceId]);
    for(const charge of charges)await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'unlink_void_invoice','service_extra_charge',$2,$3)",
      [actor.id,charge.id,JSON.stringify({invoice_id:invoiceId,reason})]);
    if(billingReady)await tx.query(`UPDATE payment_statements SET receivable_invoice_id=NULL,invoice_variance_note=NULL,updated_at=now()
      WHERE receivable_invoice_id=$1`,[invoiceId]);
    for(const statement of statements)await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'unlink_void_invoice','payment_statement',$2,$3)",
      [actor.id,statement.id,JSON.stringify({invoice_id:invoiceId,reason})]);
    if(materialBillingReady)await tx.query("UPDATE material_guide_items SET receivable_invoice_id=NULL,updated_at=now() WHERE receivable_invoice_id=$1",[invoiceId]);
    for(const item of guideItems)await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'unlink_void_invoice','material_guide_item',$2,$3)",
      [actor.id,item.id,JSON.stringify({invoice_id:invoiceId,reason})]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'void','extra_receivable_invoice',$2,$3)",
      [actor.id,invoiceId,JSON.stringify({reason})]);
  });
}
