import {z} from "zod";
import type {Actor} from "./auth";
import {db,transaction,type Db} from "./db";

const uuid=z.uuid();
const optionalId=z.union([uuid,z.literal("")]).default("");
const optional=(max=500)=>z.string().trim().max(max).optional().default("");
const money=z.union([z.string(),z.number()]).transform((value,ctx)=>{
  const text=String(value).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(text)||Number(text)>100_000_000_000){
    ctx.addIssue({code:"custom",message:"Monto en pesos inválido (hasta dos decimales)."});return z.NEVER;
  }
  return text;
});
const positiveMoney=money.refine((value)=>Number(value)>0,"El monto debe ser mayor a cero.");
export class FinanceError extends Error {}
function reject(message:string):never{throw new FinanceError(message);}
function admin(actor:Actor){if(actor.role!=="admin")reject("Este módulo está restringido a administración.");}
async function audit(tx:Db,actor:Actor,action:string,entity:string,id:string,change:unknown){
  await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,$2,$3,$4,$5)",
    [actor.id,action,entity,id,JSON.stringify(change)]);
}

export type Contract={id:string;client_id:string;site_id:string|null;client_name:string;site_name:string|null;code:string;starts_on:Date|string;ends_on:Date|string|null;notes:string|null;active:boolean};
export type Tariff={id:string;contract_id:string;contract_code:string;client_name:string;site_name:string|null;service_type:string;waste_type:string|null;
  unit:string;unit_price_clp:string;valid_from:Date|string;valid_until:Date|string|null;active:boolean};
export type FinancialService={id:string;folio:string;client_id:string;site_id:string;client_name:string;site_name:string;service_type:string;waste_type:string;
  gross_kg:string|null;tare_kg:string|null;status:string;closed_at:Date|null;valuation_id:string|null;quantity:string|null;unit_price_clp:string|null;
  total_clp:string|null;tariff_id:string|null;tariff_unit:string|null;client_order_reference:string|null;invoice_id:string|null;invoice_number:string|null;
  invoice_status:string|null;invoice_total:string|null;paid_clp:string;manual_cost_clp:string;fuel_cost_clp:string};
export type InvoicePayment={id:string;amount_clp:string;paid_on:Date|string;method:string;reference:string;created_at:Date;actor_name:string};
export type ServiceCost={id:string;category:string;amount_clp:string;description:string;created_at:Date;actor_name:string};

const serviceSelect=`SELECT s.id,s.folio,s.client_id,s.site_id,c.name AS client_name,cs.name AS site_name,s.service_type,s.waste_type,s.gross_kg,s.tare_kg,s.status,s.closed_at,
 v.id AS valuation_id,v.quantity,v.unit_price_clp,v.total_clp,v.tariff_id,t.unit AS tariff_unit,v.client_order_reference,
 f.id AS invoice_id,f.invoice_number,f.status AS invoice_status,f.total_clp AS invoice_total,
 COALESCE((SELECT sum(p.amount_clp) FROM invoice_payments p WHERE p.invoice_id=f.id),0)::text AS paid_clp,
 COALESCE((SELECT sum(x.amount_clp) FROM service_costs x WHERE x.service_id=s.id),0)::text AS manual_cost_clp,
 COALESCE((SELECT sum(x.cost_clp) FROM fuel_entries x WHERE x.service_id=s.id),0)::text AS fuel_cost_clp
 FROM service_requests s JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
 LEFT JOIN service_valuations v ON v.service_id=s.id LEFT JOIN service_tariffs t ON t.id=v.tariff_id
 LEFT JOIN service_invoices f ON f.valuation_id=v.id AND f.status='emitida'`;

export async function listFinance(actor:Actor){
  admin(actor);
  const [services,contracts,tariffs,clients,sites]=await Promise.all([
    db.query<FinancialService>(`${serviceSelect} WHERE s.deleted_at IS NULL AND s.status='completada' ORDER BY s.closed_at DESC LIMIT 200`),
    db.query<Contract>(`SELECT c.id,c.client_id,c.site_id,c.code,c.starts_on,c.ends_on,c.notes,c.active,cl.name AS client_name,cs.name AS site_name
      FROM client_contracts c JOIN clients cl ON cl.id=c.client_id LEFT JOIN client_sites cs ON cs.id=c.site_id
      ORDER BY c.created_at DESC LIMIT 200`),
    db.query<Tariff>(`SELECT t.*,c.code AS contract_code,cl.name AS client_name,cs.name AS site_name FROM service_tariffs t
      JOIN client_contracts c ON c.id=t.contract_id JOIN clients cl ON cl.id=c.client_id LEFT JOIN client_sites cs ON cs.id=c.site_id
      WHERE t.active=true ORDER BY t.created_at DESC LIMIT 300`),
    db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name"),
    db.query<{id:string;client_id:string;name:string;client_name:string}>(`SELECT s.id,s.client_id,s.name,c.name AS client_name FROM client_sites s JOIN clients c ON c.id=s.client_id
      WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.name,s.name`),
  ]);
  return {services,contracts,tariffs,clients,sites};
}

