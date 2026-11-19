import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("mantenimiento conserva todos los registros y expone el contexto vigente de sus órdenes",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),maintenance=await import("../lib/continuity");
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(resolve("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [user]=await db.query<Actor>("INSERT INTO users(email,name,password_hash,role) VALUES('maintenance-review@example.invalid','Revisión mantenimiento','h','admin') RETURNING id,name,email,role,client_id");
  const actor:Actor=user;
  const [asset]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind,reading_unit,current_reading) VALUES('MAINT-REV','Equipo de revisión','equipo','horas',100) RETURNING id");
  const plans=await db.query<{id:string}>(`INSERT INTO maintenance_plans(asset_id,title,frequency_kind,interval_days,next_due_date,created_by,created_at)
    SELECT $1,'Plan de revisión '||n,'fecha',30,(now() AT TIME ZONE 'America/Santiago')::date+1,$2,'2026-01-01' FROM generate_series(1,203) n RETURNING id`,[asset.id,user.id]);
  await db.query(`INSERT INTO work_orders(asset_id,title,kind,created_by,created_at) SELECT $1,'Orden de revisión '||n,'correctiva',$2,'2026-01-01' FROM generate_series(1,163) n`,[asset.id,user.id]);
  await db.query(`INSERT INTO fleet_incidents(asset_id,description,severity,reported_by,reported_at) SELECT $1,'Avería de revisión '||n,'media',$2,'2026-01-01' FROM generate_series(1,113) n`,[asset.id,user.id]);
  await db.query("INSERT INTO tires(code) SELECT 'NEU-REV-'||n FROM generate_series(1,313) n");
  await t.test("los conteos y el historial no quedan cortados a 200, 150, 100 o 300",async()=>{
    const result=await maintenance.listMaintenance(actor);
    assert.equal(result.plans.length,203);assert.equal(result.orders.length,163);assert.equal(result.incidents.length,113);assert.equal(result.tires.length,313);
    const second=await maintenance.listMaintenance(actor);
    for(const key of ["plans","orders","incidents","tires"] as const)assert.deepEqual(result[key].map(x=>x.id),second[key].map(x=>x.id));
  });
  const order=await maintenance.createWorkOrder(actor,{asset_id:asset.id,plan_id:plans[0].id,incident_id:"",kind:"preventiva",title:"Pauta con orden vigente",description:"",scheduled_for:"",blocks_asset:false});
  await t.test("la pauta informa la orden activa y deja de vincular una cancelada",async()=>{
    let plan=(await maintenance.listMaintenance(actor)).plans.find(x=>x.id===plans[0].id)!;
    assert.equal((plan as unknown as {order_id:string}).order_id,order);
    await maintenance.cancelWorkOrder(actor,order,"Cancelación documentada de prueba");
    plan=(await maintenance.listMaintenance(actor)).plans.find(x=>x.id===plans[0].id)!;
    assert.equal((plan as unknown as {order_id:string|null}).order_id,null);
  });
  const hour=await maintenance.createHourMaintenancePlan(actor,{asset_id:asset.id,template_key:"pc200-250",next_due_reading:350,lead_reading:25});
  const hourOrder=await maintenance.createWorkOrder(actor,{asset_id:asset.id,plan_id:hour,incident_id:"",kind:"preventiva",title:"Mantención por horómetro",description:"",scheduled_for:"",blocks_asset:true});
  await t.test("el detalle identifica el horómetro obligatorio y la lectura actual antes del cierre",async()=>{
    const detail=(await maintenance.getWorkOrder(actor,hourOrder)).order as unknown as {asset_reading_unit:string;asset_current_reading:string;requires_close_reading:boolean};
    assert.equal(detail.asset_reading_unit,"horas");assert.equal(Number(detail.asset_current_reading),100);assert.equal(detail.requires_close_reading,true);
    await maintenance.startWorkOrder(actor,hourOrder);
    await assert.rejects(()=>maintenance.closeWorkOrder(actor,hourOrder,{resolution:"Trabajo conforme a la pauta",supplier:"",labor_cost:0,parts_cost:0,reading:""}),maintenance.ContinuityError);
    assert.equal((await maintenance.getWorkOrder(actor,hourOrder)).order.status,"en_trabajo");
    await maintenance.closeWorkOrder(actor,hourOrder,{resolution:"Trabajo conforme a la pauta",supplier:"",labor_cost:0,parts_cost:0,reading:350});
    assert.equal(Number((await db.query<{next_due_reading:string}>("SELECT next_due_reading FROM maintenance_plans WHERE id=$1",[hour]))[0].next_due_reading),600);
  });
  await t.test("una pauta por lectura también fija la unidad aunque el odómetro todavía esté en cero",async()=>{
    const [empty]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind,reading_unit) VALUES('MAINT-ZERO','Activo con pauta por kilometraje','camion','km') RETURNING id");
    await maintenance.createMaintenancePlan(actor,{asset_id:empty.id,title:"Mantención cada mil kilómetros",frequency_kind:"lectura",interval_reading:"1000",next_due_reading:"1000",lead_days:15,lead_reading:100});
    await assert.rejects(()=>maintenance.setAssetDetails(actor,empty.id,{brand:"Cambio que debe rechazarse",model:"",model_year:"",reading_unit:"horas"}),maintenance.ContinuityError);
    const saved=(await maintenance.listAssets(actor)).find(x=>x.id===empty.id)!;assert.equal(saved.reading_unit,"km");assert.equal(saved.brand,null);
    await maintenance.recordAssetReading(actor,empty.id,{reading:0,note:"Lectura inicial confirmada"});
    const firstVersion=(await maintenance.listAssets(actor)).find(x=>x.id===empty.id)!.reading_version;
    await maintenance.recordAssetReading(actor,empty.id,{reading:0,note:"Segunda lectura sin recorrido"});
    assert.equal(Number((await maintenance.listAssets(actor)).find(x=>x.id===empty.id)!.reading_version),Number(firstVersion)+1,"otra lectura con el mismo valor también renueva el formulario");
  });
});
