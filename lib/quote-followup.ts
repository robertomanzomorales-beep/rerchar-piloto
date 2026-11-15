import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction} from "./db";
import {moduleReady} from "./schema-readiness";
import {currentOrderDocumentSql} from "./quote-order";

const uuid=z.uuid();
export class QuoteFollowupError extends Error{}
function reject(message:string):never{throw new QuoteFollowupError(message);}
function staff(actor:Actor){if(!canManage(actor))reject("Sólo administración y operaciones pueden registrar documentos comerciales.");}
export async function recordQuoteClientOrder(actor:Actor,quoteId:string,input:unknown){
  staff(actor);const id=uuid.parse(quoteId);
  const data=z.object({reference:z.string().trim().min(2).max(80),received_on:z.iso.date()}).parse(input);
  await transaction(async tx=>{
    const [quote]=await tx.query<{status:string;commercial_kind:string;client_order_reference:string|null;client_order_on:Date|string|null;client_order_exception:string|null}>(
      "SELECT status,commercial_kind,client_order_reference,client_order_on,client_order_exception FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||quote.status!=="aceptada")reject("Registre la OC después de la aceptación de la cotización.");
    if(quote.commercial_kind==="compra_material")reject("La compra de material continúa con solicitud y guía valorizada, sin OC del cliente.");
    const previousDay=quote.client_order_on instanceof Date?quote.client_order_on.toISOString().slice(0,10):String(quote.client_order_on??"").slice(0,10);
    if(quote.client_order_reference===data.reference&&previousDay===data.received_on&&!quote.client_order_exception)return;
    await tx.query("UPDATE client_quotes SET client_order_reference=$2,client_order_on=$3,client_order_exception=NULL WHERE id=$1",[id,data.reference,data.received_on]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES($1,'client_order','client_quote',$2,$3,$4)`,[actor.id,id,
      JSON.stringify({reference:quote.client_order_reference,on:quote.client_order_on,exception:quote.client_order_exception}),JSON.stringify(data)]);
  });
}
export async function recordQuoteOrderException(actor:Actor,quoteId:string,reason:unknown){
  if(actor.role!=="admin")reject("Sólo administración puede autorizar una excepción de OC.");
  const id=uuid.parse(quoteId),note=z.string().trim().min(10).max(500).parse(reason);
  await transaction(async tx=>{
    const [quote]=await tx.query<{status:string;commercial_kind:string;client_order_reference:string|null;client_order_exception:string|null}>(
      "SELECT status,commercial_kind,client_order_reference,client_order_exception FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||quote.status!=="aceptada")reject("La cotización debe estar aceptada para justificar la ausencia de OC.");
    if(quote.commercial_kind==="compra_material")reject("La compra de material no requiere excepción de OC del cliente.");
    const [document]=await tx.query("SELECT id FROM client_quote_documents WHERE quote_id=$1 AND kind='orden_compra' LIMIT 1",[id]);
    if(document)reject("Existe una OC adjunta. Revise el documento antes de registrar una excepción.");
    await tx.query("UPDATE client_quotes SET client_order_reference=NULL,client_order_on=NULL,client_order_exception=$2 WHERE id=$1",[id,note]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES($1,'order_exception','client_quote',$2,$3,$4)`,[actor.id,id,
        JSON.stringify({reference:quote.client_order_reference,exception:quote.client_order_exception}),JSON.stringify({exception:note})]);
  });
}
export async function uploadQuoteDocument(actor:Actor,quoteId:string,kind:unknown,file:File){
  staff(actor);const id=uuid.parse(quoteId),type=z.enum(["orden_compra","respaldo"]).parse(kind);
  if(!file||file.size<1||file.size>4*1024*1024)reject("El archivo debe pesar entre 1 byte y 4 MB.");
  const bytes=Buffer.from(await file.arrayBuffer());
  const mime=bytes.subarray(0,4).toString()==="%PDF"?"application/pdf":
    bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":
    bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":null;
  if(!mime)reject("Adjunte PDF, PNG o JPG válido.");
  const filename=file.name.replace(/[\r\n"\\/]/g,"_").slice(0,180)||"documento";
  return transaction(async tx=>{
    const [quote]=await tx.query<{status:string;commercial_kind:string;client_order_reference:string|null}>(
      "SELECT status,commercial_kind,client_order_reference FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||!(["aceptada","enviada"] as string[]).includes(quote.status))reject("La cotización debe estar entregada o aceptada.");
    if(type==="orden_compra"&&quote.commercial_kind==="compra_material")reject("La compra de material no utiliza OC del cliente.");
    if(type==="orden_compra"&&(!quote.client_order_reference||quote.status!=="aceptada"))reject("Registre primero el número y fecha de la OC aceptada.");
    const [row]=await tx.query<{id:string}>(`INSERT INTO client_quote_documents(quote_id,kind,filename,mime,content,uploaded_by)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[id,type,filename,mime,bytes,actor.id]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value)
      VALUES($1,'document','client_quote',$2,$3)`,[actor.id,id,JSON.stringify({document_id:row.id,kind:type,filename})]);
    return row.id;
  });
}
export async function getQuoteDocument(actor:Actor,id:string){
  if(!uuid.safeParse(id).success||actor.role==="conductor")return null;
  const [row]=await db.query<{filename:string;mime:string;content:Buffer;client_id:string}>(`SELECT d.filename,d.mime,d.content,q.client_id
    FROM client_quote_documents d JOIN client_quotes q ON q.id=d.quote_id WHERE d.id=$1`,[id]);
  if(!row||actor.role==="cliente"&&actor.client_id!==row.client_id)return null;
  return row;
}
export async function getQuoteFollowup(actor:Actor,quoteId:string){
  if(actor.role==="conductor")reject("Sin acceso a cotizaciones.");
  const [quote]=await db.query<{client_id:string;status:string;commercial_kind:"general"|"compra_material";client_order_reference:string|null;client_order_on:Date|string|null;client_order_exception:string|null}>(
    "SELECT client_id,status,commercial_kind,client_order_reference,client_order_on,client_order_exception FROM client_quotes WHERE id=$1",[quoteId]);
  if(!quote||actor.role==="cliente"&&actor.client_id!==quote.client_id)reject("Cotización no disponible.");
  const edpReady=await moduleReady("edp_service_import")&&await moduleReady("edp_billing");
  const [documents,services,statements]=await Promise.all([
    db.query<{id:string;kind:string;filename:string;uploaded_at:Date|string;is_current:boolean}>(
      `SELECT d.id,d.kind,d.filename,d.uploaded_at,
        (d.kind<>'orden_compra' OR ${currentOrderDocumentSql}) AS is_current
       FROM client_quote_documents d JOIN client_quotes q ON q.id=d.quote_id
       WHERE d.quote_id=$1 ORDER BY d.uploaded_at DESC`,[quoteId]),
    db.query<{id:string;folio:string;service_type:string;status:string;guide_number:string|null;scheduled_for:Date|string|null;invoice_number:string|null;invoice_id:string|null;paid_clp:string;invoice_total_clp:string|null;certificate_id:string|null}>(`SELECT s.id,s.folio,s.service_type,s.status,s.guide_number,s.scheduled_for,
      i.invoice_number,i.id AS invoice_id,COALESCE((SELECT sum(p.amount_clp) FROM invoice_payments p WHERE p.invoice_id=i.id),0)::text AS paid_clp,
      i.total_clp AS invoice_total_clp,
      (SELECT c.id FROM service_certificates c WHERE c.service_id=s.id AND c.status='vigente' ORDER BY c.version DESC LIMIT 1) AS certificate_id
      FROM service_requests s LEFT JOIN service_valuations v ON v.service_id=s.id
      LEFT JOIN service_invoices i ON i.valuation_id=v.id AND i.status='emitida'
      WHERE s.quote_id=$1 AND s.deleted_at IS NULL ORDER BY s.created_at DESC`,[quoteId]),
    edpReady?db.query<{service_id:string;id:string;number:string;status:string;invoice_id:string|null;invoice_number:string|null;invoice_total_clp:string|null;paid_clp:string}>(`
      SELECT DISTINCT o.service_id,p.id,p.number,p.status,
        COALESCE(i.id,f.id) AS invoice_id,COALESCE(i.invoice_number,f.invoice_number) AS invoice_number,
        i.total_clp::text AS invoice_total_clp,
        COALESCE((SELECT sum(pay.amount_clp) FROM extra_receivable_payments pay WHERE pay.invoice_id=i.id),0)::text AS paid_clp
      FROM payment_statement_operations o JOIN payment_statements p ON p.id=o.statement_id
      JOIN service_requests s ON s.id=o.service_id AND s.client_id=p.client_id AND s.operating_company=p.issuer
      LEFT JOIN extra_receivable_invoices i ON i.id=p.receivable_invoice_id AND i.status='emitida'
      LEFT JOIN service_invoices f ON f.id=p.service_invoice_id AND f.status='emitida'
      WHERE s.quote_id=$1 AND s.deleted_at IS NULL
        AND ($2::text<>'cliente' OR p.status IN ('enviado','aprobado'))
      ORDER BY o.service_id,p.id DESC`,[quoteId,actor.role]):Promise.resolve([]),
  ]);
  const evidence=await db.query<{id:string;service_id:string;description:string;document_kind:string;original_filename:string|null}>(`SELECT e.id,e.service_id,e.description,e.document_kind,e.original_filename
    FROM service_evidence e JOIN service_requests s ON s.id=e.service_id
    WHERE s.quote_id=$1 AND s.deleted_at IS NULL AND e.storage_key IS NOT NULL ORDER BY e.created_at DESC`,[quoteId]);
  return {quote,documents,services,statements,evidence};
}