export async function getFinancialService(actor:Actor,id:string){
  admin(actor);
  if(!uuid.safeParse(id).success)reject("Folio inválido.");
  const [service]=await db.query<FinancialService>(`${serviceSelect} WHERE s.id=$1 AND s.deleted_at IS NULL`,[id]);
  if(!service)reject("Servicio no encontrado.");
  const [tariffs,payments,costs,voidedInvoices]=await Promise.all([
    db.query<Tariff>(`SELECT t.*,c.code AS contract_code,cl.name AS client_name,cs.name AS site_name FROM service_tariffs t
      JOIN client_contracts c ON c.id=t.contract_id JOIN clients cl ON cl.id=c.client_id LEFT JOIN client_sites cs ON cs.id=c.site_id
      WHERE t.active=true AND c.active=true AND c.client_id=$1 AND (c.site_id IS NULL OR c.site_id=$2)
        AND t.service_type=$3 AND (t.waste_type IS NULL OR lower(t.waste_type)=lower($4))
        AND $5::timestamptz IS NOT NULL AND t.valid_from <= ($5::timestamptz AT TIME ZONE 'America/Santiago')::date
        AND (t.valid_until IS NULL OR t.valid_until >= ($5::timestamptz AT TIME ZONE 'America/Santiago')::date)
        AND c.starts_on <= ($5::timestamptz AT TIME ZONE 'America/Santiago')::date
        AND (c.ends_on IS NULL OR c.ends_on >= ($5::timestamptz AT TIME ZONE 'America/Santiago')::date)
      ORDER BY (c.site_id IS NOT NULL) DESC,(t.waste_type IS NOT NULL) DESC,t.valid_from DESC`,
      [service.client_id,service.site_id,service.service_type,service.waste_type,service.closed_at]),
    db.query<InvoicePayment>(`SELECT p.id,p.amount_clp,p.paid_on,p.method,p.reference,p.created_at,u.name AS actor_name
      FROM invoice_payments p JOIN users u ON u.id=p.created_by JOIN service_invoices f ON f.id=p.invoice_id
      JOIN service_valuations v ON v.id=f.valuation_id WHERE v.service_id=$1 ORDER BY p.created_at DESC`,[id]),
    db.query<ServiceCost>(`SELECT x.id,x.category,x.amount_clp,x.description,x.created_at,u.name AS actor_name
      FROM service_costs x JOIN users u ON u.id=x.created_by WHERE x.service_id=$1 ORDER BY x.created_at DESC`,[id]),
    db.query<{invoice_number:string;created_at:Date}>(`SELECT f.invoice_number,f.created_at FROM service_invoices f
      JOIN service_valuations v ON v.id=f.valuation_id WHERE v.service_id=$1 AND f.status='anulada' ORDER BY f.created_at DESC`,[id]),
  ]);
  return {service,tariffs,payments,costs,voidedInvoices};
}

export async function createContract(actor:Actor,input:unknown){
  admin(actor);
  const data=z.object({client_id:uuid,site_id:optionalId,code:z.string().trim().min(2).max(80),starts_on:z.iso.date(),
    ends_on:z.union([z.iso.date(),z.literal("")]).default(""),notes:optional(1000)}).parse(input);
  if(data.ends_on&&data.ends_on<data.starts_on)reject("El término del contrato debe ser posterior al inicio.");
  return transaction(async(tx)=>{
    const [client]=await tx.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.client_id]);
    if(!client)reject("Cliente no encontrado.");
    if(data.site_id){const [site]=await tx.query("SELECT id FROM client_sites WHERE id=$1 AND client_id=$2 AND deleted_at IS NULL",[data.site_id,data.client_id]);if(!site)reject("La faena no pertenece al cliente.");}
    const [contract]=await tx.query<{id:string}>(`INSERT INTO client_contracts (client_id,site_id,code,starts_on,ends_on,notes,created_by)
      VALUES ($1,NULLIF($2,'')::uuid,$3,$4,NULLIF($5,'')::date,NULLIF($6,''),$7) RETURNING id`,
      [data.client_id,data.site_id,data.code,data.starts_on,data.ends_on,data.notes,actor.id]);
    await audit(tx,actor,"create","client_contract",contract.id,data);
    return contract.id;
  });
}

