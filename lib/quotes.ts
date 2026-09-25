import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction} from "./db";
import nodemailer from "nodemailer";
import {renderQuotePdf} from "./quote-pdf";

const uuid=z.uuid();
const optional=(max:number)=>z.string().trim().max(max).optional().default("");
const money=z.union([z.string(),z.number()]).transform((v,ctx)=>{
  const value=String(v).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)>100_000_000){ctx.addIssue({code:"custom",message:"Precio unitario inválido."});return z.NEVER;}
  return value;
});
const quantity=z.union([z.string(),z.number()]).transform((v,ctx)=>{
  const value=String(v).trim();
  if(!/^\d+(?:\.\d{1,3})?$/.test(value)||Number(value)<=0||Number(value)>100_000_000){ctx.addIssue({code:"custom",message:"Cantidad inválida."});return z.NEVER;}
  return value;
});
const item=z.object({description:z.string().trim().min(2).max(240),quantity,unit:z.string().trim().min(1).max(30),unit_price_clp:money,taxable:z.boolean().default(true)});
export class QuoteError extends Error {}
function reject(message:string):never{throw new QuoteError(message);}
function canEdit(actor:Actor){if(!canManage(actor))reject("Sólo operaciones puede preparar cotizaciones.");}
export const issuers={rerchar:{name:"RERCHAR CHILE SPA",tax_id:"77.639.762-8"},e_y_j:{name:"EMPRESAS DE SERVICIOS INTEGRALES E Y J LIMITADA",tax_id:"76.347.909-9"}} as const;
export type Quote={id:string;folio:string;submission_key:string;client_id:string;issuer:keyof typeof issuers;client_name:string;client_tax_id:string|null;
  client_email:string|null;client_address:string|null;title:string;notes:string|null;issued_on:Date|string;valid_until:Date|string;vat_rate:string;status:string;sent_at:Date|null;created_at:Date};
export type QuoteLine={id:string;position:number;description:string;quantity:string;unit:string;unit_price_clp:string;taxable:boolean};
export function quoteTotals(lines:Pick<QuoteLine,"quantity"|"unit_price_clp"|"taxable">[],vatRate=0.19){
  const priced=lines.map(line=>({amount:Math.round(Number(line.quantity)*Number(line.unit_price_clp)),taxable:line.taxable}));
  const net=priced.reduce((sum,line)=>sum+line.amount,0);
  const taxable=priced.filter(line=>line.taxable).reduce((sum,line)=>sum+line.amount,0);
  const vat=Math.round(taxable*vatRate);
  return {net,vat,total:net+vat,lines:priced.map(line=>line.amount)};
}

