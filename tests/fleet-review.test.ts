import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("flota recorre todas las averías, prioriza criticidad y vincula sólo órdenes activas",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const pilot=await import("../lib/pilot");
  const maintenance=await import("../lib/continuity");
  for(const name of (await readdir(resolve("db"))).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    const sql=await readFile(resolve("db",name),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('fleet-review@example.test','Revisión flota','hash','admin') RETURNING id");
  const actor:Actor={id:user.id,name:"Revisión flota",email:"fleet-review@example.test",role:"admin",client_id:null};
  const truck=await pilot.createAsset(actor,{code:"REV-1",label:"Camión revisión",kind:"camion",plate:"REV100"});
  const workshop=await pilot.createAsset(actor,{code:"REV-2",label:"Camión en taller sin avería",kind:"camion",plate:"REV200"});
  const archived=await pilot.createAsset(actor,{code:"REV-3",label:"Activo archivado",kind:"camion",plate:"REV300"});
  await db.query("UPDATE assets SET available=false WHERE id=$1",[truck]);
  const rows=await db.query<{id:string;description:string}>(`INSERT INTO fleet_incidents(asset_id,description,severity,reported_by,reported_at)
    SELECT $1,'Falla de revisión '||n,CASE WHEN n=123 THEN 'critica' WHEN n=122 THEN 'alta' ELSE 'baja' END,$2,now()-n*interval '1 day'
    FROM generate_series(1,123) n RETURNING id,description`,[truck,actor.id]);
  await pilot.reportFleetIncident(actor,{asset_id:archived,description:"Falla de activo archivado",severity:"critica"});
  await db.query("UPDATE assets SET deleted_at=now() WHERE id=$1",[archived]);
  const incident=rows.find(row=>row.description==="Falla de revisión 123")!;
  const input={asset_id:truck,incident_id:incident.id,plan_id:"",kind:"correctiva",title:"Reparación crítica",description:"",scheduled_for:"",blocks_asset:true};
  const canceled=await maintenance.createWorkOrder(actor,input);
  await maintenance.cancelWorkOrder(actor,canceled,"Anulación antes de comenzar");
  const active=await maintenance.createWorkOrder(actor,input);
  await maintenance.startWorkOrder(actor,active);
  const independent=await maintenance.createWorkOrder(actor,{...input,asset_id:workshop,incident_id:"",title:"Trabajo manual bloqueante"});
  await maintenance.startWorkOrder(actor,independent);
  await assert.rejects(()=>pilot.listFleet({...actor,role:"conductor"}),pilot.PilotError);
  await assert.rejects(()=>pilot.listFleet({...actor,role:"cliente"}),pilot.PilotError);
  const pages=await Promise.all([1,2,3].map(page=>pilot.listFleet(actor,page)));
  assert.deepEqual(pages.map(page=>page.incidents.length),[50,50,23]);
  assert.ok(pages.every(page=>page.totalIncidents===123&&page.totalPages===3));
  assert.equal(new Set(pages.flatMap(page=>page.incidents.map(row=>row.id))).size,123);
  const first=pages[0];
  assert.deepEqual(first.incidents.slice(0,2).map(row=>row.severity),["critica","alta"]);
  assert.equal(first.incidents[0].id,incident.id);
  assert.equal(first.incidents[0].order_id,active);
  assert.equal(first.incidents[0].order_status,"en_trabajo");
  assert.ok(first.incidents.slice(1).every(row=>row.order_id===null));
  assert.ok(!first.assets.some(asset=>asset.id===archived));
  const stopped=first.assets.find(asset=>asset.id===workshop)!;
  assert.equal(stopped.available,false);
  assert.equal(stopped.open_incidents,"0");
  assert.equal(stopped.blocking_orders,"1");
  assert.equal((await pilot.listFleet(actor,999999)).page,3);
  assert.equal((await pilot.listFleet(actor,-1)).page,1);
  assert.equal((await pilot.listFleet(actor,NaN)).page,1);
  await assert.rejects(()=>pilot.resolveFleetIncident(actor,incident.id,"Intento de resolver con orden activa"),pilot.PilotError);
});
