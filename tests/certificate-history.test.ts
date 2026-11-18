import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("certificados conserva todo el historial, permisos y borradores anteriores a los límites visibles",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),certificates=await import("../lib/certificates");
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(`db/${name}`,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente A de prueba'),('Cliente B de prueba') RETURNING id");
  const [site,otherSite]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena A'),($2,'Faena B') RETURNING id",[client.id,other.id]);
  const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('certificados@example.invalid','Admin','h','admin') RETURNING id");
  const actor:Actor={id:user.id,email:"certificados@example.invalid",name:"Admin",role:"admin",client_id:null};
  const viewer:Actor={...actor,role:"cliente",client_id:client.id},outsider:Actor={...viewer,client_id:other.id};
  const services=await db.query<{id:string;client_id:string;deleted_at:Date|null}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,gross_kg,tare_kg,closed_at,created_by,deleted_at)
    SELECT gen_random_uuid(),CASE WHEN n<=402 THEN $1::uuid ELSE $2::uuid END,CASE WHEN n<=402 THEN $3::uuid ELSE $4::uuid END,
      'rerchar','retiro','Material de prueba','Origen','Destino','completada',150,100,'2026-11-01',$5,CASE WHEN n=402 THEN now() ELSE NULL END
    FROM generate_series(1,427) n RETURNING id,client_id,deleted_at`,[client.id,other.id,site.id,otherSite.id,user.id]);
  const snapshot={folio:"RER-PRUEBA",client_name:"Cliente de prueba",site_name:"Faena de prueba",service_type:"retiro",waste_type:"Material de prueba",
    document_type:"servicio",category:"no_peligroso",classification:"Material limpio",quantity_kg:"50.00",guide_number:"G-PRUEBA",generator_name:"Generador de prueba",transporter_name:"RERCHAR",receiver_name:"Receptor de prueba",treatment:"Reciclaje",closed_at:"2026-11-01T00:00:00.000Z"};
  const issued=await db.query<{id:string;service_id:string;status:string}>(`INSERT INTO service_certificates(service_id,version,code,snapshot,issued_by,issued_at,status,revoked_by,revoked_at,revocation_reason)
    SELECT id,1,lpad(row_number() OVER (ORDER BY id)::text,48,'0'),$2::jsonb,$1,'2026-11-02',
      CASE WHEN client_id=$3 AND (row_number() OVER (ORDER BY id))%4=0 THEN 'revocado' ELSE 'vigente' END,
      CASE WHEN client_id=$3 AND (row_number() OVER (ORDER BY id))%4=0 THEN $1::uuid ELSE NULL END,
      CASE WHEN client_id=$3 AND (row_number() OVER (ORDER BY id))%4=0 THEN now() ELSE NULL END,
      CASE WHEN client_id=$3 AND (row_number() OVER (ORDER BY id))%4=0 THEN 'Corrección de prueba' ELSE NULL END
    FROM service_requests RETURNING id,service_id,status`,[user.id,JSON.stringify(snapshot),client.id]);
  const visible=issued.filter(x=>!services.find(s=>s.id===x.service_id)!.deleted_at);
  assert.equal((await certificates.listCertificates(actor,100,0)).length,100,"el historial debe respetar la ventana solicitada");
  const all=[];
  for(let offset=0;offset<visible.length;offset+=100)all.push(...await certificates.listCertificates(actor,100,offset));
  assert.equal(all.length,426);assert.equal(new Set(all.map(x=>x.id)).size,426,"las fechas empatadas no repiten ni omiten versiones entre páginas");
  assert.equal(await certificates.certificateHistoryCount(actor),426);
  const expectedClient=visible.filter(x=>x.status==="vigente"&&services.find(s=>s.id===x.service_id)!.client_id===client.id);
  assert.equal(await certificates.certificateHistoryCount(viewer),expectedClient.length);
  assert.equal((await certificates.listCertificates(viewer,500)).length,expectedClient.length);
  assert.ok((await certificates.listCertificates(viewer,500)).every(x=>x.client_id===client.id&&x.status==="vigente"));
  assert.equal(await certificates.certificateHistoryCount(outsider),25);
  await assert.rejects(()=>certificates.certificateHistoryCount({...actor,role:"conductor"}),certificates.CertificateError);
  const pending=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,gross_kg,tare_kg,closed_at,created_by)
    SELECT gen_random_uuid(),$1,$2,'rerchar','retiro','Material pendiente','Origen','Destino','completada',150,100,'2026-11-03',$3 FROM generate_series(1,115) RETURNING id`,[client.id,site.id,user.id]);
  const ids=pending.map(s=>s.id);
  await db.query(`INSERT INTO waste_records(service_id,category,classification,generator_name,transporter_name,receiver_name,treatment,guide_number,quantity_kg,status,reviewed_by,reviewed_at,created_by)
    SELECT id,'no_peligroso','Limpio','Generador','RERCHAR','Receptor','Reciclaje','G-PENDIENTE',50,'revisado',$2,now(),$2 FROM service_requests WHERE id=ANY($1::uuid[])`,[ids,user.id]);
  await db.query(`INSERT INTO service_evidence(service_id,description,storage_key,created_by) SELECT id,'Evidencia de prueba','fixture.pdf',$2 FROM service_requests WHERE id=ANY($1::uuid[])`,[ids,user.id]);
  await db.query(`INSERT INTO service_certificate_drafts(service_id,snapshot,prepared_by,prepared_at) SELECT id,$2::jsonb,$3,'2026-11-04' FROM service_requests WHERE id=ANY($1::uuid[])`,[ids,JSON.stringify(snapshot),user.id]);
  const prepared=await certificates.listCertificatePreparation(actor),drafts=await certificates.listCertificateDrafts(actor);
  assert.equal(prepared.filter(x=>ids.includes(x.id)).length,115,"los servicios antiguos siguen disponibles aunque haya más de cien pendientes");
  assert.ok(prepared.filter(x=>ids.includes(x.id)).every(x=>x.ready));
  assert.equal(drafts.length,115,"los borradores no desaparecen al superar cien");
  assert.ok(drafts.every(d=>prepared.some(s=>s.id===d.service_id&&s.ready)),"cada borrador conserva su preparación para poder emitirlo");
});
