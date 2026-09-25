import { z } from "zod";
import type { Actor } from "./auth";
import { canManage } from "./auth";
import { db,transaction,type Db } from "./db";

const uuid=z.uuid();
const optionalId=z.union([uuid,z.literal("")]).default("");
const optional=(max=160)=>z.string().trim().max(max).optional().default("");
export class PersonnelError extends Error {}
function reject(message:string):never { throw new PersonnelError(message); }
function guard(actor:Actor) { if (!canManage(actor)) reject("Este módulo requiere acceso de operaciones."); }
function admin(actor:Actor) { if (actor.role!=="admin") reject("La verificación o revocación requiere una cuenta administradora."); }

export async function findMissingRequirements(tx:Db,workerId:string,clientId:string,siteId:string) {
  const rows=await tx.query<{name:string}>(`SELECT r.name FROM site_requirements r
    WHERE r.active=true AND r.client_id=$2 AND (r.site_id IS NULL OR r.site_id=$3)
    AND NOT EXISTS (SELECT 1 FROM worker_credentials c WHERE c.requirement_id=r.id AND c.user_id=$1 AND c.state='verificada'
      AND c.issued_on <= (now() AT TIME ZONE 'America/Santiago')::date AND c.expires_on >= (now() AT TIME ZONE 'America/Santiago')::date)
    ORDER BY r.name LIMIT 4`,[workerId,clientId,siteId]);
  return rows.map((row)=>row.name);
}

export type Worker={id:string;name:string;email:string;role:string;national_id:string|null;position:string|null;shift:string|null;phone:string|null};
export type Requirement={id:string;client_id:string;site_id:string|null;client_name:string;site_name:string|null;name:string;kind:string;warning_days:number;created_at:Date};
export type Credential={id:string;user_id:string;requirement_id:string;worker_name:string;requirement_name:string;client_name:string;site_name:string|null;
  reference:string;issued_on:Date|string;expires_on:Date|string;state:string;reviewed_by_name:string|null;review_note:string|null;created_at:Date};

export async function listPersonnel(actor:Actor) {
  guard(actor);
  const [workers,clients,sites,requirements,credentials]=await Promise.all([
    db.query<Worker>(`SELECT u.id,u.name,u.email,u.role,p.national_id,p.position,p.shift,p.phone FROM users u
      LEFT JOIN worker_profiles p ON p.user_id=u.id WHERE u.active=true AND u.role IN ('conductor','operaciones') ORDER BY u.name`),
    db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name"),
    db.query<{id:string;client_id:string;name:string;client_name:string}>(`SELECT s.id,s.client_id,s.name,c.name AS client_name FROM client_sites s
      JOIN clients c ON c.id=s.client_id WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.name,s.name`),
    db.query<Requirement>(`SELECT r.id,r.client_id,r.site_id,r.name,r.kind,r.warning_days,r.created_at,c.name AS client_name,s.name AS site_name
      FROM site_requirements r JOIN clients c ON c.id=r.client_id LEFT JOIN client_sites s ON s.id=r.site_id
      WHERE r.active=true ORDER BY c.name,s.name NULLS FIRST,r.name`),
    db.query<Credential>(`SELECT d.id,d.user_id,d.requirement_id,d.reference,d.issued_on,d.expires_on,d.state,d.review_note,d.created_at,
      u.name AS worker_name,r.name AS requirement_name,c.name AS client_name,s.name AS site_name,a.name AS reviewed_by_name
      FROM worker_credentials d JOIN users u ON u.id=d.user_id JOIN site_requirements r ON r.id=d.requirement_id
      JOIN clients c ON c.id=r.client_id LEFT JOIN client_sites s ON s.id=r.site_id LEFT JOIN users a ON a.id=d.reviewed_by
      ORDER BY CASE d.state WHEN 'pendiente' THEN 0 WHEN 'verificada' THEN 1 ELSE 2 END,d.created_at DESC LIMIT 400`),
  ]);
  return {workers,clients,sites,requirements,credentials};
}

export async function saveWorkerProfile(actor:Actor,userId:string,input:unknown) {
  guard(actor);
  const id=uuid.parse(userId);
  const data=z.object({national_id:optional(20),position:optional(120),shift:optional(80),phone:optional(40)}).parse(input);
  await transaction(async(tx)=>{
    const [worker]=await tx.query("SELECT id FROM users WHERE id=$1 AND role IN ('conductor','operaciones') AND active=true",[id]);
    if (!worker) reject("Seleccione un trabajador activo del equipo de operaciones.");
    await tx.query(`INSERT INTO worker_profiles (user_id,national_id,position,shift,phone,updated_by) VALUES ($1,NULLIF($2,''),NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),$6)
      ON CONFLICT (user_id) DO UPDATE SET national_id=NULLIF($2,''),position=NULLIF($3,''),shift=NULLIF($4,''),phone=NULLIF($5,''),updated_by=$6,updated_at=now()`,
      [id,data.national_id,data.position,data.shift,data.phone,actor.id]);
    await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'profile','worker_profile',$2,$3)",
      [actor.id,id,JSON.stringify(data)]);
  });
}

