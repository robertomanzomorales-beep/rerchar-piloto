import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import {randomUUID} from "node:crypto";
import type {Actor} from "../lib/auth";

const sourceId="172de6e6-9e7c-449f-937c-f7cb3682e342",targetId="20998d30-dcb6-4f60-a594-82c203d119de";
test("consolidación autorizada de HXHY-46 conserva historiales, archiva duplicado y evita nuevas patentes repetidas",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const pilot=await import("../lib/pilot"),maintenance=await import("../lib/continuity"),masters=await import("../lib/masters"),log=await import("../lib/asset-log");
  const apply=async(name:string)=>{const sql=await readFile(resolve("db",name),"utf8");await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});};
  for(const name of (await readdir(resolve("db"))).filter(n=>/^\d+.*\.sql$/.test(n)&&!n.startsWith("071_")).sort())await apply(name);
  const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('merge@example.test','Administrador revisión','hash','admin') RETURNING id");
  const actor:Actor={id:user.id,name:"Administrador revisión",email:"merge@example.test",role:"admin",client_id:null};
  await db.query(`INSERT INTO assets(id,code,label,kind,plate,reading_unit,brand) VALUES
    ($1,'RAM-01','Rampla','rampa','hxhy 46','km','Marca de origen'),($2,'RAM-001','LIBERATO','rampa','HXHY-46','km',NULL)`,[sourceId,targetId]);
  const client=await pilot.createClient(actor,{name:"Cliente consolidación",contact_name:"Encargado prueba"});
  const site=await pilot.createSite(actor,{client_id:client,name:"Patio",address:""});
  const service=await pilot.createService(actor,{submission_key:randomUUID(),client_id:client,site_id:site,operating_company:"rerchar",service_type:"traslado",waste_type:"Material",origin:"Faena",destination:"Patio",estimated_kg:"",priority:"normal",notes:"Conservar sin cambios"});
  await db.query("UPDATE service_requests SET ramp_asset_id=$2 WHERE id=$1",[service,sourceId]);
  await maintenance.recordAssetReading(actor,sourceId,{reading:10,note:"Lectura histórica de revisión"});
  const [legacyGuide]=await db.query<{id:string}>(`INSERT INTO material_guides(submission_key,guide_number,movement_on,movement_type,counterparty_id,origin,destination,trailer_plate,created_by)
    VALUES($1,'G-RAM-LEGACY','2026-11-17','venta',$2,'Origen','Destino','RAM-01',$3) RETURNING id`,[randomUUID(),client,actor.id]);
  const incident=await pilot.reportFleetIncident(actor,{asset_id:sourceId,description:"Falla histórica de prueba",severity:"alta"});
  const order=await maintenance.createWorkOrder(actor,{asset_id:sourceId,incident_id:incident,plan_id:"",kind:"correctiva",title:"Reparación de revisión",description:"",scheduled_for:"",blocks_asset:true});
  const fuel=await maintenance.registerFuel(actor,{submission_key:randomUUID(),asset_id:sourceId,driver_id:"",service_id:"",fuel_date:"2026-11-18",liters:5,cost_clp:5000,reading:20,full_tank:false,supplier:"Proveedor prueba",receipt_number:"F-MERGE-1",notes:"Conservar costo"});
  const plan=await maintenance.createMaintenancePlan(actor,{asset_id:sourceId,title:"Pauta por fecha",frequency_kind:"fecha",interval_days:"30",next_due_date:"2026-12-01",interval_reading:"",next_due_reading:"",lead_days:5,lead_reading:0});
  const tire=await maintenance.createTire(actor,{code:"NEU-MERGE",brand:"Marca prueba",size:"22.5"});
  await maintenance.moveTire(actor,tire,{action:"instalar",asset_id:sourceId,position:"1",reason:"Posición de prueba inicial"});
  await db.query("INSERT INTO fleet_day_notes(asset_id,day,kind,detail,updated_by) VALUES($1,'2026-11-18','nota','Nota origen',$3),($2,'2026-11-18','nota','Nota destino',$3)",[sourceId,targetId,actor.id]);
  const doc=await log.addAssetDocument(actor,sourceId,new File([Buffer.from("%PDF-1.4\n%documento prueba\n")],"Permiso.pdf",{type:"application/pdf"}));
  await log.addAssetEquipment(actor,{asset_id:sourceId,name:"Extintor",quantity:1,condition:"operativo",expires_on:"",note:"Equipo origen"});
  const migration="071_unificar_rampla_hxhy46.sql";
  await assert.rejects(()=>apply(migration),"un choque de claves aborta la consolidación completa");
  assert.equal((await db.query<{ramp_asset_id:string}>("SELECT ramp_asset_id FROM service_requests WHERE id=$1",[service]))[0].ramp_asset_id,sourceId);
  assert.equal((await db.query<{deleted_at:Date|null}>("SELECT deleted_at FROM assets WHERE id=$1",[sourceId]))[0].deleted_at,null);
  assert.equal((await db.query<{n:string}>("SELECT count(*)::text n FROM audit_events WHERE action='asset_consolidated'"))[0].n,"0");
  // El caso de choque pertenece sólo a la base aislada; ambos registros reales no se modifican aquí.
  await db.query("UPDATE fleet_day_notes SET day='2026-11-19' WHERE asset_id=$1",[targetId]);
  const [before]=await db.query("SELECT notes,created_at,updated_at,status FROM service_requests WHERE id=$1",[service]);
  await apply(migration);
  const [after]=await db.query("SELECT notes,created_at,updated_at,status FROM service_requests WHERE id=$1",[service]);assert.deepEqual(after,before);
  assert.equal((await db.query<{ramp_asset_id:string}>("SELECT ramp_asset_id FROM service_requests WHERE id=$1",[service]))[0].ramp_asset_id,targetId);
  const [archived]=await db.query<{deleted_at:Date|null;available:boolean}>("SELECT deleted_at,available FROM assets WHERE id=$1",[sourceId]);assert.ok(archived.deleted_at);assert.equal(archived.available,false);
  const [target]=await db.query<{brand:string;current_reading:string;available:boolean}>("SELECT brand,current_reading,available FROM assets WHERE id=$1",[targetId]);assert.equal(target.brand,"Marca de origen");assert.equal(Number(target.current_reading),20);assert.equal(target.available,false);
  const detail=await log.getAssetLog(actor,targetId);assert.ok(detail.routes.some(r=>r.id===service));assert.ok(detail.routes.some(r=>r.id===legacyGuide.id));assert.ok(detail.faults.some(r=>r.id===incident&&r.order_id===order));assert.ok(detail.plans.some(r=>r.id===plan));assert.equal(detail.documents[0].id,doc);assert.equal(detail.equipment.length,1);
  assert.equal((await maintenance.listMaintenance(actor)).tires.find(t=>t.id===tire)?.asset_id,targetId);
  assert.equal(await log.consolidatedAssetTarget(actor,sourceId),targetId);
  await assert.rejects(()=>log.consolidatedAssetTarget({...actor,role:"conductor"},sourceId),log.AssetLogError);
  const [audit]=await db.query<{previous_value:{references:Record<string,unknown[]>};next_value:{source_id:string}}>("SELECT previous_value,next_value FROM audit_events WHERE action='asset_consolidated'");assert.equal(audit.next_value.source_id,sourceId);assert.ok(audit.previous_value.references.service_requests.length);
  const fuelEntry=(await maintenance.listFuel(actor)).entries.find(entry=>entry.id===fuel)!;assert.equal(fuelEntry.asset_id,targetId);assert.equal(Number(fuelEntry.cost_clp),5000);
  const fks=await db.query<{table_name:string;column_name:string}>(`SELECT tc.table_name,kcu.column_name FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name AND kcu.constraint_schema=tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema
    WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='assets' AND tc.table_schema='public'`);
  assert.equal(fks.length,14,"se comprueban todas las referencias conocidas al activo");
  for(const ref of fks){assert.ok(/^[a-z_]+$/.test(ref.table_name)&&/^[a-z_]+$/.test(ref.column_name));const [count]=await db.query<{n:string}>(`SELECT count(*)::text n FROM "${ref.table_name}" WHERE "${ref.column_name}"=$1`,[sourceId]);assert.equal(count.n,"0",ref.table_name+"."+ref.column_name);}
  await apply(migration);assert.equal((await db.query<{n:string}>("SELECT count(*)::text n FROM audit_events WHERE action='asset_consolidated'"))[0].n,"1");
  await assert.rejects(()=>pilot.createAsset(actor,{code:"RAM-DUP",label:"Duplicado",kind:"rampa",plate:"HX HY46"}),pilot.PilotError);
  const other=await pilot.createAsset(actor,{code:"RAM-OTRA",label:"Otra",kind:"rampa",plate:"OTRA-10"});
  await assert.rejects(()=>masters.updateAsset(actor,other,{label:"No debe guardar",plate:"hxhy46"}),masters.MastersError);
  await assert.rejects(()=>db.query("INSERT INTO assets(code,label,kind,plate) VALUES('RAM-SQL','Duplicado directo','rampa','HXHY46')"));
  await masters.updateAsset(actor,targetId,{label:"LIBERATO",plate:"HXHY-46"});
});
