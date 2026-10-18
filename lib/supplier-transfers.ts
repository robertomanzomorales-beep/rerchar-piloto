import {z} from "zod";
import type {Actor} from "./auth";
import type {Company} from "./companies";
import {db,transaction,type Db} from "./db";
import {moduleReady} from "./schema-readiness";
import {todayChile} from "./receivables";

export class SupplierTransferError extends Error {}
const reject=(message:string):never=>{throw new SupplierTransferError(message);};
const uuid=z.uuid();
const positive=z.union([z.string(),z.number()]).transform((raw,ctx)=>{
  const value=String(raw).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)<=0||Number(value)>100_000_000_000){
    ctx.addIssue({code:"custom",message:"Ingrese un monto positivo en pesos."});return z.NEVER;
  }
  return value;
});
const day=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const requestSchema=z.object({submission_key:uuid,amount_clp:positive,bank_name:z.string().trim().max(100).default(""),
  account_type:z.enum(["corriente","vista","ahorro","otro",""]).default(""),account_number:z.string().trim().max(60).default("")});
const executionSchema=z.object({paid_on:z.iso.date(),bank_reference:z.string().trim().min(4).max(160)});
const verificationSchema=z.object({checked_amount_clp:positive,checked_reference:z.string().trim().min(4).max(160),
  verification_note:z.string().trim().min(5).max(500)});
function admin(actor:Actor){if(actor.role!=="admin")reject("El control de transferencias requiere administración.");}
async function ready(){if(!await moduleReady("supplier_transfers"))reject("Falta aplicar la migración 044 de transferencias.");}
const cents=(value:string|number)=>Math.round(Number(value)*100);
function fileType(bytes:Buffer){
  if(bytes.subarray(0,4).toString()==="%PDF")return "application/pdf";
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP")return "image/webp";
  reject("El comprobante debe ser un PDF, JPG, PNG o WebP válido.");
}
type TransferStatus="solicitada"|"aprobada"|"rechazada"|"ejecutada"|"verificada";
export type SupplierTransfer={id:string;invoice_id:string;amount_clp:string;bank_name:string;account_type:string;account_number:string;
  status:TransferStatus;requested_by:string;approved_by:string|null;executed_by:string|null;verified_by:string|null;
  requested_name:string;approved_name:string|null;executed_name:string|null;verified_name:string|null;
  created_at:Date|string;approved_at:Date|string|null;executed_at:Date|string|null;verified_at:Date|string|null;
  decision_note:string|null;verification_note:string|null;paid_on:Date|string|null;bank_reference:string|null;payment_id:string|null;
  proof_id:string|null;proof_name:string|null;issuer:Company;supplier_name:string;supplier_tax_id:string;invoice_number:string;
  total_clp:string;paid_clp:string;due_on:Date|string|null};
const select=`SELECT t.*,i.issuer,i.supplier_name,i.supplier_tax_id,i.invoice_number,i.total_clp,i.paid_clp,i.due_on,
  req.name AS requested_name,ap.name AS approved_name,exe.name AS executed_name,ver.name AS verified_name,
  f.id AS proof_id,f.filename AS proof_name
  FROM supplier_transfer_requests t JOIN supplier_invoices i ON i.id=t.invoice_id
  JOIN users req ON req.id=t.requested_by LEFT JOIN users ap ON ap.id=t.approved_by
  LEFT JOIN users exe ON exe.id=t.executed_by LEFT JOIN users ver ON ver.id=t.verified_by
  LEFT JOIN supplier_transfer_proofs f ON f.transfer_id=t.id`;

