import {z} from "zod";
import type {Actor} from "./auth";
import {db,transaction} from "./db";
import {moduleReady} from "./schema-readiness";
import {todayChile} from "./receivables";

export class MaterialSaleBillingError extends Error {}
const reject=(message:string):never=>{throw new MaterialSaleBillingError(message);};
const uuid=z.uuid();
const invoiceSchema=z.object({invoice_number:z.string().trim().min(2).max(80),issued_on:z.iso.date(),
  due_on:z.iso.date(),total_clp:z.union([z.string(),z.number()]).transform((raw,ctx)=>{
    const value=String(raw).trim();
    if(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)<=0||Number(value)>100_000_000_000){
      ctx.addIssue({code:"custom",message:"Ingrese el total real de la factura, mayor que cero."});return z.NEVER;
    }
    return value;
  })});
const day=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
function admin(actor:Actor){if(actor.role!=="admin")reject("Sólo administración puede conciliar facturas y cobranza.");}

export type MaterialSaleInvoice={item_id:string;id:string;invoice_number:string;issued_on:Date|string;due_on:Date|string;
  total_clp:string;paid_clp:string;status:string};
export async function getMaterialSaleInvoices(actor:Actor,guideId:string){
  admin(actor);if(!uuid.safeParse(guideId).success)reject("Guía inválida.");
  if(!await moduleReady("material_sale_billing"))return [];
  return db.query<MaterialSaleInvoice>(`SELECT i.id AS item_id,f.id,f.invoice_number,f.issued_on,f.due_on,f.total_clp,f.status,
    COALESCE((SELECT sum(p.amount_clp) FROM extra_receivable_payments p WHERE p.invoice_id=f.id),0)::text AS paid_clp
    FROM material_guide_items i JOIN extra_receivable_invoices f ON f.id=i.receivable_invoice_id
    WHERE i.guide_id=$1 ORDER BY i.line_number`,[guideId]);
}

export async function linkMaterialSaleInvoice(actor:Actor,guideId:string,itemId:string,input:unknown){
  admin(actor);
  if(!uuid.safeParse(guideId).success||!uuid.safeParse(itemId).success)reject("Guía o material inválido.");
  if(!await moduleReady("material_sale_billing"))reject("Falta aplicar la migración 043 para conciliar la venta.");
  const data=invoiceSchema.parse(input);
  if(data.issued_on>todayChile())reject("La factura no puede tener fecha futura.");
  if(data.due_on<data.issued_on)reject("El vencimiento no puede anteceder a la emisión.");
  return transaction(async tx=>{
    const [guide]=await tx.query<{movement_type:string;movement_on:Date|string;counterparty_id:string}>(
      "SELECT movement_type,movement_on,counterparty_id FROM material_guides WHERE id=$1 AND operating_company='rerchar' FOR UPDATE",[guideId]);
    if(!guide||guide.movement_type!=="venta")reject("La cobranza de material requiere una guía de venta RERCHAR.");
    if(data.issued_on<day(guide.movement_on))reject("La factura no puede anteceder a la salida de material.");
    const [item]=await tx.query<{invoice_number:string|null;invoice_issued_on:Date|string|null;invoice_status:string|null;
      payment_on:Date|string|null;receivable_invoice_id:string|null}>(
      "SELECT invoice_number,invoice_issued_on,invoice_status,payment_on,receivable_invoice_id FROM material_guide_items WHERE id=$1 AND guide_id=$2 FOR UPDATE",[itemId,guideId]);
    if(!item)reject("Material no encontrado en esta guía.");
    if(item.receivable_invoice_id)reject("Este material ya está vinculado a Cobranza.");
    if(item.invoice_status==="pagada"||item.invoice_status==="parcial"||item.payment_on)
      reject("La guía indica pagos anteriores. Concílielos antes de crear una cuenta por cobrar nueva.");
    if(item.invoice_number&&item.invoice_number!==data.invoice_number||
      item.invoice_issued_on&&day(item.invoice_issued_on)!==data.issued_on)
      reject("El folio o fecha difiere del control anterior. Corrija primero el material.");
    const [service]=await tx.query<{id:string}>("SELECT id FROM service_invoices WHERE invoice_number=$1 LIMIT 1",[data.invoice_number]);
    if(service)reject("Ese folio ya figura en Finanzas. Revise la factura del servicio para no duplicar el cobro.");
    const [existing]=await tx.query<{id:string;status:string;client_id:string;issued_on:Date|string;due_on:Date|string;total_clp:string}>(
      "SELECT id,status,client_id,issued_on,due_on,total_clp FROM extra_receivable_invoices WHERE issuer='rerchar' AND invoice_number=$1 FOR UPDATE",[data.invoice_number]);
    let invoiceId=existing?.id;
    if(existing){
      if(existing.status!=="emitida"||existing.client_id!==guide.counterparty_id||day(existing.issued_on)!==data.issued_on||
        day(existing.due_on)!==data.due_on||Number(existing.total_clp)!==Number(data.total_clp))
        reject("El folio ya existe con otro cliente, importe, fecha o estado; revise la factura.");
    }else{
      const [created]=await tx.query<{id:string}>(`INSERT INTO extra_receivable_invoices
        (issuer,client_id,invoice_number,issued_on,due_on,total_clp,created_by)
        VALUES('rerchar',$1,$2,$3,$4,$5,$6) RETURNING id`,
        [guide.counterparty_id,data.invoice_number,data.issued_on,data.due_on,data.total_clp,actor.id]);
      invoiceId=created.id;
    }
    await tx.query(`UPDATE material_guide_items SET receivable_invoice_id=$2,invoice_number=$3,invoice_issued_on=$4,
      invoice_status='pendiente',updated_at=now() WHERE id=$1`,[itemId,invoiceId,data.invoice_number,data.issued_on]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'link_invoice','material_guide_item',$2,$3)",
      [actor.id,itemId,JSON.stringify({invoice_id:invoiceId,guide_id:guideId,...data})]);
    return invoiceId!;
  });
}
