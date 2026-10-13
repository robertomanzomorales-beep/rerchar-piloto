import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("transportista tercero se acredita y opera por medio de operaciones, sin cuenta",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  process.env.EVIDENCE_STORAGE="database";
  const {db,transaction}=await import("../lib/db");
  const pilot=await import("../lib/pilot");
  const personnel=await import("../lib/personnel");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients (name) VALUES ('Cliente externo') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites (client_id,name) VALUES ($1,'Faena externa') RETURNING id",[client.id]);
  const [admin]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('admin@demo.cl','Admin','hash','admin') RETURNING id");
  const [operator]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('ops@demo.cl','Operaciones','hash','operaciones') RETURNING id");
  const [internal]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('driver@demo.cl','Conductor interno','hash','conductor') RETURNING id");
  const owner:Actor={id:admin.id,name:"Admin",email:"admin@demo.cl",role:"admin",client_id:null};
  const ops:Actor={id:operator.id,name:"Operaciones",email:"ops@demo.cl",role:"operaciones",client_id:null};
  const other:Actor={id:internal.id,name:"Conductor interno",email:"driver@demo.cl",role:"conductor",client_id:null};
  const driverId=await personnel.createExternalDriver(ops,{name:"Ana Conductora",tax_id:"12.345.678-5",company_name:"Transportes Norte",phone:"+56912345678"});
  assert.equal((await personnel.listExternalDrivers(ops))[0].tax_id,"12345678-5");
  assert.equal((await db.query("SELECT id FROM users WHERE id=$1",[driverId])).length,0,"el tercero no tiene cuenta");
  await assert.rejects(()=>personnel.createExternalDriver(other,{name:"Otro",tax_id:"11.111.111-1",company_name:"Transportes Norte"}),personnel.PersonnelError);
  const requirement=await personnel.createRequirement(owner,{client_id:client.id,site_id:site.id,name:"Licencia clase A5",kind:"licencia",warning_days:30});
  const truck=await pilot.createAsset(ops,{code:"CAM-EX1",label:"Camión Norte",kind:"camion",plate:"ABCD11"});
  const secondTruck=await pilot.createAsset(ops,{code:"CAM-EX2",label:"Camión de apoyo",kind:"camion",plate:"ABCD22"});
  const service=await pilot.createService(ops,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,operating_company:"rerchar",
    request_category:"compra",service_type:"compra",waste_type:"Chatarra",estimated_kg:"",origin:"Faena externa",destination:"Patio",priority:"normal",notes:""});
  const plan={asset_id:truck,external_driver_id:driverId,driver_id:"",scheduled_for:"2026-11-25T09:00"};
  await assert.rejects(()=>pilot.assignService(ops,service,{...plan,driver_id:internal.id}),pilot.PilotError,"solo un conductor");
  await assert.rejects(()=>pilot.assignService(ops,service,plan),/Licencia clase A5/);
  const credential=await personnel.recordExternalCredential(ops,{external_driver_id:driverId,requirement_id:requirement,
    reference:"Licencia-456",issued_on:"2026-01-01",expires_on:"2027-01-01"});
  await assert.rejects(()=>pilot.assignService(ops,service,plan),/Licencia clase A5/,"pendiente no habilita");
  await assert.rejects(()=>personnel.reviewExternalCredential(ops,credential,"verificada",""),personnel.PersonnelError);
  await personnel.reviewExternalCredential(owner,credential,"verificada","");
  await pilot.assignService(ops,service,plan);
  const selected=await pilot.getService(ops,service);
  assert.equal(selected.driver_id,null);
  assert.equal(selected.external_driver_id,driverId);
  assert.equal(selected.driver_name,"Ana Conductora");
  assert.equal(selected.external_driver_company,"Transportes Norte");
  assert.equal((await pilot.listAgenda(ops,"2026-11-25","2026-11-26"))[0].driver_name,"Ana Conductora");
  assert.equal((await pilot.reportServices(ops,pilot.normalizeReportFilters({})))[0].driver_name,"Ana Conductora");
  await assert.rejects(()=>pilot.getService(other,service),pilot.PilotError);
  const competing=await pilot.createService(ops,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,operating_company:"rerchar",
    request_category:"compra",service_type:"compra",waste_type:"Metal",estimated_kg:"",origin:"Faena externa",destination:"Patio",priority:"normal",notes:""});
  await assert.rejects(()=>pilot.assignService(ops,competing,{...plan,asset_id:secondTruck,scheduled_for:"2026-11-25T10:00"}),/otra asignación/);
  await pilot.saveChecklist(ops,service,{vehicle_ok:true,documents_ok:true,containment_ok:true,ppe_ok:true,comment:"Verificado por operaciones"});
  await db.query("UPDATE external_driver_credentials SET expires_on=(now() AT TIME ZONE 'America/Santiago')::date-1 WHERE id=$1",[credential]);
  await assert.rejects(()=>pilot.startService(ops,service),/Licencia clase A5/);
  const renewal=await personnel.recordExternalCredential(ops,{external_driver_id:driverId,requirement_id:requirement,
    reference:"Renovación",issued_on:"2026-10-01",expires_on:"2027-10-01"});
  await personnel.reviewExternalCredential(owner,renewal,"verificada","");
  await pilot.startService(ops,service);
  await assert.rejects(()=>pilot.handoffService(ops,service),/Guía de Traslado/);
  const jpg=()=>new File([new Uint8Array([0xff,0xd8,0xff,0xd9])],"respaldo.jpg",{type:"image/jpeg"});
  await pilot.addEvidence(ops,service,"Guía",jpg(),"guia_traslado");
  await pilot.addEvidence(ops,service,"Hoja",jpg(),"hoja_servicio");
  await pilot.handoffService(ops,service);
  assert.equal((await pilot.getService(owner,service)).status,"pendiente_revision");
  await pilot.finishService(owner,service,{gross_kg:100,tare_kg:20,guide_number:"G-EX"});
  assert.equal((await pilot.getService(owner,service)).status,"completada");
  const [audit]=await db.query<{name:string}>(`SELECT u.name FROM service_events e JOIN users u ON u.id=e.actor_id
    WHERE e.service_id=$1 AND e.kind='documentacion_entregada'`,[service]);
  assert.equal(audit.name,"Operaciones","queda registrado quién ingresó los documentos");
});
