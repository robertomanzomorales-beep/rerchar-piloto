import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import {PDFDocument} from "pdf-lib";
import type {Actor} from "../lib/auth";

test("certificado PDF/QR conserva versión, permisos y revocación de ficha observada",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  process.env.APP_BASE_URL="http://localhost:3000";
  const {db,transaction}=await import("../lib/db");
  const certificates=await import("../lib/certificates");
  const compliance=await import("../lib/compliance");
  const {renderCertificatePdf}=await import("../lib/certificate-pdf");
  for(const name of ["001_piloto.sql","002_flota_y_despacho.sql","003_abastecimiento.sql","004_mantenimiento_combustible.sql","005_contenedores.sql","006_acreditacion.sql","007_finanzas.sql","008_trazabilidad_ambiental.sql","009_certificados.sql","010_evidencia_persistente.sql","011_operacion_real_2026.sql"]){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients (name) VALUES ('Cliente del certificado'),('Otra empresa') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites (client_id,name) VALUES ($1,'Planta Norte') RETURNING id",[client.id]);
  const [admin,ops]=await db.query<{id:string}>(`INSERT INTO users (email,name,password_hash,role)
    VALUES ('admin@demo.cl','Admin','hash','admin'),('ops@demo.cl','Operaciones','hash','operaciones') RETURNING id`);
  const [customer,otherCustomer]=await db.query<{id:string}>(`INSERT INTO users (email,name,password_hash,role,client_id)
    VALUES ('cliente@demo.cl','Cliente','hash','cliente',$1),('otro@demo.cl','Otro','hash','cliente',$2) RETURNING id`,[client.id,other.id]);
  const owner:Actor={id:admin.id,name:"Admin",email:"admin@demo.cl",role:"admin",client_id:null};
  const operator:Actor={id:ops.id,name:"Operaciones",email:"ops@demo.cl",role:"operaciones",client_id:null};
  const clientActor:Actor={id:customer.id,name:"Cliente",email:"cliente@demo.cl",role:"cliente",client_id:client.id};
  const outsider:Actor={id:otherCustomer.id,name:"Otro",email:"otro@demo.cl",role:"cliente",client_id:other.id};
  const [service]=await db.query<{id:string}>(`INSERT INTO service_requests
    (submission_key,client_id,site_id,service_type,waste_type,origin,destination,status,gross_kg,tare_kg,created_by,closed_at)
    VALUES ($1,$2,$3,'retiro','Metal','Planta','Receptor','completada',150,100,$4,now()) RETURNING id`,
    [randomUUID(),client.id,site.id,owner.id]);
  await db.query(`INSERT INTO service_evidence (service_id,description,storage_key,created_by)
    VALUES ($1,'Guía de prueba','ficha-demo.jpg',$2)`,[service.id,owner.id]);
  let preparation=await certificates.listCertificatePreparation(owner);
  assert.equal(preparation.length,1);
  assert.equal(preparation[0].ready,false);
  assert.match(preparation[0].reason??"",/Falta preparar la ficha/);
  assert.equal(preparation[0].nextHref,`/cumplimiento?service_id=${service.id}`);
  await assert.rejects(()=>certificates.listCertificatePreparation(clientActor),certificates.CertificateError);
  await assert.rejects(()=>certificates.issueCertificate(owner,service.id),certificates.CertificateError);
  const waste=await compliance.saveWasteRecord(operator,{service_id:service.id,category:"no_peligroso",classification:"Metal limpio",
    generator_name:"Empresa cliente",transporter_name:"RERCHAR",receiver_name:"Receptor de prueba",
    treatment:"Reciclaje",guide_number:"GUIA-01"});
  preparation=await certificates.listCertificatePreparation(owner);
  assert.equal(preparation[0].ready,false);
  assert.match(preparation[0].reason??"",/borrador/);
  assert.equal(preparation[0].nextHref,`/cumplimiento/${waste}`);
  await compliance.reviewWasteRecord(owner,waste);
  preparation=await certificates.listCertificatePreparation(owner);
  assert.equal(preparation[0].ready,true);
  assert.equal(preparation[0].reason,null);
  await assert.rejects(()=>certificates.issueCertificate(operator,service.id),certificates.CertificateError);
  const first=await certificates.issueCertificate(owner,service.id);
  assert.equal((await certificates.listCertificatePreparation(owner)).length,0);
  assert.equal(await certificates.issueCertificate(owner,service.id),first);
  let row=await certificates.getCertificate(owner,first);
  assert.equal(row.version,1);
  assert.equal(row.snapshot.quantity_kg,"50.00");
  assert.match(row.code,/^[0-9a-f]{48}$/);
  assert.equal((await certificates.publicVerification(row.code))?.status,"vigente");
  assert.deepEqual(Object.keys((await certificates.publicVerification(row.code))!).sort(),["issued_at","revoked_at","status","version"]);
  assert.equal(await certificates.publicVerification("incorrecto"),null);
  assert.equal((await certificates.listCertificates(clientActor)).length,1);
  assert.equal((await certificates.listCertificates(outsider)).length,0);
  await assert.rejects(()=>certificates.getCertificate(outsider,first),certificates.CertificateError);
  const bytes=await renderCertificatePdf(row,certificates.verificationUrl(row.code));
  assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
  assert.ok(bytes.length>7000);
  await certificates.recordDownload(clientActor,row.id);
  assert.equal((await certificates.getCertificate(owner,row.id)).downloads,"1");
  await compliance.observeWasteRecord(owner,waste,"Se debe corregir la clasificación");
  assert.equal((await certificates.publicVerification(row.code))?.status,"revocado");
  assert.equal((await certificates.listCertificates(clientActor)).length,0);
  await assert.rejects(()=>certificates.getCertificate(clientActor,first),certificates.CertificateError);
  await compliance.saveWasteRecord(operator,{service_id:service.id,category:"peligroso",classification:"Clasificación de prueba",
    generator_name:"Empresa cliente",transporter_name:"RERCHAR",receiver_name:"Receptor de prueba",
    treatment:"Destino documentado",guide_number:"GUIA-01"});
  await compliance.reviewWasteRecord(owner,waste);
  const second=await certificates.issueCertificate(owner,service.id);
  row=await certificates.getCertificate(owner,second);
  assert.equal(row.version,2);
  await assert.rejects(()=>certificates.revokeCertificate(operator,second,"Motivo de prueba"),certificates.CertificateError);
  await certificates.revokeCertificate(owner,second,"Error en emisión");
  assert.equal((await certificates.publicVerification(row.code))?.status,"revocado");
  await assert.rejects(()=>certificates.revokeCertificate(owner,second,"Doble intento"),certificates.CertificateError);
});
