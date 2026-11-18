import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("ficha ambiental y certificado distinguen un pesaje ausente de un neto cero registrado",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  process.env.APP_BASE_URL="http://localhost:3000";
  const {db,transaction}=await import("../lib/db");
  const compliance=await import("../lib/compliance");
  const certificates=await import("../lib/certificates");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(resolve(process.cwd(),"db",name),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('weighing@example.invalid','Administración','h','admin') RETURNING id");
  const actor:Actor={id:user.id,name:"Administración",email:"weighing@example.invalid",role:"admin",client_id:null};
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente pesaje de prueba') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Patio de prueba') RETURNING id",[client.id]);
  const fields={category:"no_peligroso",classification:"Metal limpio",generator_name:"Cliente de prueba",
    transporter_name:"RERCHAR",receiver_name:"Receptor de prueba",treatment:"Reciclaje",guide_number:"G-PESO"};
  async function service(gross:number|null,tare:number|null){
    const [row]=await db.query<{id:string}>(`INSERT INTO service_requests
      (submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,
       status,gross_kg,tare_kg,created_by,closed_at)
      VALUES($1,$2,$3,'rerchar','retiro','Metal','Faena','Planta','completada',$4,$5,$6,now()) RETURNING id`,
      [randomUUID(),client.id,site.id,gross,tare,user.id]);
    await db.query("INSERT INTO service_evidence(service_id,description,storage_key,created_by) VALUES($1,'Guía de prueba','private-proof.jpg',$2)",[row.id,user.id]);
    return row.id;
  }
  const missing=[[null,null],[150,null],[null,0]] as const;
  await t.test("no crea una ficha cuando falta bruto o tara",async()=>{
    for(const [gross,tare] of missing){
      const id=await service(gross,tare);
      await assert.rejects(()=>compliance.saveWasteRecord(actor,{...fields,service_id:id}),compliance.ComplianceError);
      assert.equal((await db.query("SELECT id FROM waste_records WHERE service_id=$1",[id])).length,0);
    }
  });
  await t.test("no prepara un certificado desde una ficha histórica con pesos incompletos",async()=>{
    for(const [gross,tare] of missing){
      const id=await service(gross,tare);
      await db.query(`INSERT INTO waste_records
        (service_id,category,classification,generator_name,transporter_name,receiver_name,treatment,
         guide_number,quantity_kg,status,created_by,reviewed_by,reviewed_at)
        VALUES($1,'no_peligroso','Metal limpio','Cliente','RERCHAR','Receptor','Reciclaje','G-PESO',$2,'revisado',$3,$3,now())`,
        [id,Number(gross)-Number(tare),user.id]);
      assert.equal((await certificates.listCertificatePreparation(actor)).find(row=>row.id===id)?.ready,false);
      await assert.rejects(()=>certificates.saveCertificateDraft(actor,id),certificates.CertificateError);
      assert.equal((await db.query("SELECT service_id FROM service_certificate_drafts WHERE service_id=$1",[id])).length,0);
    }
  });
  await t.test("no revisa una ficha histórica con pesaje incompleto o desactualizado",async()=>{
    for(const [gross,tare,quantity] of [[null,null,0],[150,null,150],[null,0,0],[150,100,49]] as const){
      const id=await service(gross,tare);
      const [record]=await db.query<{id:string}>(`INSERT INTO waste_records
        (service_id,category,classification,generator_name,transporter_name,receiver_name,treatment,
         guide_number,quantity_kg,created_by)
        VALUES($1,'no_peligroso','Metal limpio','Cliente','RERCHAR','Receptor','Reciclaje','G-PESO',$2,$3) RETURNING id`,
        [id,quantity,user.id]);
      await assert.rejects(()=>compliance.reviewWasteRecord(actor,record.id),compliance.ComplianceError);
      assert.equal((await compliance.getWasteRecord(actor,record.id)).record.status,"borrador");
    }
  });
  await t.test("conserva un neto cero cuando bruto y tara están ingresados",async()=>{
    const id=await service(150,150);
    const record=await compliance.saveWasteRecord(actor,{...fields,service_id:id});
    assert.equal((await compliance.getWasteRecord(actor,record)).record.quantity_kg,"0.00");
    await compliance.reviewWasteRecord(actor,record);
    assert.equal((await certificates.listCertificatePreparation(actor)).find(row=>row.id===id)?.ready,true);
    await certificates.saveCertificateDraft(actor,id);
    assert.equal((await certificates.listCertificateDrafts(actor)).find(row=>row.service_id===id)?.snapshot.quantity_kg,"0.00");
  });
  await t.test("bloquea la emisión si se pierde el pesaje después de preparar el borrador",async()=>{
    const id=await service(150,150);
    const record=await compliance.saveWasteRecord(actor,{...fields,service_id:id});
    await compliance.reviewWasteRecord(actor,record);
    await certificates.saveCertificateDraft(actor,id);
    await db.query("UPDATE service_requests SET gross_kg=NULL,tare_kg=NULL WHERE id=$1",[id]);
    await assert.rejects(()=>certificates.issueCertificate(actor,id,"EMITIR"),certificates.CertificateError);
    assert.equal((await db.query("SELECT id FROM service_certificates WHERE service_id=$1",[id])).length,0);
    assert.equal((await db.query("SELECT service_id FROM service_certificate_drafts WHERE service_id=$1",[id])).length,1);
  });
});
