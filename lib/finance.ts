import {z} from "zod";
import type {Actor} from "./auth";
import {db,transaction,type Db} from "./db";
import type {Company} from "./companies";
import {moduleReady} from "./schema-readiness";
import {listEdpServiceInvoices} from "./edp-invoice-links";
import {financeDay,isFinanceId,type FinanceCatalogKind} from "./finance-catalog-state";

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
async function authorizeFinance(tx:Db,actor:Actor){
  admin(actor);const [user]=await tx.query("SELECT id FROM users WHERE id=$1 AND role='admin' AND active=true FOR SHARE",[actor.id]);
  if(!user)reject("Su acceso de administración ya no está activo.");
}
async function requireContractParties(tx:Db,id:string){
  const [contract]=await tx.query<{client_id:string;site_id:string|null}>("SELECT client_id,site_id FROM client_contracts WHERE id=$1",[id]);
  if(!contract)reject("Contrato no disponible.");
  const [client]=await tx.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL FOR SHARE",[contract.client_id]);
  if(!client)reject("El cliente del contrato ya no está disponible.");
  if(contract.site_id){const [site]=await tx.query("SELECT id FROM client_sites WHERE id=$1 AND client_id=$2 AND deleted_at IS NULL FOR SHARE",[contract.site_id,contract.client_id]);if(!site)reject("La faena del contrato ya no está disponible.");}
}
async function audit(tx:Db,actor:Actor,action:string,entity:string,id:string,change:unknown){
  await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,$2,$3,$4,$5)",
    [actor.id,action,entity,id,JSON.stringify(change)]);
}

export type Contract={id:string;client_id:string;site_id:string|null;client_name:string;site_name:string|null;code:string;operating_company:Company|null;starts_on:Date|string;ends_on:Date|string|null;notes:string|null;active:boolean;available:boolean};
export type Tariff={id:string;contract_id:string;contract_code:string;client_name:string;site_name:string|null;service_type:string;waste_type:string|null;
  unit:string;unit_price_clp:string;valid_from:Date|string;valid_until:Date|string|null;active:boolean;available:boolean;operating_company:Company|null};
export type TariffNotice={id:string;contract_code:string;client_name:string;client_email:string|null;service_type:string;waste_type:string|null;
  old_price:string;new_price:string;unit:string;valid_from:Date|string;reason:string;status:"pendiente"|"enviado";
  notified_on:Date|string|null;channel:string|null;recipient:string|null;reference:string|null};
export type FinancialService={id:string;folio:string;client_id:string;site_id:string;client_name:string;site_name:string;service_type:string;waste_type:string;
  operating_company:Company|null;
  gross_kg:string|null;tare_kg:string|null;status:string;closed_at:Date|null;valuation_id:string|null;quantity:string|null;unit_price_clp:string|null;
  total_clp:string|null;tariff_id:string|null;tariff_unit:string|null;client_order_reference:string|null;
  requires_client_oc:boolean;client_oc_reference:string|null;in_payment_statement:boolean;payment_statement_id:string|null;
  invoice_id:string|null;invoice_number:string|null;
  invoice_status:string|null;invoice_total:string|null;invoice_total_verified:boolean|null;paid_clp:string;manual_cost_clp:string;fuel_cost_clp:string};
export type InvoicePayment={id:string;amount_clp:string;paid_on:Date|string;method:string;reference:string;created_at:Date;actor_name:string};
export type ServiceCost={id:string;category:string;amount_clp:string;description:string;created_at:Date;actor_name:string};

const serviceSelect=`SELECT s.id,s.folio,s.client_id,s.site_id,s.operating_company,c.name AS client_name,cs.name AS site_name,s.service_type,s.waste_type,s.gross_kg,s.tare_kg,s.status,s.closed_at,
 v.id AS valuation_id,v.quantity,v.unit_price_clp,v.total_clp,v.tariff_id,t.unit AS tariff_unit,v.client_order_reference,
 (COALESCE(cp.requires_oc,false) AND q.client_order_exception IS NULL) AS requires_client_oc,
 COALESCE(NULLIF(btrim(v.client_order_reference),''),NULLIF(btrim(cd.order_reference),''),NULLIF(btrim(q.client_order_reference),'')) AS client_oc_reference,
 EXISTS (SELECT 1 FROM payment_statement_operations po WHERE po.service_id=s.id) AS in_payment_statement,
 (SELECT po.statement_id FROM payment_statement_operations po WHERE po.service_id=s.id LIMIT 1) AS payment_statement_id,
 f.id AS invoice_id,f.invoice_number,f.status AS invoice_status,f.total_clp AS invoice_total,f.total_verified AS invoice_total_verified,
 COALESCE((SELECT sum(p.amount_clp) FROM invoice_payments p WHERE p.invoice_id=f.id),0)::text AS paid_clp,
 COALESCE((SELECT sum(x.amount_clp) FROM service_costs x WHERE x.service_id=s.id),0)::text AS manual_cost_clp,
 COALESCE((SELECT sum(x.cost_clp) FROM fuel_entries x WHERE x.service_id=s.id),0)::text AS fuel_cost_clp
 FROM service_requests s JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
 LEFT JOIN counterparty_profiles cp ON cp.client_id=s.client_id AND cp.kind IN ('cliente','ambos')
 LEFT JOIN service_commercial_details cd ON cd.service_id=s.id
 LEFT JOIN client_quotes q ON q.id=s.quote_id
 LEFT JOIN service_valuations v ON v.service_id=s.id LEFT JOIN service_tariffs t ON t.id=v.tariff_id
 LEFT JOIN service_invoices f ON f.valuation_id=v.id AND f.status='emitida'`;

