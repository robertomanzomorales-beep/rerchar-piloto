import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("un hallazgo del checklist abre una avería trazable y una orden correctiva",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const pilot=await import("../lib/pilot");
  const maintenance=await import("../lib/continuity");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(file=>/^\d+.*\.sql$/.test(file)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(value=>value.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente de mantenimiento') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const [admin,driver]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role)
    VALUES('mant-admin@example.cl','Administrador','h','admin'),('mant-driver@example.cl','Conductor','h','conductor') RETURNING id`);
  const owner:Actor={id:admin.id,name:"Administrador",email:"mant-admin@example.cl",role:"admin",client_id:null};
  const operator:Actor={id:driver.id,name:"Conductor",email:"mant-driver@example.cl",role:"conductor",client_id:null};
  const truck=await pilot.createAsset(owner,{code:"CAM-MT01",label:"Camión revisión",kind:"camion",plate:"MANT01"});
  const service=await pilot.createService(owner,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,
    operating_company:"rerchar",service_type:"traslado",waste_type:"Material",estimated_kg:"",origin:"Faena",destination:"Patio",
    priority:"normal",notes:""});
  await pilot.assignService(owner,service,{asset_id:truck,driver_id:driver.id,scheduled_for:"2026-10-20T09:00"});
  const good={vehicle_ok:true,documents_ok:true,containment_ok:true,ppe_ok:true,comment:"Revisado"};
  await assert.rejects(()=>pilot.saveChecklist(operator,service,{...good,vehicle_failure:true}),pilot.PilotError);
  await pilot.saveChecklist(operator,service,{...good,vehicle_ok:false,comment:"Pendiente revisar camión"});
  assert.equal((await db.query("SELECT id FROM fleet_incidents WHERE source_service_id=$1",[service])).length,0,
    "un control incompleto no se interpreta como una avería");
  const finding={...good,vehicle_ok:false,vehicle_failure:true,comment:"Neumático delantero presenta corte visible"};
  await pilot.saveChecklist(operator,service,finding);
  await pilot.saveChecklist(operator,service,finding);
  const incidents=await db.query<{id:string;source_service_id:string;asset_id:string;status:string}>(
    "SELECT id,source_service_id,asset_id,status FROM fleet_incidents WHERE source_service_id=$1",[service]);
  assert.equal(incidents.length,1,"guardar el checklist de nuevo no duplica la avería");
  assert.equal(incidents[0].asset_id,truck);
  assert.equal(incidents[0].status,"abierta");
  assert.equal((await maintenance.listMaintenance(owner)).incidents[0].source_service_id,service);
  assert.equal((await maintenance.listAssets(owner)).find(asset=>asset.id===truck)?.available,false);
  await assert.rejects(()=>pilot.startService(operator,service),pilot.PilotError);
  const order=await maintenance.createWorkOrder(owner,{asset_id:truck,plan_id:"",incident_id:incidents[0].id,
    kind:"correctiva",title:"Revisar neumático delantero",description:finding.comment,scheduled_for:"",blocks_asset:true});
  await maintenance.startWorkOrder(owner,order);
  await maintenance.closeWorkOrder(owner,order,{resolution:"Neumático reemplazado y camión inspeccionado",supplier:"",labor_cost:0,parts_cost:0,reading:""});
  assert.equal((await db.query<{status:string}>("SELECT status FROM fleet_incidents WHERE id=$1",[incidents[0].id]))[0].status,"resuelta");
  assert.equal((await maintenance.listAssets(owner)).find(asset=>asset.id===truck)?.available,true);
  await pilot.saveChecklist(operator,service,good);
  await pilot.startService(operator,service);
  assert.equal((await pilot.getService(owner,service)).status,"en_ruta");
});
