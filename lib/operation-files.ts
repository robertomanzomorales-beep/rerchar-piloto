import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction} from "./db";

const uuid=z.uuid();
export class OperationFileError extends Error {}
function reject(message:string):never{throw new OperationFileError(message);}
function mime(bytes:Buffer){
  if(bytes.subarray(0,4).toString()==="%PDF")return "application/pdf";
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP")return "image/webp";
  reject("Sólo PDF, JPG, PNG y WebP válidos.");
}
export type OperationFile={id:string;kind:string;filename:string;created_at:Date|string};
export async function listOperationFiles(actor:Actor,target:"receipt"|"invoice",id:string){
  if(!uuid.safeParse(id).success)reject("Registro inválido.");
  if(target==="invoice"){
    if(actor.role!=="admin")reject("Sin acceso a facturas de proveedores.");
    return db.query<OperationFile>("SELECT id,kind,filename,created_at FROM operation_files WHERE invoice_id=$1 ORDER BY created_at DESC",[id]);
  }
  if(actor.role==="conductor")reject("Sin acceso al registro de material.");
  const [receipt]=await db.query<{client_id:string}>("SELECT client_id FROM material_receipts WHERE id=$1",[id]);
  if(!receipt||(actor.role==="cliente"&&actor.client_id!==receipt.client_id))reject("Ingreso no disponible.");
  return db.query<OperationFile>("SELECT id,kind,filename,created_at FROM operation_files WHERE receipt_id=$1 ORDER BY created_at DESC",[id]);
}
export async function addOperationFile(actor:Actor,target:"receipt"|"invoice",id:string,kind:string,file:File){
  if(!canManage(actor)||target==="invoice"&&actor.role!=="admin")reject("No tiene autorización para cargar el archivo.");
  uuid.parse(id);
  const documentKind=z.enum(["guia","ticket","informe_impurezas","factura","comprobante","certificado","acta","otro"]).parse(kind);
  const maxMb=process.env.VERCEL?4:5;
  if(!file||file.size<1||file.size>maxMb*1024*1024)reject(`Seleccione un archivo de hasta ${maxMb} MB.`);
  const bytes=Buffer.from(await file.arrayBuffer());
  const type=mime(bytes);
  const filename=file.name.trim().replace(/[\r\n\\/]/g,"_").slice(0,160)||"archivo";
  return transaction(async tx=>{
    const [parent]=await tx.query(`SELECT id FROM ${target==="receipt"?"material_receipts":"supplier_invoices"} WHERE id=$1`,[id]);
    if(!parent)reject("Registro no encontrado.");
    const [created]=await tx.query<{id:string}>(`INSERT INTO operation_files(receipt_id,invoice_id,kind,filename,mime_type,content,uploaded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[target==="receipt"?id:null,target==="invoice"?id:null,
      documentKind,filename,type,bytes,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'upload','operation_file',$2,$3)",
      [actor.id,created.id,JSON.stringify({target,id,kind:documentKind,filename})]);
    return created.id;
  });
}
export async function getOperationFile(actor:Actor,id:string){
  if(!uuid.safeParse(id).success)return null;
  const [file]=await db.query<{id:string;receipt_id:string|null;invoice_id:string|null;client_id:string|null;
    filename:string;mime_type:string;content:Uint8Array}>(`SELECT f.id,f.receipt_id,f.invoice_id,r.client_id,f.filename,f.mime_type,f.content FROM operation_files f
    LEFT JOIN material_receipts r ON r.id=f.receipt_id WHERE f.id=$1`,[id]);
  if(!file||file.invoice_id&&actor.role!=="admin"||file.receipt_id&&(actor.role==="conductor"||actor.role==="cliente"&&actor.client_id!==file.client_id))return null;
  return {filename:file.filename,mime:file.mime_type,data:Buffer.from(file.content)};
}
