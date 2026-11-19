import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import type {Actor} from "./auth";
import {canReadService} from "./auth";
import {z} from "zod";
import {db} from "./db";

export async function getEvidence(actor:Actor,id:string){
  if(!z.uuid().safeParse(id).success)return null;
  const [file]=await db.query<{
    storage_key:string|null;original_filename:string|null;mime_type:string|null;file_content:Uint8Array|null;
    client_id:string;driver_id:string|null;viewer_role:Actor["role"];viewer_client_id:string|null;
  }>(`SELECT e.storage_key,e.original_filename,e.mime_type,e.file_content,s.client_id,s.driver_id,v.role AS viewer_role,v.client_id AS viewer_client_id
    FROM service_evidence e JOIN service_requests s ON s.id=e.service_id
    JOIN users v ON v.id=$2 AND v.active=true WHERE e.id=$1 AND s.deleted_at IS NULL`,[id,actor.id]);
  if(!file||!file.storage_key||!canReadService({...actor,role:file.viewer_role,client_id:file.viewer_client_id},file))return null;
  if(!/^[0-9a-f-]{36}\.(pdf|png|jpg|webp)$/.test(file.storage_key))return null;
  const data=file.file_content?Buffer.from(file.file_content):await readFile(
    resolve(process.cwd(),process.env.STORAGE_DIR||".local/archivos",file.storage_key)).catch(()=>null);
  if(!data)return null;
  return {data,filename:file.original_filename||"evidencia",mime:file.mime_type||"application/octet-stream"};
}
