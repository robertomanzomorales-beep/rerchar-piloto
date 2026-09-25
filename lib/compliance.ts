import {z} from "zod";
import {canManage,type Actor} from "./auth";
import {db,transaction,type Db} from "./db";
import {revokeActiveCertificate} from "./certificates";

const uuid=z.uuid();
const text=(max:number)=>z.string().trim().min(2).max(max);
const form=z.object({service_id:uuid,category:z.enum(["no_peligroso","peligroso"]),classification:text(120),
  generator_name:text(160),transporter_name:text(160),receiver_name:text(160),treatment:text(160),guide_number:text(80)});
export class ComplianceError extends Error {}
function reject(message:string):never{throw new ComplianceError(message);}
function manager(actor:Actor){if(!canManage(actor))reject("Sólo operaciones puede gestionar registros ambientales.");}
function admin(actor:Actor){if(actor.role!=="admin")reject("La revisión y la referencia externa requieren administración.");}
async function event(tx:Db,actor:Actor,id:string,action:string,previous:unknown,next:unknown,reason?:string){
  await tx.query(`INSERT INTO waste_record_events (record_id,action,previous_value,next_value,reason,actor_id)
    VALUES ($1,$2,$3,$4,$5,$6)`,[id,action,previous?JSON.stringify(previous):null,JSON.stringify(next),reason??null,actor.id]);
  await tx.query(`INSERT INTO audit_events (actor_id,action,entity_type,entity_id,previous_value,next_value)
    VALUES ($1,$2,'waste_record',$3,$4,$5)`,[actor.id,action,id,previous?JSON.stringify(previous):null,JSON.stringify(next)]);
}
export type WasteRecord={id:string;service_id:string;folio:string;client_id:string;client_name:string;site_name:string;waste_type:string;
  category:string;classification:string;generator_name:string;transporter_name:string;receiver_name:string;treatment:string;
  guide_number:string;quantity_kg:string;status:string;external_system:string|null;external_reference:string|null;
  reported_on:Date|string|null;review_note:string|null;updated_at:Date;created_at:Date;evidence_count:string};
const select=`SELECT w.*,s.folio,s.client_id,c.name AS client_name,cs.name AS site_name,s.waste_type,
  (SELECT count(*)::text FROM service_evidence e WHERE e.service_id=s.id AND e.storage_key IS NOT NULL) AS evidence_count
  FROM waste_records w JOIN service_requests s ON s.id=w.service_id
  JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id`;

export async function listWasteRecords(actor:Actor,clientId=""){
  manager(actor);
  if(clientId&&!uuid.safeParse(clientId).success)reject("Cliente inválido.");
  return db.query<WasteRecord>(`${select} WHERE s.deleted_at IS NULL AND ($1::text='' OR s.client_id=NULLIF($1,'')::uuid)
    ORDER BY w.updated_at DESC LIMIT 300`,[clientId]);
}
export async function getWasteRecord(actor:Actor,recordId:string){
  manager(actor);
  if(!uuid.safeParse(recordId).success)reject("Registro inválido.");
  const [record]=await db.query<WasteRecord>(`${select} WHERE w.id=$1`,[recordId]);
  if(!record)reject("Registro inexistente.");
  const events=await db.query<{id:string;action:string;reason:string|null;actor_name:string;created_at:Date}>(`
    SELECT e.id,e.action,e.reason,u.name AS actor_name,e.created_at FROM waste_record_events e
    JOIN users u ON u.id=e.actor_id WHERE e.record_id=$1 ORDER BY e.created_at DESC,e.id DESC`,[recordId]);
  return {record,events};
}

