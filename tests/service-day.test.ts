import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("parte diario conserva incompletos, resuelve alerta y sigue guía sin confundir cierre",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const pilot=await import("../lib/pilot");
  const day=await import("../lib/service-day");
  const ledger=await import("../lib/service-ledger");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [operator,driver]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role)
    VALUES('parte@demo.cl','Operaciones','h','operaciones'),('chofer@demo.cl','Conductora','h','conductor') RETURNING id`);
  const actor:Actor={id:operator.id,name:"Operaciones",email:"parte@demo.cl",role:"operaciones",client_id:null};
  const outsider:Actor={id:driver.id,name:"Conductora",email:"chofer@demo.cl",role:"conductor",client_id:null};
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente de prueba') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const truck=await pilot.createAsset(actor,{code:"CAM-PARTE",label:"Camión prueba",kind:"camion",plate:"TEST-99"});
  const service=await pilot.createService(actor,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,
    operating_company:"rerchar",service_type:"traslado",waste_type:"Correas",estimated_kg:"",origin:"Faena",destination:"Patio",priority:"normal",notes:""});
  await pilot.assignService(actor,service,{asset_id:truck,driver_id:driver.id,scheduled_for:"2026-10-12T09:00"});
  await assert.rejects(()=>day.reportServiceDay(outsider,service,{day:"2026-10-12",outcome:"incompleto",observation:"Sin guía"}),day.ServiceDayError);
  await assert.rejects(()=>day.reportServiceDay(actor,service,{day:"2026-10-11",outcome:"incompleto",observation:"Sin guía"}),/anterior/);
  await assert.rejects(()=>day.reportServiceDay(actor,service,{day:"2026-10-12",outcome:"incompleto",observation:""}),/Explique/);
  await day.reportServiceDay(actor,service,{day:"2026-10-12",outcome:"incompleto",observation:"No entregaron la guía en faena"});
  assert.equal((await pilot.getService(actor,service)).status,"programada","el parte no cierra la solicitud");
  assert.equal((await day.listOpenDayAlerts(actor,"rerchar"))[0].outcome,"incompleto");
  assert.equal((await day.listOpenDayAlerts(actor,"e_y_j")).length,0);
  await day.reportServiceDay(actor,service,{day:"2026-10-12",outcome:"suspendido",observation:"Retiro suspendido en faena"});
  assert.equal((await day.listServiceDays(outsider,service))[0].outcome,"suspendido");
  await day.reportServiceDay(actor,service,{day:"2026-10-13",outcome:"completado",observation:"Carga entregada"});
  assert.equal((await day.listOpenDayAlerts(actor)).length,0);
  assert.equal((await day.listWeekResults(actor,"2026-10-12","2026-10-19")).length,2);
  assert.equal((await db.query("SELECT id FROM audit_events WHERE action='day_result' AND entity_id=$1",[service])).length,3);
  await assert.rejects(()=>ledger.saveGuideFollowup(actor,service,{dispatch_guide_status:"enviada",requested_on:"2026-10-13",received_on:"2026-10-15",documents_sent_on:"2026-10-14",notes:""}),/anteceder/);
  await ledger.saveGuideFollowup(actor,service,{dispatch_guide_status:"enviada",requested_on:"2026-10-13",received_on:"2026-10-15",documents_sent_on:"2026-10-16",notes:"Documentos completos"});
  const followup=(await ledger.listGuideFollowups(actor,"rerchar"))[0];
  assert.equal(followup.dispatch_guide_status,"enviada");
  assert.equal(new Date(followup.service_day).toISOString().slice(0,10),"2026-10-13");
  assert.equal((await ledger.getServiceLedger(actor,service)).followup?.dispatch_guide_status,"enviada");
});
