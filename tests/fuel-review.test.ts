import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("combustible conserva el historial, distingue reintentos y estima sólo con datos compatibles",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),fuel=await import("../lib/continuity");
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(resolve("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [actor,driver]=await db.query<Actor>("INSERT INTO users(email,name,password_hash,role) VALUES('fuel-admin@example.invalid','Admin combustible','h','admin'),('fuel-driver@example.invalid','Conductor de prueba','h','conductor') RETURNING id,name,email,role,client_id");
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente combustible') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena combustible') RETURNING id",[client.id]);
  const [history,asset,other,hours,dates,precision]=await db.query<{id:string}>(`INSERT INTO assets(code,label,kind,reading_unit) VALUES
    ('FUEL-H','Historial combustible','camion','km'),('FUEL-A','Camión A','camion','km'),('FUEL-B','Camión B','camion','km'),
    ('FUEL-E','Equipo con horómetro','equipo','horas'),('FUEL-D','Camión fechas','camion','km'),('FUEL-P','Camión precisión','camion','km') RETURNING id`);
  await db.query(`INSERT INTO fuel_entries(submission_key,asset_id,fuel_date,liters,cost_clp,reading,full_tank,supplier,receipt_number,created_by,created_at)
    SELECT gen_random_uuid(),$1,'2026-10-01',2,1000,n,false,'Estación HTTP','H-'||n,$2,'2026-10-01' FROM generate_series(1,315) n`,[history.id,actor.id]);
  const services=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,priority,created_by,operating_company,status,assigned_asset_id,driver_id)
    SELECT gen_random_uuid(),$1,$2,'traslado','Material','Faena','Patio','normal',$3,CASE WHEN n%2=0 THEN 'rerchar' ELSE 'e_y_j' END,'programada',$4,$5 FROM generate_series(1,213) n RETURNING id`,[client.id,site.id,actor.id,asset.id,driver.id]);
  await db.query("UPDATE service_requests SET deleted_at=now() WHERE id=$1",[services[211].id]);
  await db.query("UPDATE service_requests SET status='cancelada' WHERE id=$1",[services[212].id]);
  const input=(id:string,reading:number,receipt:string)=>({submission_key:randomUUID(),asset_id:id,driver_id:"",service_id:"",fuel_date:"2026-10-22",liters:10,cost_clp:10000,reading,full_tank:true,supplier:"Estación de prueba",receipt_number:receipt,notes:""});
  await t.test("historial completo, páginas estables, totales y servicios sin cortes ocultos",async()=>{
    const pages=await Promise.all([1,2,3,4].map(page=>fuel.listFuel(actor,page,history.id)));
    assert.deepEqual(pages.map(x=>x.entries.length),[100,100,100,15]);assert.equal(new Set(pages.flatMap(x=>x.entries.map(e=>e.id))).size,315);
    const first=pages[0] as typeof pages[0]&{totalEntries:number;totalLiters:string;totalCost:string};
    assert.equal(first.totalEntries,315);assert.equal(Number(first.totalLiters),630);assert.equal(Number(first.totalCost),315000);
    assert.equal(first.services.length,211);assert.ok(!first.services.some(x=>x.id===services[211].id));
    assert.equal((await fuel.listFuel(actor,1,"00000000-0000-f000-0000-000000000099")).totalEntries,0,"un activo inexistente no amplía el historial a toda la flota");
    await assert.rejects(()=>fuel.listFuel(actor,1,"activo inválido"));
  });
  await t.test("un reintento idéntico conserva una sola carga y un cambio de datos no se confirma como guardado",async()=>{
    const original={...input(asset.id,100,"F-01"),notes:"Línea\n".repeat(166)+"fin!"},id=await fuel.registerFuel(actor,original);
    assert.equal(original.notes.length,1000);
    assert.equal(await fuel.registerFuel(actor,{...original,supplier:"  Estación de prueba  ",notes:original.notes.replace(/\n/g,"\r\n")}),id);
    await assert.rejects(()=>fuel.registerFuel(actor,{...original,cost_clp:20000}),fuel.ContinuityError);
    await assert.rejects(()=>fuel.registerFuel(actor,{...original,asset_id:other.id}),fuel.ContinuityError);
    assert.equal((await db.query("SELECT id FROM fuel_entries WHERE submission_key=$1",[original.submission_key])).length,1);
    assert.equal((await db.query<{total:string}>("SELECT count(*)::text AS total FROM asset_readings WHERE asset_id=$1",[asset.id]))[0].total,"1");
  });
  await t.test("un servicio cancelado después de seleccionarlo no admite una nueva carga vinculada",async()=>{
    await assert.rejects(()=>fuel.registerFuel(actor,{...input(other.id,10,"F-CANCEL"),asset_id:asset.id,reading:110,service_id:services[212].id}),fuel.ContinuityError);
  });
  await t.test("una fecha anterior no produce un rendimiento ficticio entre dos tanques completos",async()=>{
    await fuel.registerFuel(actor,input(dates.id,100,"F-D1"));
    const id=await fuel.registerFuel(actor,{...input(dates.id,200,"F-D2"),fuel_date:"2026-10-21"});
    assert.equal((await db.query<{km_per_liter:string|null}>("SELECT km_per_liter FROM fuel_entries WHERE id=$1",[id]))[0].km_per_liter,null);
  });
  await t.test("el horómetro conserva su unidad y no se presenta como kilómetros por litro",async()=>{
    await fuel.registerFuel(actor,{...input(hours.id,10,"F-H1"),full_tank:false});
    const record=(await fuel.listFuel(actor,1,hours.id)).entries.find(x=>x.asset_id===hours.id)!;
    assert.equal(record.reading_unit,"horas");assert.equal(record.km_per_liter,null);
  });
  await t.test("una estimación fuera del rango numérico no impide registrar la carga válida",async()=>{
    await fuel.registerFuel(actor,input(precision.id,0,"F-P1"));
    const id=await fuel.registerFuel(actor,{...input(precision.id,100_000_000,"F-P2"),liters:0.001});
    assert.equal((await db.query<{km_per_liter:string|null}>("SELECT km_per_liter FROM fuel_entries WHERE id=$1",[id]))[0].km_per_liter,null);
  });
  await assert.rejects(()=>fuel.listFuel(driver),fuel.ContinuityError);
  await assert.rejects(()=>fuel.registerFuel(driver,input(asset.id,200,"NO-AUTORIZADO")),fuel.ContinuityError);
});