const contractSelect=`SELECT c.id,c.client_id,c.site_id,c.code,c.operating_company,c.starts_on,c.ends_on,c.notes,c.active,cl.name AS client_name,cs.name AS site_name,
  (c.active AND c.operating_company IS NOT NULL AND cl.deleted_at IS NULL AND (c.site_id IS NULL OR cs.deleted_at IS NULL)) AS available
  FROM client_contracts c JOIN clients cl ON cl.id=c.client_id LEFT JOIN client_sites cs ON cs.id=c.site_id`;
const tariffSelect=`SELECT t.*,c.code AS contract_code,c.operating_company,cl.name AS client_name,cs.name AS site_name,
  (t.active AND c.active AND c.operating_company IS NOT NULL AND cl.deleted_at IS NULL AND (c.site_id IS NULL OR cs.deleted_at IS NULL)) AS available
  FROM service_tariffs t JOIN client_contracts c ON c.id=t.contract_id JOIN clients cl ON cl.id=c.client_id LEFT JOIN client_sites cs ON cs.id=c.site_id`;
const noticeSelect=`SELECT n.id,c.code AS contract_code,cl.name AS client_name,cl.email AS client_email,
  t.service_type,t.waste_type,t.unit,old.unit_price_clp AS old_price,t.unit_price_clp AS new_price,t.valid_from,
  n.reason,n.status,n.notified_on,n.channel,n.recipient,n.reference
  FROM tariff_change_notices n JOIN service_tariffs t ON t.id=n.new_tariff_id
  JOIN service_tariffs old ON old.id=n.old_tariff_id JOIN client_contracts c ON c.id=t.contract_id JOIN clients cl ON cl.id=c.client_id`;
export async function listFinance(actor:Actor,company="rerchar",clientOcOnly=false,pendingIndividualOnly=false,page=1,noticeFilter:""|"pendiente"="",noticePage=1,focus:{kind?:FinanceCatalogKind;id?:string}={}){
  admin(actor);
  if(!["rerchar","e_y_j","pendiente"].includes(company))reject("Empresa inválida.");
  if(noticeFilter!==""&&noticeFilter!=="pendiente")reject("Filtro de avisos inválido.");
  const pageNumber=Number.isSafeInteger(page)&&page>0&&page<=10_000?page:1;
  const noticePageNumber=Number.isSafeInteger(noticePage)&&noticePage>0&&noticePage<=10_000?noticePage:1;
  const pageSize=100;
  const [serviceRows,contracts,tariffs,clients,sites,noticeRows,pendingNotices]=await Promise.all([
    db.query<FinancialService>(`SELECT * FROM (${serviceSelect} WHERE s.deleted_at IS NULL AND s.status='completada'
      AND ($1='pendiente' AND s.operating_company IS NULL OR s.operating_company=$1)) AS service
      WHERE ($2::boolean=false OR (requires_client_oc AND client_oc_reference IS NULL AND invoice_id IS NULL AND NOT in_payment_statement))
        AND ($3::boolean=false OR (valuation_id IS NOT NULL AND invoice_id IS NULL AND NOT in_payment_statement))
      ORDER BY closed_at DESC,id DESC LIMIT $4 OFFSET $5`,
    [company,clientOcOnly,pendingIndividualOnly,pageSize+1,(pageNumber-1)*pageSize]),
    db.query<Contract>(`${contractSelect}
      WHERE ($1='pendiente' AND c.operating_company IS NULL OR c.operating_company=$1)
      ORDER BY c.created_at DESC,c.id DESC`,[company]),
    db.query<Tariff>(`${tariffSelect}
      WHERE ($1='pendiente' AND c.operating_company IS NULL OR c.operating_company=$1)
      ORDER BY t.created_at DESC,t.id DESC`,[company]),
    db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name,id"),
    db.query<{id:string;client_id:string;name:string;client_name:string}>(`SELECT s.id,s.client_id,s.name,c.name AS client_name FROM client_sites s JOIN clients c ON c.id=s.client_id
      WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.name,s.name,s.id`),
    db.query<TariffNotice>(`${noticeSelect}
      WHERE ($1='pendiente' AND c.operating_company IS NULL OR c.operating_company=$1) AND ($2::text='' OR n.status=$2)
      ORDER BY CASE n.status WHEN 'pendiente' THEN 0 ELSE 1 END,n.created_at DESC,n.id DESC LIMIT $3 OFFSET $4`,
      [company,noticeFilter,pageSize+1,(noticePageNumber-1)*pageSize]),
    db.query<{total:string}>(`SELECT count(*)::text AS total FROM tariff_change_notices n
      JOIN service_tariffs t ON t.id=n.new_tariff_id JOIN client_contracts c ON c.id=t.contract_id
      WHERE n.status='pendiente' AND ($1='pendiente' AND c.operating_company IS NULL OR c.operating_company=$1)`,[company]),
  ]);
  const services=serviceRows.slice(0,pageSize);
  const edpInvoices=await listEdpServiceInvoices(services.map(service=>service.id));
  const focusedContract=isFinanceId(focus.id)&&(focus.kind==="contract"||focus.kind==="classify")?
    contracts.find(c=>c.id===focus.id)??(await db.query<Contract>(`${contractSelect} WHERE c.id=$2 AND ($1='pendiente' OR c.operating_company=$1)`,[company,focus.id]))[0]:undefined;
  const focusedTariff=isFinanceId(focus.id)&&(focus.kind==="tariff"||focus.kind==="revise")?tariffs.find(t=>t.id===focus.id):undefined;
  const focusedNotice=isFinanceId(focus.id)&&focus.kind==="notice"?
    noticeRows.find(n=>n.id===focus.id)??(await db.query<TariffNotice>(`${noticeSelect} WHERE n.id=$2 AND ($1='pendiente' AND c.operating_company IS NULL OR c.operating_company=$1)`,[company,focus.id]))[0]:undefined;
  return {services,edpInvoices,hasMoreServices:serviceRows.length>pageSize,
    contracts,tariffs,clients,sites,notices:noticeRows.slice(0,pageSize),hasMoreNotices:noticeRows.length>pageSize,focusedContract,focusedTariff,focusedNotice,
    pendingNoticeCount:pendingNotices[0]?.total??"0"};
}