export async function listSupplierTransfers(actor:Actor,company:Company|""=""){
  admin(actor);await ready();
  if(company&&!(["rerchar","e_y_j"] as string[]).includes(company))reject("Empresa inválida.");
  return db.query<SupplierTransfer>(`${select} WHERE ($1::text='' OR i.issuer=$1)
    ORDER BY CASE t.status WHEN 'solicitada' THEN 0 WHEN 'aprobada' THEN 1 WHEN 'ejecutada' THEN 2 ELSE 3 END,
    t.created_at DESC LIMIT 300`,[company]);
}
export async function invoiceSupplierTransfers(actor:Actor,invoiceId:string){
  admin(actor);await ready();if(!uuid.safeParse(invoiceId).success)reject("Factura inválida.");
  return db.query<SupplierTransfer>(`${select} WHERE t.invoice_id=$1 ORDER BY t.created_at DESC`,[invoiceId]);
}
export async function supplierTransferOverview(actor:Actor,company:Company|""=""){
  admin(actor);await ready();
  const [row]=await db.query<{solicitadas:string;aprobadas:string;ejecutadas:string;verificadas:string}>(`SELECT
    count(*) FILTER (WHERE t.status='solicitada')::text AS solicitadas,
    count(*) FILTER (WHERE t.status='aprobada')::text AS aprobadas,
    count(*) FILTER (WHERE t.status='ejecutada')::text AS ejecutadas,
    count(*) FILTER (WHERE t.status='verificada')::text AS verificadas
    FROM supplier_transfer_requests t JOIN supplier_invoices i ON i.id=t.invoice_id
    WHERE ($1::text='' OR i.issuer=$1)`,[company]);
  return row;
}
export async function requestSupplierTransfer(actor:Actor,invoiceId:string,input:unknown){
  admin(actor);await ready();if(!uuid.safeParse(invoiceId).success)reject("Factura inválida.");
  const data=requestSchema.parse(input);
  const profilesReady=await moduleReady("counterparty_profiles");
  return transaction(async tx=>{
    const [invoice]=await tx.query<{id:string;total_clp:string;paid_clp:string;status:string;review_status:string;supplier_tax_id:string;supplier_profile_id?:string|null}>(
      `SELECT id,total_clp,paid_clp,status,review_status,supplier_tax_id${profilesReady?",supplier_profile_id":""} FROM supplier_invoices WHERE id=$1 FOR UPDATE`,[invoiceId]);
    if(!invoice||invoice.status==="pagada")reject("La factura no tiene saldo disponible.");
    if(invoice.review_status!=="aceptada")reject("Revise y acepte la factura recibida antes de solicitar su transferencia.");
    const [existing]=await tx.query<{id:string;invoice_id:string}>(
      "SELECT id,invoice_id FROM supplier_transfer_requests WHERE submission_key=$1",[data.submission_key]);
    if(existing){if(existing.invoice_id!==invoiceId)reject("La clave de solicitud corresponde a otra factura.");return existing.id;}
    let bankName=data.bank_name,accountType:string=data.account_type,accountNumber=data.account_number;
    if(profilesReady){
      const [profile]=await tx.query<{id:string;status:string;kind:string;bank_name:string;account_type:string;account_number:string}>(
        `SELECT id,status,kind,bank_name,account_type,account_number FROM counterparty_profiles
         WHERE ($1::uuid IS NULL OR id=$1)
           AND upper(regexp_replace(tax_id,'[.[:space:]]','','g'))=upper(regexp_replace($2,'[.[:space:]]','','g'))
         LIMIT 1 FOR UPDATE`,
        [invoice.supplier_profile_id||null,invoice.supplier_tax_id]);
      if(!profile||profile.kind==="cliente"||profile.status!=="verificada")
        reject("Antes de transferir, registre y verifique la ficha bancaria del proveedor.");
      if(!invoice.supplier_profile_id)await tx.query("UPDATE supplier_invoices SET supplier_profile_id=$2 WHERE id=$1",[invoiceId,profile.id]);
      bankName=profile.bank_name;accountType=profile.account_type;accountNumber=profile.account_number;
    }
    if(!bankName||!accountNumber||!(["corriente","vista","ahorro","otro"] as string[]).includes(accountType))
      reject("Complete banco, tipo y número de cuenta.");
    const [reserved]=await tx.query<{amount:string}>(`SELECT COALESCE(sum(amount_clp),0)::text AS amount FROM supplier_transfer_requests
      WHERE invoice_id=$1 AND status IN ('solicitada','aprobada','ejecutada')`,[invoiceId]);
    if(cents(data.amount_clp)+cents(reserved.amount)>cents(invoice.total_clp)-cents(invoice.paid_clp))
      reject("La solicitud supera el saldo disponible considerando las transferencias en curso.");
    const [created]=await tx.query<{id:string}>(`INSERT INTO supplier_transfer_requests
      (submission_key,invoice_id,amount_clp,bank_name,account_type,account_number,requested_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [data.submission_key,invoiceId,data.amount_clp,bankName,accountType,accountNumber,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'request','supplier_transfer',$2,$3)",
      [actor.id,created.id,JSON.stringify({invoice_id:invoiceId,amount_clp:data.amount_clp,bank_name:bankName,account_type:accountType,account_ending:accountNumber.slice(-4)})]);
    return created.id;
  });
}
async function assertCurrentBank(tx:Db,transferId:string){
  const [current]=await tx.query<{status:string;bank_name:string;account_type:string;account_number:string;
    saved_bank_name:string;saved_account_type:string;saved_account_number:string}>(
    `SELECT p.status,p.bank_name,p.account_type,p.account_number,
      t.bank_name AS saved_bank_name,t.account_type AS saved_account_type,t.account_number AS saved_account_number
     FROM supplier_transfer_requests t JOIN supplier_invoices i ON i.id=t.invoice_id
     JOIN counterparty_profiles p ON p.id=i.supplier_profile_id
     WHERE t.id=$1 FOR UPDATE OF p`,[transferId]);
  if(!current||current.status!=="verificada"||current.bank_name!==current.saved_bank_name||
    current.account_type!==current.saved_account_type||current.account_number!==current.saved_account_number)
    reject("La ficha bancaria cambió o está pendiente de revisión. Rechace la solicitud y cree una nueva con la cuenta verificada.");
}
export async function decideSupplierTransfer(actor:Actor,id:string,decision:"aprobada"|"rechazada",note:string){
  admin(actor);await ready();if(!uuid.safeParse(id).success)reject("Solicitud inválida.");
  const profilesReady=await moduleReady("counterparty_profiles");
  const reason=z.string().trim().max(500).parse(note);
  if(decision==="rechazada"&&reason.length<5)reject("Indique el motivo del rechazo.");
  return transaction(async tx=>{
    const [before]=await tx.query<{invoice_id:string;status:TransferStatus;requested_by:string;amount_clp:string}>(
      "SELECT invoice_id,status,requested_by,amount_clp FROM supplier_transfer_requests WHERE id=$1 FOR UPDATE",[id]);
    if(!before||before.status!=="solicitada")reject("La solicitud ya fue resuelta.");
    if(before.requested_by===actor.id)reject("La persona que solicitó no puede aprobar o rechazar su propia transferencia.");
    if(decision==="aprobada"){
      if(profilesReady)await assertCurrentBank(tx,id);
      const [invoice]=await tx.query<{total_clp:string;paid_clp:string;review_status:string}>(
        "SELECT total_clp,paid_clp,review_status FROM supplier_invoices WHERE id=$1 FOR UPDATE",[before.invoice_id]);
      if(invoice.review_status!=="aceptada")reject("La factura debe permanecer aceptada para aprobar esta transferencia.");
      const [proof]=await tx.query("SELECT id FROM operation_files WHERE invoice_id=$1 AND kind='factura' LIMIT 1",[before.invoice_id]);
      if(!proof)reject("Adjunte la factura original antes de aprobar la transferencia.");
      const [reserved]=await tx.query<{amount:string}>(`SELECT COALESCE(sum(amount_clp),0)::text AS amount FROM supplier_transfer_requests
        WHERE invoice_id=$1 AND status IN ('solicitada','aprobada','ejecutada')`,[before.invoice_id]);
      if(cents(reserved.amount)>cents(invoice.total_clp)-cents(invoice.paid_clp))
        reject("El saldo cambió. Revise las solicitudes y pagos de la factura.");
    }
    await tx.query(`UPDATE supplier_transfer_requests SET status=$2,approved_by=$3,approved_at=now(),decision_note=$4,updated_at=now() WHERE id=$1`,
      [id,decision,actor.id,reason||null]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,$2,'supplier_transfer',$3,$4)",
      [actor.id,decision==="aprobada"?"approve":"reject",id,JSON.stringify({invoice_id:before.invoice_id,amount_clp:before.amount_clp,note:reason})]);
  });
}
export async function executeSupplierTransfer(actor:Actor,id:string,input:unknown,file:File){
  admin(actor);await ready();if(!uuid.safeParse(id).success)reject("Solicitud inválida.");
  const profilesReady=await moduleReady("counterparty_profiles");
  const data=executionSchema.parse(input);
  if(data.paid_on>todayChile())reject("La transferencia no puede tener fecha futura.");
  if(!file||file.size<1||file.size>(process.env.VERCEL?4:5)*1024*1024)reject("Adjunte un comprobante de hasta 4 MB.");
  const bytes=Buffer.from(await file.arrayBuffer()),type=fileType(bytes);
  const filename=file.name.trim().replace(/[\r\n\\/]/g,"_").slice(0,160)||"comprobante";
  return transaction(async tx=>{
    const [before]=await tx.query<{status:TransferStatus;invoice_id:string;requested_by:string;approved_by:string}>(
      "SELECT status,invoice_id,requested_by,approved_by FROM supplier_transfer_requests WHERE id=$1 FOR UPDATE",[id]);
    if(!before||before.status!=="aprobada")reject("Apruebe primero la solicitud de transferencia.");
    if(before.approved_by===actor.id)reject("Quien aprobó debe dejar la ejecución a otra persona.");
    if(profilesReady)await assertCurrentBank(tx,id);
    const [invoice]=await tx.query<{issued_on:Date|string}>("SELECT issued_on FROM supplier_invoices WHERE id=$1",[before.invoice_id]);
    if(data.paid_on<day(invoice.issued_on))reject("La fecha de pago no puede anteceder a la factura.");
    await tx.query(`INSERT INTO supplier_transfer_proofs(transfer_id,filename,mime_type,content,uploaded_by)
      VALUES($1,$2,$3,$4,$5)`,[id,filename,type,bytes,actor.id]);
    await tx.query(`UPDATE supplier_transfer_requests SET status='ejecutada',executed_by=$2,executed_at=now(),
      paid_on=$3,bank_reference=$4,updated_at=now() WHERE id=$1`,[id,actor.id,data.paid_on,data.bank_reference]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'execute','supplier_transfer',$2,$3)",
      [actor.id,id,JSON.stringify({...data,filename})]);
  });
}
export async function verifySupplierTransfer(actor:Actor,id:string,input:unknown){
  admin(actor);await ready();if(!uuid.safeParse(id).success)reject("Solicitud inválida.");
  const data=verificationSchema.parse(input);
  return transaction(async tx=>{
    const [reference]=await tx.query<{invoice_id:string}>("SELECT invoice_id FROM supplier_transfer_requests WHERE id=$1",[id]);
    if(!reference)reject("Solicitud no encontrada.");
    const [invoice]=await tx.query<{total_clp:string;paid_clp:string}>(
      "SELECT total_clp,paid_clp FROM supplier_invoices WHERE id=$1 FOR UPDATE",[reference.invoice_id]);
    const [before]=await tx.query<{status:TransferStatus;amount_clp:string;bank_reference:string|null;paid_on:Date|string|null;
      executed_by:string|null;payment_id:string|null;submission_key:string}>(
      "SELECT status,amount_clp,bank_reference,paid_on,executed_by,payment_id,submission_key FROM supplier_transfer_requests WHERE id=$1 FOR UPDATE",[id]);
    if(before.status==="verificada"&&before.payment_id)return before.payment_id;
    if(before.status!=="ejecutada")reject("Registre primero la transferencia y su comprobante.");
    if(before.executed_by===actor.id)reject("Quien registró la transferencia no puede comprobar su propio pago.");
    if(cents(before.amount_clp)!==cents(data.checked_amount_clp)||before.bank_reference!==data.checked_reference)
      reject("El monto o la referencia revisados no coinciden con la transferencia.");
    const [proof]=await tx.query("SELECT id FROM supplier_transfer_proofs WHERE transfer_id=$1",[id]);
    if(!proof)reject("Falta el comprobante de la transferencia.");
    const paid=cents(invoice.paid_clp)+cents(before.amount_clp),total=cents(invoice.total_clp);
    if(paid>total)reject("El pago supera el saldo actual de la factura.");
    const [payment]=await tx.query<{id:string}>(`INSERT INTO supplier_invoice_payments
      (submission_key,invoice_id,amount_clp,paid_on,reference,recorded_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [before.submission_key,reference.invoice_id,before.amount_clp,before.paid_on,before.bank_reference,actor.id]);
    await tx.query("UPDATE supplier_invoices SET paid_clp=$2,status=$3,paid_on=$4,updated_at=now() WHERE id=$1",
      [reference.invoice_id,paid/100,paid===total?"pagada":"parcial",before.paid_on]);
    await tx.query(`UPDATE supplier_transfer_requests SET status='verificada',verified_by=$2,verified_at=now(),
      verification_note=$3,payment_id=$4,updated_at=now() WHERE id=$1`,[id,actor.id,data.verification_note,payment.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'verify','supplier_transfer',$2,$3)",
      [actor.id,id,JSON.stringify({invoice_id:reference.invoice_id,payment_id:payment.id,amount_clp:before.amount_clp,
        bank_reference:before.bank_reference,note:data.verification_note})]);
    return payment.id;
  });
}
export async function supplierTransferProof(actor:Actor,id:string){
  admin(actor);await ready();if(!uuid.safeParse(id).success)reject("Comprobante inválido.");
  const [proof]=await db.query<{filename:string;mime_type:string;content:Uint8Array}>(
    "SELECT filename,mime_type,content FROM supplier_transfer_proofs WHERE transfer_id=$1",[id]);
  return proof?{filename:proof.filename,mime:proof.mime_type,data:Buffer.from(proof.content)}:null;
}