export async function createRequirement(actor:Actor,input:unknown) {
  guard(actor);
  const data=z.object({client_id:uuid,site_id:optionalId,name:z.string().trim().min(3).max(150),
    kind:z.enum(["licencia","curso","examen","acreditacion","otro"]),warning_days:z.coerce.number().int().min(0).max(365)}).parse(input);
  return transaction(async(tx)=>{
    const [client]=await tx.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.client_id]);
    if (!client) reject("Seleccione un cliente activo.");
    if(data.site_id) {
      const [site]=await tx.query("SELECT id FROM client_sites WHERE id=$1 AND client_id=$2 AND deleted_at IS NULL",[data.site_id,data.client_id]);
      if(!site) reject("La faena no pertenece a este cliente.");
    }
    const [created]=await tx.query<{id:string}>(`INSERT INTO site_requirements (client_id,site_id,name,kind,warning_days,created_by)
      VALUES ($1,NULLIF($2,'')::uuid,$3,$4,$5,$6) RETURNING id`,
      [data.client_id,data.site_id,data.name,data.kind,data.warning_days,actor.id]);
    await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'create','site_requirement',$2,$3)",
      [actor.id,created.id,JSON.stringify(data)]);
    return created.id;
  });
}

export async function disableRequirement(actor:Actor,idInput:string,reason:unknown) {
  admin(actor);
  const id=uuid.parse(idInput);
  const note=z.string().trim().min(5).max(500).parse(reason);
  await transaction(async(tx)=>{
    const [row]=await tx.query("UPDATE site_requirements SET active=false WHERE id=$1 AND active=true RETURNING id",[id]);
    if(!row) reject("Este requisito ya no está activo.");
    await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'disable','site_requirement',$2,$3)",
      [actor.id,id,JSON.stringify({reason:note})]);
  });
}

export async function recordCredential(actor:Actor,input:unknown) {
  guard(actor);
  const data=z.object({user_id:uuid,requirement_id:uuid,reference:z.string().trim().min(2).max(160),
    issued_on:z.iso.date(),expires_on:z.iso.date()}).parse(input);
  if(data.expires_on<data.issued_on) reject("El vencimiento no puede anteceder a la emisión.");
  return transaction(async(tx)=>{
    const [worker]=await tx.query("SELECT id FROM users WHERE id=$1 AND role='conductor' AND active=true",[data.user_id]);
    const [requirement]=await tx.query("SELECT id FROM site_requirements WHERE id=$1 AND active=true",[data.requirement_id]);
    if(!worker||!requirement) reject("Seleccione un conductor y un requisito activo.");
    const [credential]=await tx.query<{id:string}>(`INSERT INTO worker_credentials (user_id,requirement_id,reference,issued_on,expires_on,created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,[data.user_id,data.requirement_id,data.reference,data.issued_on,data.expires_on,actor.id]);
    await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'register','worker_credential',$2,$3)",
      [actor.id,credential.id,JSON.stringify(data)]);
    return credential.id;
  });
}

export async function reviewCredential(actor:Actor,idInput:string,decision:"verificada"|"rechazada"|"revocada",reason:unknown) {
  admin(actor);
  const id=uuid.parse(idInput);
  if(!["verificada","rechazada","revocada"].includes(decision)) reject("Decisión no permitida.");
  const review=decision==="verificada"?optional(500).parse(reason):z.string().trim().min(5).max(500).parse(reason);
  await transaction(async(tx)=>{
    const [credential]=await tx.query<{state:string;expires_on:Date|string}>("SELECT state,expires_on FROM worker_credentials WHERE id=$1 FOR UPDATE",[id]);
    if(!credential || (decision==="revocada"?credential.state!=="verificada":credential.state!=="pendiente")) reject("La credencial ya fue revisada o cambió de estado.");
    if(decision==="verificada") {
      const [current]=await tx.query("SELECT id FROM worker_credentials WHERE id=$1 AND expires_on >= (now() AT TIME ZONE 'America/Santiago')::date",[id]);
      if(!current) reject("Este documento ya está vencido. Registre una renovación.");
    }
    await tx.query("UPDATE worker_credentials SET state=$2,reviewed_by=$3,reviewed_at=now(),review_note=NULLIF($4,'') WHERE id=$1",
      [id,decision,actor.id,review]);
    await tx.query("INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value) VALUES ($1,$2,'worker_credential',$3,$4)",
      [actor.id,decision,id,JSON.stringify({reason:review})]);
  });
}