export async function pendingClientOrders(actor:Actor,company:Company){
  admin(actor);
  const [row]=await db.query<{total:string}>(`SELECT count(*)::text AS total FROM (${serviceSelect}
    WHERE s.operating_company=$1 AND s.deleted_at IS NULL AND s.status='completada') AS service
    WHERE requires_client_oc AND client_oc_reference IS NULL AND invoice_id IS NULL AND NOT in_payment_statement`,[company]);
  return Number(row?.total??0);
}

export async function pendingIndividualInvoices(actor:Actor,company:Company){
  admin(actor);
  const [row]=await db.query<{total:string}>(`SELECT count(*)::text AS total FROM service_requests s
    JOIN service_valuations v ON v.service_id=s.id
    WHERE s.operating_company=$1 AND s.status='completada' AND s.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM service_invoices f WHERE f.valuation_id=v.id AND f.status='emitida')
      AND NOT EXISTS (SELECT 1 FROM payment_statement_operations po WHERE po.service_id=s.id)`,[company]);
  return Number(row?.total??0);
}

export async function getFinancialService(actor:Actor,id:string){
  admin(actor);
  if(!uuid.safeParse(id).success)reject("Folio inválido.");
  const [service]=await db.query<FinancialService>(`${serviceSelect} WHERE s.id=$1 AND s.deleted_at IS NULL`,[id]);
  if(!service)reject("Servicio no encontrado.");
  const [tariffs,payments,costs,voidedInvoices,edpInvoices]=await Promise.all([
    db.query<Tariff>(`${tariffSelect}
      WHERE t.active=true AND c.active=true AND c.client_id=$1 AND c.operating_company=$6 AND (c.site_id IS NULL OR c.site_id=$2)
        AND t.service_type=$3 AND (t.waste_type IS NULL OR lower(t.waste_type)=lower($4))
        AND $5::timestamptz IS NOT NULL AND t.valid_from <= ($5::timestamptz AT TIME ZONE 'America/Santiago')::date
        AND (t.valid_until IS NULL OR t.valid_until >= ($5::timestamptz AT TIME ZONE 'America/Santiago')::date)
        AND c.starts_on <= ($5::timestamptz AT TIME ZONE 'America/Santiago')::date
        AND (c.ends_on IS NULL OR c.ends_on >= ($5::timestamptz AT TIME ZONE 'America/Santiago')::date)
      ORDER BY (c.site_id IS NOT NULL) DESC,(t.waste_type IS NOT NULL) DESC,t.valid_from DESC`,
      [service.client_id,service.site_id,service.service_type,service.waste_type,service.closed_at,service.operating_company]),
    db.query<InvoicePayment>(`SELECT p.id,p.amount_clp,p.paid_on,p.method,p.reference,p.created_at,u.name AS actor_name
      FROM invoice_payments p JOIN users u ON u.id=p.created_by JOIN service_invoices f ON f.id=p.invoice_id
      JOIN service_valuations v ON v.id=f.valuation_id WHERE v.service_id=$1 ORDER BY p.created_at DESC,p.id DESC`,[id]),
    db.query<ServiceCost>(`SELECT x.id,x.category,x.amount_clp,x.description,x.created_at,u.name AS actor_name
      FROM service_costs x JOIN users u ON u.id=x.created_by WHERE x.service_id=$1 ORDER BY x.created_at DESC,x.id DESC`,[id]),
    db.query<{id:string;invoice_number:string;created_at:Date}>(`SELECT f.id,f.invoice_number,f.created_at FROM service_invoices f
      JOIN service_valuations v ON v.id=f.valuation_id WHERE v.service_id=$1 AND f.status='anulada' ORDER BY f.created_at DESC,f.id DESC`,[id]),
    listEdpServiceInvoices([id]),
  ]);
  return {service,tariffs,payments,costs,voidedInvoices,edpInvoices};
}

