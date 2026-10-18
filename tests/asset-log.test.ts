import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir,readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import type { Actor } from "../lib/auth";

test("ficha de camión y rampla vincula rutas, averías, mantenciones e inventario sin alterar lecturas históricas",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const pilot=await import("../lib/pilot");
  const continuity=await import("../lib/continuity");
  const log=await import("../lib/asset-log");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(file=>/^\d+.*\.sql$/.test(file)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(v=>v.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [admin,driver]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role)
    VALUES ('jorge-test@rerchar.cl','Jorge','hash','admin'),('chofer-jorge@rerchar.cl','Chofer','hash','conductor') RETURNING id`);
  const actor:Actor={id:admin.id,name:"Jorge",email:"jorge-test@rerchar.cl",role:"admin",client_id:null};
  const outsider:Actor={id:driver.id,name:"Chofer",email:"chofer-jorge@rerchar.cl",role:"conductor",client_id:null};
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente prueba de flota') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const truck=await pilot.createAsset(actor,{code:"CAM-10",label:"Camión 10",kind:"camion",plate:"LJHZ-10"});
  const ramp=await pilot.createAsset(actor,{code:"RAM-R3",label:"Rampla R3",kind:"rampa",plate:"KYLR-19"});
  await continuity.recordAssetReading(actor,truck,{reading:310000,note:"Odómetro actual confirmado"});
  const service=await pilot.createService(actor,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,
    operating_company:"rerchar",service_type:"traslado",waste_type:"Material",estimated_kg:"",origin:"Puerto Seco",
    destination:"Faena",priority:"normal",notes:""});
  await pilot.assignService(actor,service,{asset_id:truck,ramp_asset_id:ramp,driver_id:driver.id,scheduled_for:"2026-10-20T09:00"});
  const [guide]=await db.query<{id:string}>(`INSERT INTO material_guides
    (submission_key,guide_number,movement_on,movement_type,counterparty_id,origin,destination,truck_plate,trailer_plate,created_by)
    VALUES ($1,'G-FLOTA-1','2026-10-11','venta',$2,'Puerto Seco','Fundición','LJHZ-10','KYLR-19',$3) RETURNING id`,
    [randomUUID(),client.id,actor.id]);
  await assert.rejects(()=>log.getAssetLog(outsider,truck),log.AssetLogError);
  let truckLog=await log.getAssetLog(actor,truck);
  assert.deepEqual(truckLog.routes.map(route=>route.href).sort(),[`/control-guias/${guide.id}`,`/solicitudes/${service}`].sort());
  assert.equal((await log.getAssetLog(actor,ramp)).routes.length,2,"la rampla participa del mismo recorrido y guía");

  const gear=await log.addAssetEquipment(actor,{asset_id:truck,name:"Extintor",quantity:1,condition:"por_revisar",expires_on:"2026-11-01",note:"Inspección pendiente"});
  await assert.rejects(()=>log.addAssetEquipment(actor,{asset_id:truck,name:"extintor",quantity:1,condition:"operativo",expires_on:"",note:""}),log.AssetLogError);
  truckLog=await log.getAssetLog(actor,truck);
  assert.equal(truckLog.equipment[0].warning,true);
  assert.equal(Number((await pilot.listFleet(actor)).assets.find(asset=>asset.id===truck)?.equipment_alerts),1);
  await log.updateAssetEquipment(actor,gear,{quantity:2,condition:"operativo",expires_on:"",note:"Inspección al día"});
  assert.equal((await log.getAssetLog(actor,truck)).equipment[0].warning,false);
  await log.removeAssetEquipment(actor,gear);
  assert.equal((await log.getAssetLog(actor,truck)).equipment.length,0);

  const fault=await pilot.reportFleetIncident(actor,{asset_id:truck,description:"Fuga del depósito de refrigerante",severity:"alta",observed_on:"2026-10-10"});
  assert.equal(new Date((await log.getAssetLog(actor,truck)).faults[0].observed_on!).toISOString().slice(0,10),"2026-10-10");
  assert.equal((await pilot.listFleet(actor)).assets.find(asset=>asset.id===truck)?.available,false);
  await pilot.resolveFleetIncident(actor,fault,"Depósito reparado y sin filtración");
  assert.equal((await log.getAssetLog(actor,truck)).faults[0].status,"resuelta");

  await assert.rejects(()=>log.recordAssetMaintenance(actor,{asset_id:truck,performed_on:"2099-01-01",kind:"preventiva",
    title:"Trabajo del futuro",description:"",reading:"",}),log.AssetLogError);
  const historical=await log.recordAssetMaintenance(actor,{asset_id:truck,performed_on:"2025-06-26",kind:"preventiva",
    title:"Mantención general",description:"Trabajo anotado en planilla del camión 10",reading:269851});
  const order=(await continuity.getWorkOrder(actor,historical)).order;
  assert.equal(order.status,"cerrada");
  assert.equal(order.history_only,true);
  assert.equal(new Date(order.performed_on!).toISOString().slice(0,10),"2025-06-26");
  assert.equal(order.reading_at_close,"269851.00");
  assert.equal((await continuity.listAssets(actor)).find(asset=>asset.id===truck)?.current_reading,"310000.00");
  assert.equal((await log.getAssetLog(actor,truck)).orders[0].id,historical);

  const firstPdf=new File([Buffer.from("%PDF-1.4\n%test\n")],"Permiso circulación.pdf",{type:"application/pdf"});
  const docId=await log.addAssetDocument(actor,truck,firstPdf);
  await log.addAssetDocument(actor,truck,new File([Buffer.from("%PDF-1.4\n%soap\n")],"SOAP.pdf",{type:"application/pdf"}));
  const docs=(await log.getAssetLog(actor,truck)).documents;
  assert.equal(docs.length,2,"el camión admite varios documentos con nombres propios");
  assert.equal((await log.getAssetDocument(actor,docId))?.filename,"Permiso circulación.pdf");
  await assert.rejects(()=>log.getAssetDocument(outsider,docId),log.AssetLogError);
  await assert.rejects(()=>log.addAssetDocument(actor,truck,new File(["No es PDF"],"falso.pdf",{type:"application/pdf"})),log.AssetLogError);
});