export async function saveWasteRecord(actor:Actor,input:unknown){
  manager(actor);
  const data=form.parse(input);
  return transaction(async(tx)=>{
    const [service]=await tx.query<{id:string;status:string;gross_kg:string;tare_kg:string}>(`
      SELECT id,status,gross_kg,tare_kg FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[data.service_id]);
    if(!service||service.status!=="completada")reject("Cierre primero el servicio para preparar su registro ambiental.");
    const [previous]=await tx.query<{id:string;status:string;category:string;classification:string;generator_name:string;
      transporter_name:string;receiver_name:string;treatment:string;guide_number:string;quantity_kg:string}>(`
      SELECT id,status,category,classification,generator_name,transporter_name,receiver_name,treatment,guide_number,quantity_kg
      FROM waste_records WHERE service_id=$1 FOR UPDATE`,[data.service_id]);
    if(previous&&previous.status!=="borrador"&&previous.status!=="observado")reject("La ficha revisada está bloqueada. Registre una observación motivada para corregirla.");
    const quantity=Number(service.gross_kg)-Number(service.tare_kg);
    if(!Number.isFinite(quantity)||quantity<0)reject("El pesaje del servicio requiere revisión.");
    const next={...data,quantity_kg:quantity,status:"borrador"};
    const [row]=await tx.query<{id:string}>(previous ? `UPDATE waste_records SET category=$2,classification=$3,generator_name=$4,
      transporter_name=$5,receiver_name=$6,treatment=$7,guide_number=$8,quantity_kg=$9,status='borrador',
      review_note=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=now() WHERE id=$1 RETURNING id`
      : `INSERT INTO waste_records (service_id,category,classification,generator_name,transporter_name,receiver_name,treatment,
      guide_number,quantity_kg,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      previous ? [previous.id,data.category,data.classification,data.generator_name,data.transporter_name,data.receiver_name,data.treatment,data.guide_number,quantity]
        : [data.service_id,data.category,data.classification,data.generator_name,data.transporter_name,data.receiver_name,data.treatment,data.guide_number,quantity,actor.id]);
    await event(tx,actor,row.id,previous?"editar":"crear",previous,next);
    return row.id;
  });
}

export async function reviewWasteRecord(actor:Actor,id:string){
  admin(actor);uuid.parse(id);
  await transaction(async(tx)=>{
    const [record]=await tx.query<{service_id:string;status:string;guide_number:string;category:string}>(`
      SELECT service_id,status,guide_number,category FROM waste_records WHERE id=$1 FOR UPDATE`,[id]);
    if(!record||record.status!=="borrador")reject("Sólo se puede revisar un borrador.");
    const [evidence]=await tx.query<{total:string}>(`SELECT count(*)::text AS total FROM service_evidence
      WHERE service_id=$1 AND storage_key IS NOT NULL`,[record.service_id]);
    if(Number(evidence.total)<1)reject("Adjunte evidencia al servicio antes de revisar el registro.");
    const [service]=await tx.query<{status:string}>("SELECT status FROM service_requests WHERE id=$1 FOR UPDATE",[record.service_id]);
    if(service?.status!=="completada")reject("El servicio debe estar cerrado.");
    await tx.query(`UPDATE waste_records SET status='revisado',reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id=$1`,[id,actor.id]);
    await event(tx,actor,id,"revisar",record,{status:"revisado",evidence_count:evidence.total});
  });
}

export async function observeWasteRecord(actor:Actor,id:string,reason:unknown){
  admin(actor);uuid.parse(id);
  const note=z.string().trim().min(5).max(500).parse(reason);
  await transaction(async(tx)=>{
    const [lookup]=await tx.query<{service_id:string}>("SELECT service_id FROM waste_records WHERE id=$1",[id]);
    if(!lookup)reject("Ficha no encontrada.");
    // Use the same service-first lock order as certificate issuance.
    await tx.query("SELECT id FROM service_requests WHERE id=$1 FOR UPDATE",[lookup.service_id]);
    const [record]=await tx.query<{service_id:string;status:string;external_system:string|null;external_reference:string|null}>(`
      SELECT service_id,status,external_system,external_reference FROM waste_records WHERE id=$1 FOR UPDATE`,[id]);
    if(!record||!["revisado","declarado"].includes(record.status))reject("Sólo puede observar una ficha revisada o declarada.");
    await tx.query(`UPDATE waste_records SET status='observado',external_system=NULL,external_reference=NULL,
      reported_on=NULL,review_note=$2,updated_at=now() WHERE id=$1`,[id,note]);
    await revokeActiveCertificate(tx,actor,record.service_id,`Ficha ambiental observada: ${note}`);
    await event(tx,actor,id,"observar",record,{status:"observado",review_note:note},note);
  });
}

export async function recordExternalDeclaration(actor:Actor,id:string,input:unknown){
  admin(actor);uuid.parse(id);
  const data=z.object({external_reference:text(120),reported_on:z.iso.date()}).parse(input);
  await transaction(async(tx)=>{
    const [record]=await tx.query<{status:string;category:string}>("SELECT status,category FROM waste_records WHERE id=$1 FOR UPDATE",[id]);
    if(!record||record.status!=="revisado")reject("Revise la ficha antes de asociar una declaración externa.");
    const system=record.category==="peligroso"?"SIDREP":"SINADER";
    await tx.query(`UPDATE waste_records SET status='declarado',external_system=$2,external_reference=$3,
      reported_on=$4,updated_at=now() WHERE id=$1`,[id,system,data.external_reference,data.reported_on]);
    await event(tx,actor,id,"declarar",record,{status:"declarado",external_system:system,...data});
  });
}