export async function createContract(actor:Actor,input:unknown){
  admin(actor);
  const data=z.object({client_id:uuid,site_id:optionalId,operating_company:z.enum(["rerchar","e_y_j"]),code:z.string().trim().min(2).max(80),starts_on:z.iso.date(),
    ends_on:z.union([z.iso.date(),z.literal("")]).default(""),notes:optional(1000)}).parse(input);
  if(data.ends_on&&data.ends_on<data.starts_on)reject("El término del contrato debe ser posterior al inicio.");
  return transaction(async(tx)=>{
    await authorizeFinance(tx,actor);
    const [client]=await tx.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL FOR SHARE",[data.client_id]);
    if(!client)reject("Cliente no encontrado.");
    if(data.site_id){const [site]=await tx.query("SELECT id FROM client_sites WHERE id=$1 AND client_id=$2 AND deleted_at IS NULL FOR SHARE",[data.site_id,data.client_id]);if(!site)reject("La faena no pertenece al cliente.");}
    const [contract]=await tx.query<{id:string}>(`INSERT INTO client_contracts (client_id,site_id,operating_company,code,starts_on,ends_on,notes,created_by)
      VALUES ($1,NULLIF($2,'')::uuid,$3,$4,$5,NULLIF($6,'')::date,NULLIF($7,''),$8) RETURNING id`,
      [data.client_id,data.site_id,data.operating_company,data.code,data.starts_on,data.ends_on,data.notes,actor.id]);
    await audit(tx,actor,"create","client_contract",contract.id,data);
    return contract.id;
  });
}

export async function classifyContractCompany(actor:Actor,id:string,input:unknown){
  admin(actor);uuid.parse(id);
  const company=z.enum(["rerchar","e_y_j"]).parse(input);
  await transaction(async tx=>{
    await authorizeFinance(tx,actor);
    const [contract]=await tx.query<{operating_company:Company|null}>("SELECT operating_company FROM client_contracts WHERE id=$1 FOR UPDATE",[id]);
    if(!contract||contract.operating_company)reject("Este contrato no está pendiente de clasificación.");
    const [mismatch]=await tx.query(`SELECT 1 FROM service_valuations v JOIN service_tariffs t ON t.id=v.tariff_id
      JOIN service_requests s ON s.id=v.service_id
      WHERE t.contract_id=$1 AND s.operating_company IS NOT NULL AND s.operating_company<>$2 LIMIT 1`,[id,company]);
    if(mismatch)reject("Una valorización asociada corresponde a la otra empresa. Revise el contrato.");
    await tx.query("UPDATE client_contracts SET operating_company=$2 WHERE id=$1",[id,company]);
    await audit(tx,actor,"classify_company","client_contract",id,{operating_company:company});
  });
}

