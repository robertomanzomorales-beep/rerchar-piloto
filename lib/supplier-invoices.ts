import {z} from "zod";
import type {Actor} from "./auth";
import {db,transaction} from "./db";
import type {Company} from "./companies";
import {moduleReady} from "./schema-readiness";
import {chileCsvDay} from "./chile-csv";

const uuid=z.uuid();
const optional=(max:number)=>z.string().trim().max(max).optional().default("");
const amount=z.union([z.string(),z.number()]).transform((raw,ctx)=>{
  const value=String(raw).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)>100_000_000_000){
    ctx.addIssue({code:"custom",message:"Monto CLP inválido."});return z.NEVER;
  }
  return value;
});
const optionalAmount=z.union([z.literal(""),amount]).default("");
export class SupplierInvoiceError extends Error {}
function reject(message:string):never{throw new SupplierInvoiceError(message);}
function admin(actor:Actor){if(actor.role!=="admin")reject("Las facturas de proveedores son de administración.");}
const cents=(value:string|number)=>Math.round(Number(value)*100);
export function invoiceReconciliation(input:{net_clp:string|number|null;vat_clp:string|number|null;total_clp:string|number}){
  if(input.net_clp==null||input.vat_clp==null)return null;
  return (cents(input.net_clp)+cents(input.vat_clp)-cents(input.total_clp))/100;
}
export type SupplierInvoice={id:string;issuer:"rerchar"|"e_y_j";supplier_tax_id:string;supplier_name:string;
  supplier_profile_id?:string|null;
  invoice_number:string;issued_on:Date|string;due_on:Date|string|null;description:string;net_clp:string|null;
  vat_clp:string|null;total_clp:string;cost_area:string|null;purchase_id:string|null;service_id:string|null;
  status:string;paid_clp:string;paid_on:Date|string|null;notes:string|null;created_at:Date};