export async function listQuotes(actor:Actor,clientId=""){
  if(actor.role==="conductor")reject("Sin acceso a cotizaciones.");
  if(clientId && !uuid.safeParse(clientId).success)reject("Cliente inválido.");
  return db.query<Quote>(`SELECT q.* FROM client_quotes q WHERE ($1::text='' OR q.client_id=NULLIF($1,'')::uuid)
    AND ($2::text<>'cliente' OR (q.client_id=$3::uuid AND q.status IN ('enviada','aceptada','rechazada'))) ORDER BY q.created_at DESC LIMIT 250`,[clientId,actor.role,actor.client_id]);
}
export async function getQuote(actor:Actor,quoteId:string){
  if(!uuid.safeParse(quoteId).success)reject("Cotización inexistente.");
  const [quote]=await db.query<Quote>("SELECT * FROM client_quotes WHERE id=$1",[quoteId]);
  if(!quote||actor.role==="conductor"||(actor.role==="cliente"&&(actor.client_id!==quote.client_id||!["enviada","aceptada","rechazada"].includes(quote.status))))reject("Cotización no disponible.");
  const lines=await db.query<QuoteLine>("SELECT * FROM client_quote_lines WHERE quote_id=$1 ORDER BY position",[quoteId]);
  return {quote,lines,totals:quoteTotals(lines,Number(quote.vat_rate))};
}
export async function createQuote(actor:Actor,input:unknown){
  canEdit(actor);
  const data=z.object({submission_key:uuid,client_id:uuid,issuer:z.enum(["rerchar","e_y_j"]),title:z.string().trim().min(3).max(180),
    notes:optional(1000),issued_on:z.iso.date(),valid_until:z.iso.date(),vat_rate:z.union([z.literal("0"),z.literal("0.19")]).default("0.19"),line:item}).parse(input);
  if(data.valid_until<data.issued_on)reject("La vigencia no puede vencer antes de la fecha de emisión.");
  return transaction(async tx=>{
    const [client]=await tx.query<{name:string;tax_id:string|null;email:string|null;address:string|null}>("SELECT name,tax_id,email,address FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.client_id]);
    if(!client)reject("Seleccione un cliente registrado.");
    const [existing]=await tx.query<{id:string;created_by:string}>("SELECT id,created_by FROM client_quotes WHERE submission_key=$1",[data.submission_key]);
    if(existing){if(existing.created_by!==actor.id)reject("La clave de cotización pertenece a otro usuario.");return existing.id;}
    const [quote]=await tx.query<{id:string}>(`INSERT INTO client_quotes
      (submission_key,client_id,issuer,client_name,client_tax_id,client_email,client_address,title,notes,issued_on,valid_until,vat_rate,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),$10,$11,$12,$13) RETURNING id`,
      [data.submission_key,data.client_id,data.issuer,client.name,client.tax_id,client.email,client.address,data.title,data.notes,
       data.issued_on,data.valid_until,data.vat_rate,actor.id]);
    await tx.query("INSERT INTO client_quote_lines(quote_id,position,description,quantity,unit,unit_price_clp,taxable) VALUES ($1,1,$2,$3,$4,$5,$6)",
      [quote.id,data.line.description,data.line.quantity,data.line.unit,data.line.unit_price_clp,data.line.taxable]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'create','client_quote',$2,$3)",
      [actor.id,quote.id,JSON.stringify({client_id:data.client_id,title:data.title,issuer:data.issuer})]);
    return quote.id;
  });
}
export async function addQuoteLine(actor:Actor,quoteId:string,input:unknown){
  canEdit(actor);const id=uuid.parse(quoteId),data=item.parse(input);
  return transaction(async tx=>{
    const [quote]=await tx.query<{status:string}>("SELECT status FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||quote.status!=="borrador")reject("Sólo el borrador admite nuevos conceptos.");
    const [count]=await tx.query<{count:string}>("SELECT count(*)::text AS count FROM client_quote_lines WHERE quote_id=$1",[id]);
    if(Number(count.count)>=100)reject("Esta cotización alcanzó 100 conceptos.");
    const [line]=await tx.query<{id:string}>(`INSERT INTO client_quote_lines(quote_id,position,description,quantity,unit,unit_price_clp,taxable)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[id,Number(count.count)+1,data.description,data.quantity,data.unit,data.unit_price_clp,data.taxable]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'add_line','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify({line_id:line.id,description:data.description})]);
    return line.id;
  });
}
export async function recordQuoteDecision(actor:Actor,quoteId:string,decision:"aceptada"|"rechazada"){
  canEdit(actor);const id=uuid.parse(quoteId);
  if(!["aceptada","rechazada"].includes(decision))reject("Decisión inválida.");
  await transaction(async tx=>{
    const [quote]=await tx.query<{status:string}>("SELECT status FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||quote.status!=="enviada")reject("Registre el envío antes de actualizar la respuesta del cliente.");
    await tx.query("UPDATE client_quotes SET status=$2 WHERE id=$1",[id,decision]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,$2,'client_quote',$3,$4)",
      [actor.id,decision,id,JSON.stringify({status:decision})]);
  });
}

export async function resolveQuoteSending(actor:Actor,quoteId:string,outcome:"borrador"|"enviada",reason:unknown){
  if(actor.role!=="admin")reject("Sólo administración puede resolver un envío sin confirmación.");
  const id=uuid.parse(quoteId),note=z.string().trim().min(10).max(500).parse(reason);
  if(!["borrador","enviada"].includes(outcome))reject("Resolución de envío inválida.");
  await transaction(async tx=>{
    const [row]=await tx.query<{status:string}>("SELECT status FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(row?.status!=="enviando")reject("Esta cotización no necesita resolución de envío.");
    await tx.query("UPDATE client_quotes SET status=$2,sent_at=CASE WHEN $2='enviada' THEN now() ELSE NULL END WHERE id=$1",[id,outcome]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'resolve_send','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify({outcome,reason:note})]);
  });
}

export function quoteMailConfigured(){return Boolean(process.env.SMTP_HOST&&process.env.SMTP_PORT&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&process.env.SMTP_FROM);}
export async function sendQuote(actor:Actor,quoteId:string){
  canEdit(actor);
  if(!quoteMailConfigured())reject("Configure el correo remitente SMTP del sistema antes de enviar cotizaciones.");
  const id=uuid.parse(quoteId);
  const {quote,lines}=await getQuote(actor,id);
  if(quote.status!=="borrador")reject("Esta cotización ya no está en borrador.");
  if(!quote.client_email||!z.email().safeParse(quote.client_email).success)reject("Complete el correo del cliente y cree una nueva cotización para guardar sus datos de emisión.");
  const pdf=await renderQuotePdf(quote,lines);
  const [claimed]=await db.query<{id:string}>("UPDATE client_quotes SET status='enviando' WHERE id=$1 AND status='borrador' RETURNING id",[id]);
  if(!claimed)reject("La cotización cambió de estado. Recargue la pantalla.");
  try{
    const port=Number(process.env.SMTP_PORT);
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Puerto SMTP inválido.");
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,
      auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}});
    await transport.sendMail({from:process.env.SMTP_FROM,to:quote.client_email,
      subject:`Cotización COT-${String(quote.folio).padStart(5,"0")} · ${issuers[quote.issuer].name}`,
      text:`Estimada empresa ${quote.client_name}:\n\nAdjuntamos la cotización COT-${String(quote.folio).padStart(5,"0")} por ${quote.title}.\n\nSaludos cordiales,\n${issuers[quote.issuer].name}`,
      attachments:[{filename:`cotizacion-rerchar-${quote.folio}.pdf`,content:Buffer.from(pdf),contentType:"application/pdf"}]});
  }catch(error){
    console.error("Fallo de envío de cotización",error);
    // El servidor SMTP podría haber aceptado el mensaje antes de cortar la conexión: evite un segundo envío automático.
    throw new QuoteError("No se pudo confirmar el envío. Revise el correo saliente antes de reintentar; la cotización queda en estado de verificación.");
  }
  await transaction(async tx=>{
    await tx.query("UPDATE client_quotes SET status='enviada',sent_at=now() WHERE id=$1 AND status='enviando'",[id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'send','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify({recipient:quote.client_email,folio:quote.folio})]);
  });
}
