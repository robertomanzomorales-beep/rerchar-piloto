import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("Control de Guía registra una venta real con varios materiales y conserva las diferencias de la planilla",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const guides=await import("../lib/material-guides");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Comprador de material') RETURNING id");
  const [admin,viewer]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role,client_id)
    VALUES('guias@demo.cl','Operaciones','h','operaciones',null),('cliente@demo.cl','Cliente','h','cliente',$1) RETURNING id`,[client.id]);
  const actor:Actor={id:admin.id,name:"Operaciones",email:"guias@demo.cl",role:"operaciones",client_id:null};
  const customer:Actor={id:viewer.id,name:"Cliente",email:"cliente@demo.cl",role:"cliente",client_id:client.id};
  const key=randomUUID();
  const base={submission_key:key,guide_number:"2219",movement_on:"2026-09-02",movement_type:"venta",counterparty_id:client.id,
    origin:"Faena",destination:"Comprador",driver_name:"Chofer",truck_plate:"ABCD-12",line_number:"1",
    material_name:"Chatarra de fierro mixto",origin_ticket:"617014",origin_kg:"25990",stock_kg:"720",
    departure_ticket:"3046",destination_ticket:"482518",arrival_kg:"25610",returned_kg:"620",
    destination_impurity_kg:"0",invoice_kg:"25610",agreed_price_clp:"250",invoice_price_clp:"250"};
  const id=await guides.createMaterialGuide(actor,base);
  assert.equal(await guides.createMaterialGuide(actor,base),id,"reintento no duplica guía ni material");
  const {guide,items}=await guides.getMaterialGuide(actor,id);
  assert.equal(guide.movement_type,"venta");
  assert.equal(guide.line_count,"1");
  assert.equal(guide.departure_kg,"26710.00");
  assert.deepEqual(guides.materialGuideTotals(items[0]),{departure_kg:26710,destination_difference_kg:-480,
    invoice_difference_kg:0,estimated_clp:6402500,billed_clp:6402500,value_difference_clp:0});
  assert.equal(guide.missing_invoice,"1");
  await assert.rejects(()=>guides.createMaterialGuide(customer,{...base,submission_key:randomUUID()}),guides.MaterialGuideError);
  await assert.rejects(()=>guides.getMaterialGuide(customer,id),guides.MaterialGuideError);
  await assert.rejects(()=>guides.createMaterialGuide(actor,{...base,submission_key:randomUUID()}),guides.MaterialGuideError);
  await guides.saveMaterialGuideItem(actor,id,{line_number:"2",material_name:"Aluminio",stock_kg:"500",
    arrival_kg:"495",invoice_kg:"490"});
  const second=(await guides.getMaterialGuide(actor,id)).items[1];
  assert.equal(guides.materialGuideTotals(second).departure_kg,500,"una venta puede salir sólo desde stock");
  await assert.rejects(()=>guides.saveMaterialGuideItem(actor,id,{line_number:"2",material_name:"Aluminio",stock_kg:"800"}),guides.MaterialGuideError);
  await guides.saveMaterialGuideItem(actor,id,{item_id:second.id,line_number:"2",material_name:"Aluminio",stock_kg:"500",
    arrival_kg:"495",returned_kg:"",invoice_number:"F-2",invoice_issued_on:"2026-09-03",invoice_status:"pagada",payment_on:"2026-09-04"});
  const updated=(await guides.getMaterialGuide(actor,id)).items[1];
  assert.equal(updated.invoice_status,"pagada");
  assert.equal(updated.returned_kg,null);
  assert.equal((await guides.listMaterialGuides(actor,"aluminio","venta")).length,1);
  assert.equal((await db.query<{n:string}>("SELECT count(*)::text AS n FROM audit_events WHERE entity_type='material_guide_item'"))[0].n,"3");
});