export async function createTariff(actor:Actor,input:unknown){
  admin(actor);
  const data=z.object({contract_id:uuid,service_type:z.enum(["retiro","traslado","compra","venta","otro"]),
    waste_type:optional(120),unit:z.enum(["servicio","kg"]),unit_price_clp:money,valid_from:z.iso.date(),
    valid_until:z.union([z.iso.date(),z.literal("")]).default("")}).parse(input);
  if(data.valid_until&&data.valid_until<data.valid_from)reject("La vigencia de tarifa no puede terminar antes del inicio.");
  return transaction(async(tx)=>{
    const [contract]=await tx.query<{starts_on:Date|string;ends_on:Date|string|null;active:boolean}>("SELECT starts_on,ends_on,active FROM client_contracts WHERE id=$1 FOR UPDATE",[data.contract_id]);
    if(!contract?.active)reject("Seleccione un contrato vigente como registro activo.");
    const [overlap]=await tx.query(`SELECT id FROM service_tariffs WHERE contract_id=$1 AND active=true AND service_type=$2
      AND lower(coalesce(waste_type,''))=lower($3) AND valid_from<=COALESCE(NULLIF($5,'')::date,'infinity'::date)
      AND COALESCE(valid_until,'infinity'::date)>=$4::date LIMIT 1`,
      [data.contract_id,data.service_type,data.waste_type,data.valid_from,data.valid_until]);
    if(overlap)reject("Ya existe una tarifa superpuesta para este tipo y residuo en el contrato.");
    const [tariff]=await tx.query<{id:string}>(`INSERT INTO service_tariffs
      (contract_id,service_type,waste_type,unit,unit_price_clp,valid_from,valid_until,created_by)
      VALUES ($1,$2,NULLIF($3,''),$4,$5,$6,NULLIF($7,'')::date,$8) RETURNING id`,
      [data.contract_id,data.service_type,data.waste_type,data.unit,data.unit_price_clp,data.valid_from,data.valid_until,actor.id]);
    await audit(tx,actor,"create","service_tariff",tariff.id,data);
    return tariff.id;
  });
}