export async function createTariff(actor:Actor,input:unknown){
  admin(actor);
  const data=z.object({contract_id:uuid,service_type:z.enum(["retiro","traslado","arriendo","compra","venta","otro"]),
    waste_type:optional(120),unit:z.enum(["servicio","kg","dia"]),unit_price_clp:money,valid_from:z.iso.date(),
    valid_until:z.union([z.iso.date(),z.literal("")]).default("")}).parse(input);
  if(data.valid_until&&data.valid_until<data.valid_from)reject("La vigencia de tarifa no puede terminar antes del inicio.");
  if(data.unit==="dia"&&data.service_type!=="arriendo")reject("La tarifa por día corresponde sólo a arriendos.");
  if(data.service_type==="arriendo"&&data.unit==="kg")reject("El arriendo no se valoriza por kilos.");
  return transaction(async(tx)=>{
    await authorizeFinance(tx,actor);
    const [contract]=await tx.query<{starts_on:Date|string;ends_on:Date|string|null;active:boolean;operating_company:Company|null}>("SELECT starts_on,ends_on,active,operating_company FROM client_contracts WHERE id=$1 FOR UPDATE",[data.contract_id]);
    if(!contract?.active)reject("Seleccione un contrato vigente como registro activo.");
    if(!contract.operating_company)reject("Confirme la empresa del contrato antes de registrar tarifas nuevas.");
    await requireContractParties(tx,data.contract_id);
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

export async function reviseTariff(actor:Actor,tariffId:string,input:unknown){
  admin(actor);const id=uuid.parse(tariffId);
  const data=z.object({unit_price_clp:money,valid_from:z.iso.date(),reason:z.string().trim().min(10).max(500)}).parse(input);
  return transaction(async tx=>{
    await authorizeFinance(tx,actor);
    const [source]=await tx.query<{contract_id:string}>("SELECT contract_id FROM service_tariffs WHERE id=$1",[id]);
    if(!source)reject("La tarifa no está disponible.");
    const [contract]=await tx.query<{active:boolean;operating_company:Company|null}>("SELECT active,operating_company FROM client_contracts WHERE id=$1 FOR UPDATE",[source.contract_id]);
    if(!contract?.active)reject("El contrato ya no está activo.");
    if(!contract.operating_company)reject("Confirme la empresa del contrato antes de modificar tarifas.");
    const [old]=await tx.query<{contract_id:string;service_type:string;waste_type:string|null;unit:string;unit_price_clp:string;
      valid_from:Date|string;valid_until:Date|string|null;active:boolean}>("SELECT * FROM service_tariffs WHERE id=$1 FOR UPDATE",[id]);
    if(!old?.active)reject("La tarifa no está activa.");
    if(old.contract_id!==source.contract_id)reject("La tarifa cambió de contrato. Vuelva a consultar el registro.");
    await requireContractParties(tx,old.contract_id);
    const day=financeDay;
    if(data.valid_from<=day(old.valid_from)||old.valid_until&&data.valid_from>day(old.valid_until))
      reject("La nueva vigencia debe empezar después de la tarifa anterior y dentro de su período.");
    if(Number(data.unit_price_clp)===Number(old.unit_price_clp))reject("El precio no cambió.");
    const [later]=await tx.query("SELECT id FROM service_tariffs WHERE contract_id=$1 AND id<>$2 AND active=true AND service_type=$3 AND lower(coalesce(waste_type,''))=lower($4) AND valid_from>=$5::date LIMIT 1",
      [old.contract_id,id,old.service_type,old.waste_type??"",data.valid_from]);
    if(later)reject("Hay otra tarifa posterior para este concepto. Revise el calendario antes de modificarlo.");
    const [valued]=await tx.query(`SELECT v.id FROM service_valuations v JOIN service_requests s ON s.id=v.service_id
      WHERE v.tariff_id=$1 AND (s.closed_at AT TIME ZONE 'America/Santiago')::date >= $2::date LIMIT 1`,[id,data.valid_from]);
    if(valued)reject("Ya existen servicios valorizados desde la nueva fecha. Revise esos registros antes de cambiar la vigencia.");
    await tx.query("UPDATE service_tariffs SET valid_until=$2::date-1 WHERE id=$1",[id,data.valid_from]);
    const [tariff]=await tx.query<{id:string}>(`INSERT INTO service_tariffs
      (contract_id,service_type,waste_type,unit,unit_price_clp,valid_from,valid_until,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [old.contract_id,old.service_type,old.waste_type,old.unit,data.unit_price_clp,data.valid_from,old.valid_until,actor.id]);
    const [notice]=await tx.query<{id:string}>(`INSERT INTO tariff_change_notices(old_tariff_id,new_tariff_id,reason)
      VALUES($1,$2,$3) RETURNING id`,[id,tariff.id,data.reason]);
    await audit(tx,actor,"revise","service_tariff",tariff.id,{old_tariff_id:id,old_price:old.unit_price_clp,
      new_price:data.unit_price_clp,valid_from:data.valid_from,reason:data.reason,notice_id:notice.id});
    return tariff.id;
  });
}

export async function recordTariffNotice(actor:Actor,noticeId:string,input:unknown){
  admin(actor);const id=uuid.parse(noticeId);
  const data=z.object({channel:z.enum(["correo","presencial"]),recipient:z.string().trim().min(2).max(254),
    notified_on:z.iso.date(),reference:z.string().trim().min(10).max(500)}).parse(input);
  if(data.channel==="correo"&&!z.email().safeParse(data.recipient).success)reject("Ingrese el correo real que recibió el aviso.");
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if(data.notified_on>today)reject("La fecha del aviso no puede ser futura: registre una comunicación ya realizada.");
  await transaction(async tx=>{
    await authorizeFinance(tx,actor);
    const [notice]=await tx.query<{status:string}>("SELECT status FROM tariff_change_notices WHERE id=$1 FOR UPDATE",[id]);
    if(notice?.status!=="pendiente")reject("El aviso ya fue registrado o no existe.");
    await tx.query(`UPDATE tariff_change_notices SET status='enviado',notified_on=$2,channel=$3,recipient=$4,reference=$5,recorded_by=$6 WHERE id=$1`,
      [id,data.notified_on,data.channel,data.recipient,data.reference,actor.id]);
    await audit(tx,actor,"notice","tariff_change_notice",id,data);
  });
}

export async function valueService(actor:Actor,serviceId:string,input:unknown){
  admin(actor);
  const id=uuid.parse(serviceId);
  const data=z.object({tariff_id:uuid,client_order_reference:optional(80)}).parse(input);
  return transaction(async(tx)=>{
    await authorizeFinance(tx,actor);
    const [service]=await tx.query<{client_id:string;site_id:string;service_type:string;waste_type:string;status:string;operating_company:Company|null;
      closed_at:Date;gross_kg:string|null;tare_kg:string|null;rental_from:Date|string|null;rental_to:Date|string|null}>(`SELECT client_id,site_id,service_type,waste_type,status,operating_company,closed_at,gross_kg,tare_kg,rental_from,rental_to
      FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[id]);
    if(!service||service.status!=="completada")reject("La valorización exige un servicio cerrado.");
    if(!service.operating_company)reject("Confirme la empresa del servicio antes de valorizarlo.");
    const [source]=await tx.query<{contract_id:string}>("SELECT contract_id FROM service_tariffs WHERE id=$1",[data.tariff_id]);
    if(!source)reject("La tarifa no está disponible.");
    await tx.query("SELECT id FROM client_contracts WHERE id=$1 FOR SHARE",[source.contract_id]);
    await tx.query("SELECT id FROM service_tariffs WHERE id=$1 AND contract_id=$2 FOR SHARE",[data.tariff_id,source.contract_id]);
    const [tariff]=await tx.query<{unit:string;unit_price_clp:string}>(`SELECT t.unit,t.unit_price_clp FROM service_tariffs t JOIN client_contracts c ON c.id=t.contract_id
      WHERE t.id=$1 AND t.active=true AND c.active=true AND c.client_id=$2 AND c.operating_company=$7 AND (c.site_id IS NULL OR c.site_id=$3)
        AND t.service_type=$4 AND (t.waste_type IS NULL OR lower(t.waste_type)=lower($5))
        AND t.valid_from <= ($6::timestamptz AT TIME ZONE 'America/Santiago')::date
        AND (t.valid_until IS NULL OR t.valid_until >= ($6::timestamptz AT TIME ZONE 'America/Santiago')::date)
        AND c.starts_on <= ($6::timestamptz AT TIME ZONE 'America/Santiago')::date
        AND (c.ends_on IS NULL OR c.ends_on >= ($6::timestamptz AT TIME ZONE 'America/Santiago')::date)`,
      [data.tariff_id,service.client_id,service.site_id,service.service_type,service.waste_type,service.closed_at,service.operating_company]);
    if(!tariff)reject("La tarifa no corresponde al cliente, servicio, residuo o fecha de cierre.");
    if(tariff.unit==="kg"&&(service.gross_kg==null||service.tare_kg==null))reject("Falta el pesaje para aplicar la tarifa por kg.");
    if(tariff.unit==="dia"&&(service.service_type!=="arriendo"||!service.rental_from||!service.rental_to))reject("La tarifa por día exige un período de arriendo.");
    const asDay=(date:Date|string)=>date instanceof Date?date.toISOString().slice(0,10):String(date).slice(0,10);
    const qty=tariff.unit==="kg"?Number(service.gross_kg)-Number(service.tare_kg):
      tariff.unit==="dia"?(Date.parse(asDay(service.rental_to!))-Date.parse(asDay(service.rental_from!)))/86_400_000+1:1;
    if(qty<0)reject("El pesaje no admite valorización negativa.");
    const [valued]=await tx.query<{id:string}>(`INSERT INTO service_valuations
      (service_id,tariff_id,quantity,unit_price_clp,total_clp,client_order_reference,created_by)
      VALUES ($1,$2,$3,$4,round($3::numeric*$4::numeric,2),NULLIF($5,''),$6) RETURNING id`,
      [id,data.tariff_id,qty,tariff.unit_price_clp,data.client_order_reference,actor.id]);
    await audit(tx,actor,"value","service_valuation",valued.id,{service_id:id,tariff_id:data.tariff_id,quantity:qty,unit_price_clp:tariff.unit_price_clp});
    return valued.id;
  });
}

export async function updateClientOrderReference(actor:Actor,serviceId:string,input:unknown){
  admin(actor);
  const id=uuid.parse(serviceId);
  const data=z.object({
    client_order_reference:optional(80),
    reason:z.string().trim().min(5).max(300),
  }).parse(input);
  await transaction(async tx=>{
    await authorizeFinance(tx,actor);
    const [valuation]=await tx.query<{id:string;client_order_reference:string|null}>(
      "SELECT id,client_order_reference FROM service_valuations WHERE service_id=$1 FOR UPDATE",[id]);
    if(!valuation)reject("Valorice el servicio antes de corregir la referencia.");
    const previous=valuation.client_order_reference??"";
    if(previous===data.client_order_reference)reject("La referencia no cambió.");
    await tx.query("UPDATE service_valuations SET client_order_reference=NULLIF($2,'') WHERE id=$1",
      [valuation.id,data.client_order_reference]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES($1,'update_reference','service_valuation',$2,$3,$4)`,
      [actor.id,valuation.id,JSON.stringify({client_order_reference:previous||null}),
        JSON.stringify({client_order_reference:data.client_order_reference||null,reason:data.reason})]);
  });
}

export async function registerInvoice(actor:Actor,serviceId:string,input:unknown){
  admin(actor);
  const id=uuid.parse(serviceId);
  const data=z.object({invoice_number:z.string().trim().min(2).max(80),issued_on:z.iso.date(),due_on:z.iso.date(),total_clp:positiveMoney}).parse(input);
  if(data.due_on<data.issued_on)reject("El vencimiento de la factura no puede ser anterior a su emisión.");
  return transaction(async(tx)=>{
    await authorizeFinance(tx,actor);
    // Comparte el bloqueo del servicio con la importación a EDP para impedir
    // que dos rutas de facturación se abran simultáneamente.
    const [service]=await tx.query<{id:string}>("SELECT id FROM service_requests WHERE id=$1 AND status='completada' AND deleted_at IS NULL FOR UPDATE",[id]);
    if(!service)reject("La factura se registra sobre un servicio cerrado y disponible.");
    const [edp]=await tx.query<{id:string}>(
      "SELECT id FROM payment_statement_operations WHERE service_id=$1 LIMIT 1",[id]);
    if(edp)reject("Este servicio respalda un estado de pago. Asocie la factura desde Estados de pago.");
    const [valuation]=await tx.query<{id:string;total_clp:string;operating_company:Company|null}>(`SELECT v.id,v.total_clp,s.operating_company
      FROM service_valuations v JOIN service_requests s ON s.id=v.service_id WHERE v.service_id=$1 FOR UPDATE OF v`,[id]);
    if(!valuation)reject("Valorice el servicio antes de asociar una factura.");
    if(!valuation.operating_company)reject("Confirme la empresa del servicio antes de asociar la factura.");
    const [extra]=await tx.query("SELECT id FROM extra_receivable_invoices WHERE invoice_number=$1 AND status='emitida' LIMIT 1",[data.invoice_number]);
    if(extra)reject("Ese folio ya está registrado como factura de cobro extraordinario. Asócielo desde allí.");
    const [invoice]=await tx.query<{id:string}>(`INSERT INTO service_invoices (valuation_id,invoice_number,issued_on,due_on,total_clp,created_by,total_verified)
      VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,[valuation.id,data.invoice_number,data.issued_on,data.due_on,data.total_clp,actor.id]);
    await audit(tx,actor,"invoice","service_invoice",invoice.id,{service_id:id,operating_company:valuation.operating_company,...data});
    return invoice.id;
  });
}

export async function confirmServiceInvoiceTotal(actor:Actor,invoiceId:string,input:unknown,serviceId?:string){
  admin(actor);uuid.parse(invoiceId);if(serviceId!==undefined)uuid.parse(serviceId);
  const data=z.object({total_clp:positiveMoney,reason:z.string().trim().min(5).max(500)}).parse(input);
  await transaction(async tx=>{
    await authorizeFinance(tx,actor);
    const [invoice]=await tx.query<{status:string;total_verified:boolean;total_clp:string}>(
      `SELECT f.status,f.total_verified,f.total_clp FROM service_invoices f JOIN service_valuations v ON v.id=f.valuation_id
        WHERE f.id=$1 AND ($2::uuid IS NULL OR v.service_id=$2) FOR UPDATE OF f`,[invoiceId,serviceId??null]);
    if(!invoice||invoice.status!=="emitida"||invoice.total_verified)reject("La factura no requiere esta conciliación.");
    const [paid]=await tx.query<{total:string}>("SELECT COALESCE(sum(amount_clp),0)::text AS total FROM invoice_payments WHERE invoice_id=$1",[invoiceId]);
    if(Number(data.total_clp)<Number(paid.total))reject("El total del documento no puede ser menor que los abonos registrados.");
    await tx.query("UPDATE service_invoices SET total_clp=$2,total_verified=true WHERE id=$1",[invoiceId,data.total_clp]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES($1,'confirm_invoice_total','service_invoice',$2,$3,$4)",
      [actor.id,invoiceId,JSON.stringify({total_clp:invoice.total_clp,total_verified:false}),JSON.stringify(data)]);
  });
}

export async function voidInvoice(actor:Actor,invoiceId:string,reason:unknown,serviceId?:string){
  admin(actor);
  const id=uuid.parse(invoiceId);if(serviceId!==undefined)uuid.parse(serviceId);
  const explanation=z.string().trim().min(5).max(500).parse(reason);
  const billingReady=await moduleReady("edp_billing");
  await transaction(async(tx)=>{
    await authorizeFinance(tx,actor);
    const [invoice]=await tx.query<{status:string}>(`SELECT f.status FROM service_invoices f JOIN service_valuations v ON v.id=f.valuation_id
      WHERE f.id=$1 AND ($2::uuid IS NULL OR v.service_id=$2) FOR UPDATE OF f`,[id,serviceId??null]);
    if(!invoice||invoice.status!=="emitida")reject("La factura interna no está vigente.");
    const [payment]=await tx.query("SELECT id FROM invoice_payments WHERE invoice_id=$1 LIMIT 1",[id]);
    if(payment)reject("No anule una factura que registra pagos; requiere revisión administrativa.");
    const charges=await tx.query<{id:string}>("SELECT id FROM service_extra_charges WHERE linked_service_invoice_id=$1 FOR UPDATE",[id]);
    const statements=billingReady?await tx.query<{id:string}>("SELECT id FROM payment_statements WHERE service_invoice_id=$1 FOR UPDATE",[id]):[];
    await tx.query(`UPDATE service_extra_charges SET status='aprobado',invoice_number=NULL,invoiced_on=NULL,
      linked_service_invoice_id=NULL WHERE linked_service_invoice_id=$1`,[id]);
    for(const charge of charges)await audit(tx,actor,"unlink_void_invoice","service_extra_charge",charge.id,{invoice_id:id,reason:explanation});
    if(billingReady)await tx.query(`UPDATE payment_statements SET service_invoice_id=NULL,invoice_variance_note=NULL,updated_at=now()
      WHERE service_invoice_id=$1`,[id]);
    for(const statement of statements)await audit(tx,actor,"unlink_void_invoice","payment_statement",statement.id,{invoice_id:id,reason:explanation});
    await tx.query("UPDATE service_invoices SET status='anulada' WHERE id=$1",[id]);
    await audit(tx,actor,"void","service_invoice",id,{reason:explanation});
  });
}

export async function registerPayment(actor:Actor,invoiceId:string,input:unknown,serviceId?:string){
  admin(actor);
  const id=uuid.parse(invoiceId);if(serviceId!==undefined)uuid.parse(serviceId);
  const data=z.object({submission_key:uuid,amount_clp:positiveMoney,paid_on:z.iso.date(),
    method:z.enum(["transferencia","efectivo","tarjeta","otro"]),reference:z.string().trim().min(2).max(120)}).parse(input);
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if(data.paid_on>today)reject("La fecha del abono no puede ser futura: registre un pago ya realizado.");
  return transaction(async(tx)=>{
    await authorizeFinance(tx,actor);
    const [invoice]=await tx.query<{status:string;total_clp:string;total_verified:boolean}>(`SELECT f.status,f.total_clp,f.total_verified FROM service_invoices f JOIN service_valuations v ON v.id=f.valuation_id
      WHERE f.id=$1 AND ($2::uuid IS NULL OR v.service_id=$2) FOR UPDATE OF f`,[id,serviceId??null]);
    if(!invoice)reject("Factura no encontrada.");
    const [previous]=await tx.query<{id:string;invoice_id:string;amount_clp:string;paid_on:Date|string;method:string;reference:string}>("SELECT id,invoice_id,amount_clp,paid_on,method,reference FROM invoice_payments WHERE submission_key=$1",[data.submission_key]);
    if(previous){
      if(previous.invoice_id!==id)reject("Clave de pago asignada a otra factura.");
      if(Number(previous.amount_clp)!==Number(data.amount_clp)||financeDay(previous.paid_on)!==data.paid_on||previous.method!==data.method||previous.reference!==data.reference)
        reject("Esta clave ya registró un abono con otros datos. Recargue la ficha antes de ingresar un abono diferente.");
      return previous.id;
    }
    if(invoice.status!=="emitida")reject("La factura está anulada.");
    if(!invoice.total_verified)reject("Confirme el total real de la factura antes de registrar nuevos pagos.");
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
    await authorizeFinance(tx,actor);
    const [service]=await tx.query("SELECT id FROM service_requests WHERE id=$1 AND status='completada' AND deleted_at IS NULL FOR SHARE",[id]);
    if(!service)reject("Los costos se registran sobre servicios cerrados.");
    const [cost]=await tx.query<{id:string}>(`INSERT INTO service_costs (submission_key,service_id,category,amount_clp,description,created_by)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (submission_key) DO NOTHING RETURNING id`,
      [data.submission_key,id,data.category,data.amount_clp,data.description,actor.id]);
    if(!cost){
      const [previous]=await tx.query<{id:string;service_id:string;category:string;amount_clp:string;description:string}>("SELECT id,service_id,category,amount_clp,description FROM service_costs WHERE submission_key=$1",[data.submission_key]);
      if(!previous||previous.service_id!==id)reject("La clave de costo se usó para otro servicio.");
      if(previous.category!==data.category||Number(previous.amount_clp)!==Number(data.amount_clp)||previous.description!==data.description)
        reject("Esta clave ya registró un costo con otros datos. Recargue la ficha antes de ingresar un costo diferente.");
      return previous.id;
    }
    await audit(tx,actor,"cost","service_cost",cost.id,{service_id:id,...data});
    return cost.id;
  });
}
