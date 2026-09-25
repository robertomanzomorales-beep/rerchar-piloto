import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("ficha ambiental exige servicio cerrado y evidencia; conserva revisión y declaraciones manuales",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const compliance=await import("../lib/compliance");
  const audit=await import("../lib/audit-report");
  for(const name of ["001_piloto.sql","002_flota_y_despacho.sql","003_abastecimiento.sql","004_mantenimiento_combustible.sql","005_contenedores.sql","006_acreditacion.sql","007_finanzas.sql","008_trazabilidad_ambiental.sql","009_certificados.sql"]){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [admin]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('admin@demo.cl','Admin','hash','admin') RETURNING id");
  const [ops]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('ops@demo.cl','Operaciones','hash','operaciones') RETURNING id");
  const [client]=await db.query<{id:string}>("INSERT INTO clients (name) VALUES ('Cliente prueba') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites (client_id,name) VALUES ($1,'Faena') RETURNING id",[client.id]);
  const owner:Actor={id:admin.id,name:"Admin",email:"admin@demo.cl",role:"admin",client_id:null};
  const manager:Actor={id:ops.id,name:"Operaciones",email:"ops@demo.cl",role:"operaciones",client_id:null};
  const customer:Actor={id:admin.id,name:"Cliente",email:"cliente@demo.cl",role:"cliente",client_id:client.id};
  const [service]=await db.query<{id:string}>(`INSERT INTO service_requests
    (submission_key,client_id,site_id,service_type,waste_type,origin,destination,status,gross_kg,tare_kg,created_by,closed_at)
    VALUES ($1,$2,$3,'retiro','Metal','Faena','Planta','completada',150,100,$4,now()) RETURNING id`,
    [randomUUID(),client.id,site.id,owner.id]);
  const data={service_id:service.id,category:"no_peligroso",classification:"Chatarra metálica",generator_name:"Cliente prueba",
    transporter_name:"RERCHAR",receiver_name:"Receptor autorizado",treatment:"Reciclaje informado",guide_number:"G-100"};
  await assert.rejects(()=>compliance.saveWasteRecord(customer,data),compliance.ComplianceError);
  const id=await compliance.saveWasteRecord(manager,data);
  await assert.rejects(()=>compliance.reviewWasteRecord(owner,id),compliance.ComplianceError);
  await db.query(`INSERT INTO service_evidence (service_id,description,storage_key,created_by)
    VALUES ($1,'Guía fotografiada','private-demo-photo.jpg',$2)`,[service.id,owner.id]);
  await assert.rejects(()=>compliance.reviewWasteRecord(manager,id),compliance.ComplianceError);
  await compliance.reviewWasteRecord(owner,id);
  await assert.rejects(()=>compliance.saveWasteRecord(manager,data),compliance.ComplianceError);
  await compliance.recordExternalDeclaration(owner,id,{external_reference:"SIN-100",reported_on:"2026-09-24"});
  let {record,events}=await compliance.getWasteRecord(owner,id);
  assert.equal(record.external_system,"SINADER");
  assert.equal(record.quantity_kg,"50.00");
  assert.equal(events.length,3);
  await compliance.observeWasteRecord(owner,id,"Se corrigió clasificación tras revisión");
  ({record,events}=await compliance.getWasteRecord(owner,id));
  assert.equal(record.external_reference,null);
  assert.equal(events[0].action,"observar");
  await compliance.saveWasteRecord(manager,{...data,category:"peligroso",classification:"Clasificación de prueba"});
  await compliance.reviewWasteRecord(owner,id);
  await compliance.recordExternalDeclaration(owner,id,{external_reference:"SID-100",reported_on:"2026-09-24"});
  ({record,events}=await compliance.getWasteRecord(owner,id));
  assert.equal(record.external_system,"SIDREP");
  assert.equal(events.length,7);
  assert.equal((await compliance.listWasteRecords(owner,client.id)).length,1);
  assert.equal((await compliance.listWasteRecords(owner)).length,1);
  await assert.rejects(()=>compliance.listWasteRecords(customer),compliance.ComplianceError);
  const auditRows=await audit.auditReport(owner,audit.auditFilter({}),100);
  assert.equal(auditRows.filter(row=>row.entity_type==="waste_record").length,7);
  await assert.rejects(()=>audit.auditReport(customer,audit.auditFilter({})),/administración/);
});