export async function valueService(actor:Actor,serviceId:string,input:unknown){
  admin(actor);
  const id=uuid.parse(serviceId);
  const data=z.object({tariff_id:uuid,client_order_reference:optional(80)}).parse(input);
  return transaction(async(tx)=>{
    const [service]=await tx.query<{client_id:string;site_id:string;service_type:string;waste_type:string;status:string;
      closed_at:Date;gross_kg:string;tare_kg:string}>(`SELECT client_id,site_id,service_type,waste_type,status,closed_at,gross_kg,tare_kg
      FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[id]);
    if(!service||service.status!=="completada")reject("La valorización exige un servicio cerrado.");
    const [tariff]=await tx.query<{unit:string;unit_price_clp:string}>(`SELECT t.unit,t.unit_price_clp FROM service_tariffs t JOIN client_contracts c ON c.id=t.contract_id
      WHERE t.id=$1 AND t.active=true AND c.active=true AND c.client_id=$2 AND (c.site_id IS NULL OR c.site_id=$3)
        AND t.service_type=$4 AND (t.waste_type IS NULL OR lower(t.waste_type)=lower($5))
        AND t.valid_from <= ($6::timestamptz AT TIME ZONE 'America/Santiago')::date
        AND (t.valid_until IS NULL OR t.valid_until >= ($6::timestamptz AT TIME ZONE 'America/Santiago')::date)
        AND c.starts_on <= ($6::timestamptz AT TIME ZONE 'America/Santiago')::date
        AND (c.ends_on IS NULL OR c.ends_on >= ($6::timestamptz AT TIME ZONE 'America/Santiago')::date)`,
      [data.tariff_id,service.client_id,service.site_id,service.service_type,service.waste_type,service.closed_at]);
    if(!tariff)reject("La tarifa no corresponde al cliente, servicio, residuo o fecha de cierre.");
    const qty=tariff.unit==="kg"?Number(service.gross_kg)-Number(service.tare_kg):1;
    if(qty<0)reject("El pesaje no admite valorización negativa.");
    const [valued]=await tx.query<{id:string}>(`INSERT INTO service_valuations
      (service_id,tariff_id,quantity,unit_price_clp,total_clp,client_order_reference,created_by)
      VALUES ($1,$2,$3,$4,round($3::numeric*$4::numeric,2),NULLIF($5,''),$6) RETURNING id`,
      [id,data.tariff_id,qty,tariff.unit_price_clp,data.client_order_reference,actor.id]);
    await audit(tx,actor,"value","service_valuation",valued.id,{service_id:id,tariff_id:data.tariff_id,quantity:qty,unit_price_clp:tariff.unit_price_clp});
    return valued.id;
  });
}

export async function registerInvoice(actor:Actor,serviceId:string,input:unknown){
  admin(actor);
  const id=uuid.parse(serviceId);
  const data=z.object({invoice_number:z.string().trim().min(2).max(80),issued_on:z.iso.date(),due_on:z.iso.date()}).parse(input);
  if(data.due_on<data.issued_on)reject("El vencimiento de la factura no puede ser anterior a su emisión.");
  return transaction(async(tx)=>{
    const [valuation]=await tx.query<{id:string;total_clp:string}>("SELECT id,total_clp FROM service_valuations WHERE service_id=$1 FOR UPDATE",[id]);
    if(!valuation)reject("Valorice el servicio antes de asociar una factura.");
    const [invoice]=await tx.query<{id:string}>(`INSERT INTO service_invoices (valuation_id,invoice_number,issued_on,due_on,total_clp,created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,[valuation.id,data.invoice_number,data.issued_on,data.due_on,valuation.total_clp,actor.id]);
    await audit(tx,actor,"invoice","service_invoice",invoice.id,{service_id:id,...data,total_clp:valuation.total_clp});
    return invoice.id;
  });
}

export async function voidInvoice(actor:Actor,invoiceId:string,reason:unknown){
  admin(actor);
  const id=uuid.parse(invoiceId);
  const explanation=z.string().trim().min(5).max(500).parse(reason);
  await transaction(async(tx)=>{
    const [invoice]=await tx.query<{status:string}>("SELECT status FROM service_invoices WHERE id=$1 FOR UPDATE",[id]);
    if(!invoice||invoice.status!=="emitida")reject("La factura interna no está vigente.");
    const [payment]=await tx.query("SELECT id FROM invoice_payments WHERE invoice_id=$1 LIMIT 1",[id]);
    if(payment)reject("No anule una factura que registra pagos; requiere revisión administrativa.");
    await tx.query("UPDATE service_invoices SET status='anulada' WHERE id=$1",[id]);
    await audit(tx,actor,"void","service_invoice",id,{reason:explanation});
  });
}

export async function registerPayment(actor:Actor,invoiceId:string,input:unknown){
  admin(actor);
  const id=uuid.parse(invoiceId);
  const data=z.object({submission_key:uuid,amount_clp:positiveMoney,paid_on:z.iso.date(),
    method:z.enum(["transferencia","efectivo","tarjeta","otro"]),reference:z.string().trim().min(2).max(120)}).parse(input);
  return transaction(async(tx)=>{
    const [invoice]=await tx.query<{status:string;total_clp:string}>("SELECT status,total_clp FROM service_invoices WHERE id=$1 FOR UPDATE",[id]);
    if(!invoice)reject("Factura no encontrada.");
    const [previous]=await tx.query<{id:string;invoice_id:string}>("SELECT id,invoice_id FROM invoice_payments WHERE submission_key=$1",[data.submission_key]);
    if(previous){if(previous.invoice_id!==id)reject("Clave de pago asignada a otra factura.");return previous.id;}
    if(invoice.status!=="emitida")reject("La factura está anulada.");
    const [balance]=await tx.query<{allowed:boolean}>(`SELECT ($2::numeric+COALESCE((SELECT sum(amount_clp) FROM invoice_payments WHERE invoice_id=$1),0))<=total_clp AS allowed
      FROM service_invoices WHERE id=$1`,[id,data.amount_clp]);
    if(!balance?.allowed)reject("El pago supera el saldo pendiente de la factura.");
    const [payment]=await tx.query<{id:string}>(`INSERT INTO invoice_payments (submission_key,invoice_id,amount_clp,paid_on,method,reference,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[data.submission_key,id,data.amount_clp,data.paid_on,data.method,data.reference,actor.id]);
    await audit(tx,actor,"payment","invoice_payment",payment.id,{invoice_id:id,...data});
    return payment.id;
  });
}

export async function addServiceCost(actor:Actor,serviceId:string,input:unknown){
  admin(actor);
  const id=uuid.parse(serviceId);
  const data=z.object({submission_key:uuid,category:z.enum(["mano_obra","disposicion","peajes","equipos","otros"]),
    amount_clp:positiveMoney,description:z.string().trim().min(5).max(500)}).parse(input);
  return transaction(async(tx)=>{
    const [service]=await tx.query("SELECT id FROM service_requests WHERE id=$1 AND status='completada' AND deleted_at IS NULL",[id]);
    if(!service)reject("Los costos se registran sobre servicios cerrados.");
    const [cost]=await tx.query<{id:string}>(`INSERT INTO service_costs (submission_key,service_id,category,amount_clp,description,created_by)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (submission_key) DO NOTHING RETURNING id`,
      [data.submission_key,id,data.category,data.amount_clp,data.description,actor.id]);
    if(!cost){const [previous]=await tx.query<{id:string;service_id:string}>("SELECT id,service_id FROM service_costs WHERE submission_key=$1",[data.submission_key]);if(!previous||previous.service_id!==id)reject("La clave de costo se usó para otro servicio.");return previous.id;}
    await audit(tx,actor,"cost","service_cost",cost.id,{service_id:id,...data});
    return cost.id;
  });
}
