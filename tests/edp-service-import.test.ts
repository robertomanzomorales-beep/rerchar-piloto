import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("EDP copia respaldos de servicios E y J sin duplicar cliente, categoría ni toneladas",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const edp=await import("../lib/payment-statements");
  const {moduleReady}=await import("../lib/schema-readiness");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  assert.equal(await moduleReady("edp_service_import"),true);
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente E y J'),('Otro cliente') RETURNING id");
  const [site,otherSite]=await db.query<{id:string}>(
    "INSERT INTO client_sites(client_id,name) VALUES($1,'Faena'),($2,'Otra faena') RETURNING id",[client.id,other.id]);
  const [user,ops]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role)
    VALUES('edpimport@demo.cl','Administración','h','admin'),('edpops@demo.cl','Operaciones','h','operaciones') RETURNING id`);
  const actor:Actor={id:user.id,name:"Administración",email:"edpimport@demo.cl",role:"admin",client_id:null};
  const viewer:Actor={id:ops.id,name:"Operaciones",email:"edpops@demo.cl",role:"operaciones",client_id:null};
  const date=(value:Date|string|null)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
  const base={client_id:client.id,period_on:"2026-01-01",statement_type:"residuos" as const,
    client_name:"Cliente E y J",client_tax_id:"99.999.999-9",client_address:"Dirección 123",
    client_contact:"contacto@cliente.cl"};
  const statement=await edp.createPaymentStatement(actor,{...base,number:"01",submission_key:randomUUID()});
  const second=await edp.createPaymentStatement(actor,{...base,number:"02",submission_key:randomUUID()});
  async function service(company:string,customer=client.id,worksite=site.id,status="completada",type="traslado"){
    const [row]=await db.query<{id:string}>(`INSERT INTO service_requests
      (submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,
       status,closed_at,gross_kg,tare_kg,guide_number,rental_from,rental_to,created_by)
      VALUES($1,$2,$3,$4,$5,'Residuo Industrial','Faena','Planta',$6,'2026-06-22T15:00:00Z',
       CASE WHEN $5='arriendo' THEN NULL ELSE 14500 END,CASE WHEN $5='arriendo' THEN NULL ELSE 790 END,
       '3669',CASE WHEN $5='arriendo' THEN '2026-07-24'::date ELSE NULL END,
       CASE WHEN $5='arriendo' THEN '2026-08-23'::date ELSE NULL END,$7) RETURNING id`,
      [randomUUID(),customer,worksite,company,type,status,user.id]);
    return row.id;
  }
  const source=await service("e_y_j");
  await service("rerchar");await service("e_y_j",other.id,otherSite.id);
  const pending=await service("e_y_j",client.id,site.id,"programada");
  await db.query(`INSERT INTO service_commercial_details(service_id,service_sheet,eyj_guide,sidrep,updated_by)
    VALUES($1,'2949','3669','SID-10',$2)`,[source,user.id]);
  await db.query(`INSERT INTO service_guide_controls(service_id,guide_number,movement_date,movement_type,
    departure_ticket,recorded_by) VALUES($1,'3669','2026-06-22','servicio','17819',$2)`,[source,user.id]);
  assert.deepEqual((await edp.listStatementServices(viewer,statement)).map(s=>s.id),[source]);
  await assert.rejects(()=>edp.addStatementService(viewer,statement,{service_id:source,line_number:1,is_disposal:"0"}),edp.PaymentStatementError);
  await assert.rejects(()=>edp.addStatementService(actor,statement,{service_id:pending,line_number:1,is_disposal:"0"}),edp.PaymentStatementError);
  await edp.addStatementService(actor,statement,{service_id:source,line_number:1,is_disposal:"0"});
  const first=(await edp.getPaymentStatement(actor,statement)).operations[0];
  assert.equal(first.service_id,source);assert.equal(first.weight_kg,"13710.00");
  assert.equal(first.weighing_ticket,"17819");assert.equal(first.service_sheet,"2949");
  assert.equal(first.guide_number,"3669");assert.equal(first.sidrep,"SID-10");
  assert.equal(date(first.operation_on),"2026-06-22","usa fecha real aunque el EDP diga enero");
  await assert.rejects(()=>edp.addStatementService(actor,second,{service_id:source,line_number:1,is_disposal:"1"}),edp.PaymentStatementError);
  await edp.addStatementService(actor,statement,{service_id:source,line_number:2,is_disposal:"1"});
  assert.equal((await edp.getPaymentStatement(actor,statement)).totals.disposal_tons,13.71);
  assert.equal((await edp.listStatementServices(actor,statement)).length,0);
  await assert.rejects(()=>edp.addStatementService(actor,statement,{service_id:source,line_number:3,is_disposal:"0"}),edp.PaymentStatementError);
  await db.query("UPDATE service_requests SET gross_kg=15500 WHERE id=$1",[source]);
  assert.equal((await edp.getPaymentStatement(actor,statement)).operations[0].weight_kg,"13710.00","respaldo del EDP es una copia revisable");
  await edp.deletePaymentStatementLine(actor,statement,"operation",first.id);
  assert.equal((await edp.listStatementServices(actor,statement))[0].transport_used,false);
  await edp.addStatementService(actor,statement,{service_id:source,line_number:1,is_disposal:"0"});

  const rental=await service("e_y_j",client.id,site.id,"completada","arriendo");
  const rentalEdp=await edp.createPaymentStatement(actor,{...base,number:"03",statement_type:"arriendo",
    period_on:"2026-08-01",submission_key:randomUUID()});
  assert.deepEqual((await edp.listStatementServices(actor,rentalEdp)).map(s=>s.id),[rental]);
  await edp.addStatementService(actor,rentalEdp,{service_id:rental,line_number:1,is_disposal:"0"});
  const rentalLine=(await edp.getPaymentStatement(actor,rentalEdp)).operations[0];
  assert.equal(date(rentalLine.rental_from),"2026-07-24");assert.equal(date(rentalLine.rental_to),"2026-08-23");
  assert.equal(rentalLine.weight_kg,null);
  await assert.rejects(()=>edp.addStatementService(actor,rentalEdp,{service_id:rental,line_number:2,is_disposal:"1"}),edp.PaymentStatementError);
});
