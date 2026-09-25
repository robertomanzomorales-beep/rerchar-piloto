import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("despacho exige acreditación verificada y vigente para la faena configurada",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const pilot=await import("../lib/pilot");
  const personnel=await import("../lib/personnel");
  for(const name of ["001_piloto.sql","002_flota_y_despacho.sql","003_abastecimiento.sql","004_mantenimiento_combustible.sql","005_contenedores.sql","006_acreditacion.sql","007_finanzas.sql","008_trazabilidad_ambiental.sql","009_certificados.sql"]) {
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean)) await tx.query(part);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients (name) VALUES ('Cliente minero') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites (client_id,name) VALUES ($1,'Faena norte') RETURNING id",[client.id]);
  const [admin]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('admin@demo.cl','Admin','hash','admin') RETURNING id");
  const [operator]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('ops@demo.cl','Operador','hash','operaciones') RETURNING id");
  const [driver]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('driver@demo.cl','Conductor','hash','conductor') RETURNING id");
  const owner:Actor={id:admin.id,name:"Admin",email:"admin@demo.cl",role:"admin",client_id:null};
  const ops:Actor={id:operator.id,name:"Operador",email:"ops@demo.cl",role:"operaciones",client_id:null};
  const asset=await pilot.createAsset(owner,{code:"CAM-01",label:"Camión uno",kind:"camion",plate:""});
  const service=await pilot.createService(owner,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,
    service_type:"retiro",waste_type:"Chatarra",estimated_kg:"100",origin:"Faena norte",destination:"Patio",
    priority:"normal",notes:""});
  const req=await personnel.createRequirement(owner,{client_id:client.id,site_id:site.id,name:"Licencia clase A5",kind:"licencia",warning_days:30});
  const plan={asset_id:asset,driver_id:driver.id,scheduled_for:"2026-09-25T09:00",ramp_asset_id:"",guide_number:""};
  await assert.rejects(()=>pilot.assignService(owner,service,plan),pilot.PilotError);
  const credential=await personnel.recordCredential(ops,{user_id:driver.id,requirement_id:req,reference:"Licencia-123",issued_on:"2026-01-01",expires_on:"2027-01-01"});
  await assert.rejects(()=>pilot.assignService(owner,service,plan),pilot.PilotError,"el ingreso pendiente no habilita");
  await assert.rejects(()=>personnel.reviewCredential(ops,credential,"verificada",""),personnel.PersonnelError);
  await personnel.reviewCredential(owner,credential,"verificada","");
  await pilot.assignService(owner,service,plan);
  await pilot.saveChecklist(owner,service,{vehicle_ok:true,documents_ok:true,containment_ok:true,ppe_ok:true,comment:"Verificado"});
  await db.query("UPDATE worker_credentials SET expires_on=(now() AT TIME ZONE 'America/Santiago')::date-1 WHERE id=$1",[credential]);
  await assert.rejects(()=>pilot.startService(owner,service),pilot.PilotError,"una acreditación vencida después de programar bloquea la salida");
  const renewal=await personnel.recordCredential(owner,{user_id:driver.id,requirement_id:req,reference:"Licencia renovada",issued_on:"2026-09-24",expires_on:"2027-09-24"});
  await personnel.reviewCredential(owner,renewal,"verificada","");
  await pilot.startService(owner,service);
  assert.equal((await pilot.getService(owner,service)).status,"en_ruta");
  await personnel.reviewCredential(owner,renewal,"revocada","Antecedente observado");
  assert.ok((await personnel.findMissingRequirements(db,driver.id,client.id,site.id)).includes("Licencia clase A5"));
  const [audits]=await db.query<{total:string}>("SELECT count(*)::text AS total FROM audit_events WHERE entity_type='worker_credential'");
  assert.equal(Number(audits.total),5);
});