export type SupplierInvoiceDetail=SupplierInvoice&{purchase_folio:string|null;purchase_title:string|null;service_folio:string|null;service_company:Company|null};
export type SupplierPayment={id:string;amount_clp:string;paid_on:Date|string;reference:string;actor_name:string;created_at:Date};
export type SupplierInvoiceFilter="pendientes"|"vencidas"|"proximas"|"sin_fecha"|"pagadas"|"todas";
export type SupplierInvoiceOverview={overdue:string;upcoming:string;undated:string;outstanding:string};
export function parseSupplierInvoiceFilter(value:string|null|undefined):SupplierInvoiceFilter{
  return value==="vencidas"||value==="proximas"||value==="sin_fecha"||value==="pagadas"||value==="todas"?value:"pendientes";
}
function invoiceQuery(actor:Actor,company:Company|"",filter:SupplierInvoiceFilter,on:string){
  admin(actor);
  if(company!==""&&company!=="rerchar"&&company!=="e_y_j")reject("Empresa inválida.");
  if(!["pendientes","vencidas","proximas","sin_fecha","pagadas","todas"].includes(filter))reject("Filtro inválido.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(on))reject("Fecha inválida.");
}

export async function listSupplierInvoices(actor:Actor,company:Company|""="",filter:SupplierInvoiceFilter="pendientes",on=chileCsvDay()){
  invoiceQuery(actor,company,filter,on);
  return db.query<SupplierInvoice>(`SELECT * FROM supplier_invoices
    WHERE ($1::text='' OR issuer=$1)
      AND ($2::text='todas'
        OR $2='pendientes' AND paid_clp<total_clp
        OR $2='vencidas' AND paid_clp<total_clp AND due_on<$3::date
        OR $2='proximas' AND paid_clp<total_clp AND due_on>=$3::date AND due_on<=$3::date+7
        OR $2='sin_fecha' AND paid_clp<total_clp AND due_on IS NULL
        OR $2='pagadas' AND paid_clp>=total_clp)
    ORDER BY paid_clp>=total_clp,due_on NULLS LAST,issued_on DESC,created_at DESC LIMIT 400`,[company,filter,on]);
}
export async function supplierInvoiceOverview(actor:Actor,company:Company|"",on=chileCsvDay()){
  invoiceQuery(actor,company,"todas",on);
  const [row]=await db.query<SupplierInvoiceOverview>(`SELECT
    count(*) FILTER (WHERE paid_clp<total_clp AND due_on<$2::date)::text AS overdue,
    count(*) FILTER (WHERE paid_clp<total_clp AND due_on>=$2::date AND due_on<=$2::date+7)::text AS upcoming,
    count(*) FILTER (WHERE paid_clp<total_clp AND due_on IS NULL)::text AS undated,
    COALESCE(sum(GREATEST(total_clp-paid_clp,0)),0)::text AS outstanding
    FROM supplier_invoices WHERE ($1::text='' OR issuer=$1)`,[company,on]);
  return row;
}
export async function getSupplierInvoice(actor:Actor,id:string){
  admin(actor);if(!uuid.safeParse(id).success)reject("Factura no encontrada.");
  const [invoice]=await db.query<SupplierInvoiceDetail>(`SELECT i.*,p.folio::text AS purchase_folio,p.title AS purchase_title,
    s.folio::text AS service_folio,s.operating_company AS service_company FROM supplier_invoices i
    LEFT JOIN purchase_requests p ON p.id=i.purchase_id
    LEFT JOIN service_requests s ON s.id=i.service_id WHERE i.id=$1`,[id]);
  if(!invoice)reject("Factura no encontrada.");
  const payments=await db.query<SupplierPayment>(`SELECT p.id,p.amount_clp,p.paid_on,p.reference,p.created_at,u.name AS actor_name
    FROM supplier_invoice_payments p JOIN users u ON u.id=p.recorded_by WHERE p.invoice_id=$1
    ORDER BY p.created_at DESC`,[id]);
  return {invoice,payments};
}
export async function updateSupplierInvoiceDueDate(actor:Actor,id:string,input:unknown){
  admin(actor);uuid.parse(id);
  const data=z.object({due_on:z.iso.date(),reason:z.string().trim().min(5).max(300)}).parse(input);
  await transaction(async tx=>{
    const [invoice]=await tx.query<{issued_on:Date|string;due_on:Date|string|null}>(
      "SELECT issued_on,due_on FROM supplier_invoices WHERE id=$1 FOR UPDATE",[id]);
    if(!invoice)reject("Factura no encontrada.");
    const issuedOn=invoice.issued_on instanceof Date?invoice.issued_on.toISOString().slice(0,10):String(invoice.issued_on).slice(0,10);
    if(data.due_on<issuedOn)reject("El vencimiento no puede ser anterior a la emisión.");
    const previous=invoice.due_on instanceof Date?invoice.due_on.toISOString().slice(0,10):invoice.due_on?String(invoice.due_on).slice(0,10):null;
    if(previous===data.due_on)return;
    await tx.query("UPDATE supplier_invoices SET due_on=$2,updated_at=now() WHERE id=$1",[id,data.due_on]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES($1,'update_due_date','supplier_invoice',$2,$3,$4)`,
      [actor.id,id,JSON.stringify({due_on:previous}),JSON.stringify({due_on:data.due_on,reason:data.reason})]);
  });
}
export async function createSupplierInvoice(actor:Actor,input:unknown){
  admin(actor);
  const data=z.object({issuer:z.enum(["rerchar","e_y_j"]),supplier_profile_id:z.union([uuid,z.literal("")]).default(""),
    supplier_tax_id:optional(25),supplier_name:optional(180),invoice_number:z.string().trim().min(1).max(80),
    issued_on:z.iso.date(),due_on:z.union([z.iso.date(),z.literal("")]).default(""),
    description:z.string().trim().min(3).max(500),net_clp:optionalAmount,vat_clp:optionalAmount,total_clp:amount,
    cost_area:optional(160),purchase_id:z.union([uuid,z.literal("")]).default(""),
    service_id:z.union([uuid,z.literal("")]).default(""),notes:optional(1000)}).parse(input);
  if(data.due_on&&data.due_on<data.issued_on)reject("La fecha de vencimiento debe ser posterior a la emisión.");
  if(data.net_clp!==""&&data.vat_clp!==""&&Math.abs(invoiceReconciliation({net_clp:data.net_clp,vat_clp:data.vat_clp,total_clp:data.total_clp})??0)>0.01)
    reject("Neto más IVA no coincide con el total informado.");
  const profilesReady=await moduleReady("counterparty_profiles");
  if(data.supplier_profile_id&&!profilesReady)reject("La ficha de proveedor todavía no está disponible.");
  if(!data.supplier_profile_id&&(data.supplier_tax_id.length<5||data.supplier_name.length<2))
    reject("Indique el proveedor o seleccione una ficha verificada.");
  return transaction(async tx=>{
    let supplierTaxId=data.supplier_tax_id,supplierName=data.supplier_name;
    if(data.supplier_profile_id){
      const [profile]=await tx.query<{tax_id:string;legal_name:string;status:string;kind:string}>(
        "SELECT tax_id,legal_name,status,kind FROM counterparty_profiles WHERE id=$1",[data.supplier_profile_id]);
      if(!profile||profile.status!=="verificada"||profile.kind==="cliente")reject("Seleccione una ficha de proveedor verificada.");
      supplierTaxId=profile.tax_id;supplierName=profile.legal_name;
    }
    if(data.purchase_id){const [purchase]=await tx.query<{issuer:string}>("SELECT issuer FROM purchase_requests WHERE id=$1",[data.purchase_id]);
      if(!purchase||purchase.issuer!==data.issuer)reject("La orden de compra debe corresponder a la empresa receptora.");}
    if(data.service_id){const [service]=await tx.query<{operating_company:string|null}>("SELECT operating_company FROM service_requests WHERE id=$1 AND deleted_at IS NULL",[data.service_id]);
      if(!service||service.operating_company!==data.issuer)reject("El servicio debe tener confirmada la misma empresa receptora.");}
    const [duplicate]=await tx.query("SELECT id FROM supplier_invoices WHERE issuer=$1 AND supplier_tax_id=$2 AND invoice_number=$3",
      [data.issuer,supplierTaxId,data.invoice_number]);
    if(duplicate)reject("Esta factura del proveedor ya está registrada para la empresa emisora.");
    const [row]=await tx.query<{id:string}>(`INSERT INTO supplier_invoices(issuer,supplier_tax_id,supplier_name,invoice_number,issued_on,due_on,
      description,net_clp,vat_clp,total_clp,cost_area,purchase_id,service_id,notes,recorded_by${profilesReady?",supplier_profile_id":""})
      VALUES($1,$2,$3,$4,$5,NULLIF($6,'')::date,$7,NULLIF($8::text,'')::numeric,NULLIF($9::text,'')::numeric,
        $10,NULLIF($11,''),NULLIF($12,'')::uuid,NULLIF($13,'')::uuid,NULLIF($14,''),$15${profilesReady?",NULLIF($16,'')::uuid":""}) RETURNING id`,
      [data.issuer,supplierTaxId,supplierName,data.invoice_number,data.issued_on,data.due_on,
       data.description,data.net_clp,data.vat_clp,data.total_clp,data.cost_area,data.purchase_id,data.service_id,data.notes,actor.id,
       ...(profilesReady?[data.supplier_profile_id]:[])]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'create','supplier_invoice',$2,$3)",
      [actor.id,row.id,JSON.stringify({issuer:data.issuer,supplier_tax_id:supplierTaxId,supplier_profile_id:data.supplier_profile_id||null,
        invoice_number:data.invoice_number,total_clp:data.total_clp})]);
    return row.id;
  });
}
export async function registerSupplierPayment(actor:Actor,id:string,input:unknown){
  admin(actor);uuid.parse(id);
  const data=z.object({submission_key:uuid,amount_clp:amount,paid_on:z.iso.date(),reference:z.string().trim().min(2).max(160)}).parse(input);
  if(Number(data.amount_clp)<=0)reject("El pago debe ser mayor que cero.");
  const transfersReady=await moduleReady("supplier_transfers");
  return transaction(async tx=>{
    const [invoice]=await tx.query<{total_clp:string;paid_clp:string;status:string}>("SELECT total_clp,paid_clp,status FROM supplier_invoices WHERE id=$1 FOR UPDATE",[id]);
    if(!invoice)reject("Factura no encontrada.");
    const [existing]=await tx.query<{id:string;invoice_id:string}>("SELECT id,invoice_id FROM supplier_invoice_payments WHERE submission_key=$1",[data.submission_key]);
    if(existing){if(existing.invoice_id!==id)reject("Este pago corresponde a otra factura.");return existing.id;}
    if(transfersReady){const [active]=await tx.query("SELECT id FROM supplier_transfer_requests WHERE invoice_id=$1 AND status IN ('solicitada','aprobada','ejecutada') LIMIT 1",[id]);
      if(active)reject("Hay transferencias pendientes para esta factura. Resuélvalas antes de registrar un pago manual.");}
    const total=cents(invoice.total_clp),paid=cents(invoice.paid_clp)+cents(data.amount_clp);
    if(paid>total)reject("El pago supera el saldo pendiente.");
    const [payment]=await tx.query<{id:string}>(`INSERT INTO supplier_invoice_payments(submission_key,invoice_id,amount_clp,paid_on,reference,recorded_by)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[data.submission_key,id,data.amount_clp,data.paid_on,data.reference,actor.id]);
    await tx.query("UPDATE supplier_invoices SET paid_clp=$2,status=$3,paid_on=$4,updated_at=now() WHERE id=$1",
      [id,paid/100,paid===total?"pagada":"parcial",data.paid_on]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'payment','supplier_invoice',$2,$3)",
      [actor.id,id,JSON.stringify({...data,paid_clp:paid/100,status:paid===total?"pagada":"parcial"})]);
    return payment.id;
  });
}
