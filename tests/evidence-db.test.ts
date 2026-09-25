import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("evidencia del piloto hospedado persiste en PostgreSQL y respeta el alcance del cliente",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  process.env.EVIDENCE_STORAGE="database";
  const {db,transaction}=await import("../lib/db");
  const {addEvidence}=await import("../lib/pilot");
  const {getEvidence}=await import("../lib/evidence");
  for(const name of ["001_piloto.sql","002_flota_y_despacho.sql","003_abastecimiento.sql","004_mantenimiento_combustible.sql","005_contenedores.sql","006_acreditacion.sql","007_finanzas.sql","008_trazabilidad_ambiental.sql","009_certificados.sql","010_evidencia_persistente.sql","011_operacion_real_2026.sql"]){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [owner,other]=await db.query<{id:string}>("INSERT INTO clients (name) VALUES ('Cliente propio'),('Otro cliente') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites (client_id,name) VALUES ($1,'Faena') RETURNING id",[owner.id]);
  const [admin,portal,outsider]=await db.query<{id:string}>(`INSERT INTO users (email,name,password_hash,role,client_id)
    VALUES ('admin@demo.cl','Administrador','hash','admin',NULL),
    ('portal@demo.cl','Portal','hash','cliente',$1),('ajeno@demo.cl','Ajeno','hash','cliente',$2) RETURNING id`,[owner.id,other.id]);
  const [service]=await db.query<{id:string}>(`INSERT INTO service_requests
    (submission_key,client_id,site_id,service_type,waste_type,origin,destination,created_by,status)
    VALUES ($1,$2,$3,'retiro','Metal','Faena','Planta',$4,'programada') RETURNING id`,
    [randomUUID(),owner.id,site.id,admin.id]);
  const manager:Actor={id:admin.id,name:"Administrador",email:"admin@demo.cl",role:"admin",client_id:null};
  const ownClient:Actor={id:portal.id,name:"Portal",email:"portal@demo.cl",role:"cliente",client_id:owner.id};
  const otherClient:Actor={id:outsider.id,name:"Ajeno",email:"ajeno@demo.cl",role:"cliente",client_id:other.id};
  const content=Uint8Array.from([0xff,0xd8,0xff,0xd9]);
  const evidenceId=await addEvidence(manager,service.id,"Comprobante de prueba",
    new File([content],"guia.jpg",{type:"image/jpeg"}));
  const [stored]=await db.query<{file_content:Uint8Array;storage_key:string}>(
    "SELECT file_content,storage_key FROM service_evidence WHERE id=$1",[evidenceId]);
  assert.deepEqual(Buffer.from(stored.file_content),Buffer.from(content));
  assert.match(stored.storage_key,/^[0-9a-f-]{36}\.jpg$/);
  assert.deepEqual((await getEvidence(manager,evidenceId))?.data,Buffer.from(content));
  assert.equal((await getEvidence(ownClient,evidenceId))?.filename,"guia.jpg");
  assert.equal(await getEvidence(otherClient,evidenceId),null);
  await db.query("UPDATE service_requests SET deleted_at=now() WHERE id=$1",[service.id]);
  assert.equal(await getEvidence(ownClient,evidenceId),null);
});
