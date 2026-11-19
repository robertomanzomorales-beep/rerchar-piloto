import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";
test("los adjuntos conservan archivo, reintento, empresa y permisos actuales",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";process.env.EVIDENCE_STORAGE="database";
  const {db,transaction}=await import("../lib/db"),{addEvidence,PilotError}=await import("../lib/pilot"),{getEvidence}=await import("../lib/evidence");
  for(const name of (await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});}
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente adjuntos revisión'),('Otro cliente adjuntos') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const rows=await db.query<{id:string;role:Actor['role'];client_id:string|null}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES('admin@evidence.example.invalid','Admin','h','admin',NULL),('ops@evidence.example.invalid','Operaciones','h','operaciones',NULL),('driver@evidence.example.invalid','Conductor','h','conductor',NULL),('client@evidence.example.invalid','Cliente','h','cliente',$1),('other@evidence.example.invalid','Ajeno','h','cliente',$2) RETURNING id,role,client_id",[client.id,other.id]);
  const actors=rows.map(r=>({...r,name:"Revisión",email:"test@example.invalid"})),[admin,ops,driver,portal,foreign]=actors;
  const services:Record<string,string>={};for(const company of ["rerchar","e_y_j"]){const [s]=await db.query<{id:string}>("INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,driver_id,created_by) VALUES(gen_random_uuid(),$1,$2,$3,'traslado','Material','Faena','Patio','programada',$4,$5) RETURNING id",[client.id,site.id,company,driver.id,admin.id]);services[company]=s.id;}
  const content=Uint8Array.from([0xff,0xd8,0xff,0xd9]),jpg=(name="Guía Niño's (1).jpg",extra=false)=>new File([extra?Uint8Array.from([...content,1]):content],name,{type:"image/jpeg"}),pdf=()=>new File(["%PDF-1.7\n"],"respaldo.pdf",{type:"application/pdf"});let saved="";const nonce=randomUUID();
  await t.test("el archivo mantiene contenido, nombre y acceso del servicio en ambas empresas",async()=>{
    for(const company of ["rerchar","e_y_j"] as const){const id=await addEvidence(ops,services[company],"Detalle & respaldo",jpg(),"guia_traslado",{submissionKey:company==="rerchar"?nonce:randomUUID(),company});if(company==="rerchar")saved=id;const own=await getEvidence(portal,id);assert.equal(own?.filename,"Guía Niño's (1).jpg");assert.equal(own?.mime,"image/jpeg");assert.deepEqual(own?.data,Buffer.from(content));assert.equal(await getEvidence(foreign,id),null);assert.ok(await getEvidence(driver,id));}
  });
  await t.test("el reintento idéntico no crea otra evidencia y los cambios de contenido se rechazan",async()=>{
    const options={submissionKey:nonce,company:"rerchar" as const};assert.equal(await addEvidence(ops,services.rerchar,"Detalle & respaldo",jpg(),"guia_traslado",options),saved);
    for(const [description,file,kind]of [["Otro detalle",jpg(),"guia_traslado"],["Detalle & respaldo",jpg("otra.jpg"),"guia_traslado"],["Detalle & respaldo",jpg(undefined,true),"guia_traslado"],["Detalle & respaldo",jpg(),"hoja_servicio"]] as const)await assert.rejects(()=>addEvidence(ops,services.rerchar,description,file,kind,options),/ya guardó otro documento/);
    const audit=await db.query("SELECT id FROM audit_events WHERE action='evidencia' AND next_value->>'evidence_id'=$1",[saved]);assert.equal(audit.length,1);
  });
  await t.test("un adjunto vacío, incompleto, excesivo o de formato incorrecto no se guarda",async()=>{
    for(const file of [null,"archivo",new File([],"vacío.jpg"),new File([new Uint8Array(5*1024*1024+1)],"grande.jpg"),new File(["archivo inválido"],"falso.jpg")] as unknown as File[])await assert.rejects(()=>addEvidence(ops,services.rerchar,"",file),PilotError);
    await assert.rejects(()=>addEvidence(ops,services.rerchar,"",pdf(),"foto_area"),/foto del área/);
    await assert.rejects(()=>addEvidence(ops,services.rerchar,"",jpg(),"evidencia",{company:"e_y_j"}),/empresa del servicio cambió/);await assert.rejects(()=>addEvidence(ops,services.e_y_j,"",jpg(),"guia_valorizada"),/no utiliza/);
  });
  await t.test("la carga vuelve a comprobar el perfil y estado reales de quien adjunta",async()=>{
    await db.query("UPDATE users SET role='cliente',client_id=$2 WHERE id=$1",[ops.id,client.id]);await assert.rejects(()=>addEvidence(ops,services.rerchar,"",jpg()),/permisos cambiaron/);await db.query("UPDATE users SET role='operaciones',client_id=NULL WHERE id=$1",[ops.id]);
    await db.query("UPDATE users SET role='conductor' WHERE id=$1",[admin.id]);await db.query("UPDATE service_requests SET driver_id=$2 WHERE id=$1",[services.rerchar,admin.id]);await assert.rejects(()=>addEvidence(admin,services.rerchar,"",jpg(),"factura"),/conductor sólo/);await db.query("UPDATE users SET role='admin',active=false WHERE id=$1",[admin.id]);await assert.rejects(()=>addEvidence(admin,services.rerchar,"",jpg()),/acceso para adjuntar/);await db.query("UPDATE users SET active=true WHERE id=$1",[admin.id]);await db.query("UPDATE service_requests SET driver_id=$2 WHERE id=$1",[services.rerchar,driver.id]);
  });
  await t.test("la descarga usa el perfil actual y rechaza identificadores inválidos sin consultar como UUID",async()=>{
    for(const id of ["------------------------------------","abc","00000000-0000-0000-0000-00000000000Z"])assert.equal(await getEvidence(admin,id),null);
    await db.query("UPDATE users SET client_id=$2 WHERE id=$1",[portal.id,other.id]);assert.equal(await getEvidence(portal,saved),null);await db.query("UPDATE users SET client_id=$2 WHERE id=$1",[portal.id,client.id]);await db.query("UPDATE users SET active=false WHERE id=$1",[portal.id]);assert.equal(await getEvidence(portal,saved),null);await db.query("UPDATE users SET active=true WHERE id=$1",[portal.id]);
    await db.query("UPDATE service_requests SET deleted_at=now() WHERE id=$1",[services.rerchar]);assert.equal(await getEvidence(admin,saved),null);await db.query("UPDATE service_requests SET deleted_at=NULL WHERE id=$1",[services.rerchar]);
  });
  await t.test("los registros sin binario ni archivo persistente no provocan una descarga vacía",async()=>{
    const [missing]=await db.query<{id:string}>("INSERT INTO service_evidence(service_id,description,storage_key,original_filename,created_by) VALUES($1,'Falta archivo',$2,'faltante.jpg',$3) RETURNING id",[services.rerchar,randomUUID()+".jpg",admin.id]);assert.equal(await getEvidence(admin,missing.id),null);
  });
  await t.test("el almacenamiento en disco no deja copias del reintento ni archivos tras rechazar permisos",async()=>{
    const directory=await mkdtemp(join(tmpdir(),"rerchar-evidence-files-"));process.env.EVIDENCE_STORAGE="";process.env.STORAGE_DIR=directory;const options={submissionKey:randomUUID(),company:"rerchar" as const};const id=await addEvidence(ops,services.rerchar,"Respaldo en disco",jpg(),"evidencia",options);assert.equal(await addEvidence(ops,services.rerchar,"Respaldo en disco",jpg(),"evidencia",options),id);assert.equal((await readdir(directory)).length,1);assert.deepEqual((await getEvidence(portal,id))?.data,Buffer.from(content));
    await db.query("UPDATE users SET active=false WHERE id=$1",[ops.id]);await assert.rejects(()=>addEvidence(ops,services.rerchar,"Otro respaldo",jpg()),/acceso para adjuntar/);assert.equal((await readdir(directory)).length,1);process.env.EVIDENCE_STORAGE="database";
  });
});
