import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("flete falso y sobreestadía siguen parte, decisión y empresa sin alterar facturas",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const pilot=await import("../lib/pilot");
  const day=await import("../lib/service-day");
  const charges=await import("../lib/extra-charges");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [manager,operator,driver]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role)
    VALUES ('cargo-admin@demo.cl','Administración','h','admin'),('cargo-ops@demo.cl','Operaciones','h','operaciones'),
      ('cargo-driver@demo.cl','Conductor','h','conductor') RETURNING id`);
  const admin:Actor={id:manager.id,name:"Administración",email:"cargo-admin@demo.cl",role:"admin",client_id:null};
  const ops:Actor={id:operator.id,name:"Operaciones",email:"cargo-ops@demo.cl",role:"operaciones",client_id:null};
  const outsider:Actor={id:driver.id,name:"Conductor",email:"cargo-driver@demo.cl",role:"conductor",client_id:null};
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente de excepción') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const truck=await pilot.createAsset(ops,{code:"CAM-CARGO",label:"Camión cargos",kind:"camion",plate:"CARG-01"});
  async function service(company:"rerchar"|"e_y_j",workDay:string){
    const id=await pilot.createService(ops,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,
      operating_company:company,service_type:"traslado",waste_type:"Material",estimated_kg:"",origin:"Faena",destination:"Patio",priority:"normal",notes:""});
    await pilot.assignService(ops,id,{asset_id:truck,driver_id:driver.id,scheduled_for:`${workDay}T09:00`});
    await day.reportServiceDay(ops,id,{day:workDay,outcome:"incompleto",observation:"Cliente suspendió carguío por clima"});
    return id;
  }
  const rerchar=await service("rerchar","2026-10-12");
  const eyj=await service("e_y_j","2026-10-13");
  const first={submission_key:randomUUID(),service_day:"2026-10-12",kind:"flete_falso",reason:"No pudo cargar por condiciones climáticas",
    amount_clp:"",quote_reference:"COT-2186",client_order_reference:""};
  await assert.rejects(()=>charges.proposeExtraCharge(outsider,rerchar,first),charges.ExtraChargeError);
  await assert.rejects(()=>charges.proposeExtraCharge(ops,rerchar,{...first,service_day:"2026-10-11"}),/Registre primero/);
  const id=await charges.proposeExtraCharge(ops,rerchar,first);
  assert.equal(await charges.proposeExtraCharge(ops,rerchar,first),id,"el reenvío es idempotente");
  assert.equal((await charges.listExtraCharges(ops,"rerchar")).length,1);
  assert.equal((await charges.listExtraCharges(ops,"e_y_j")).length,0);
  await assert.rejects(()=>charges.decideExtraCharge(ops,id,{status:"aprobado",decision_note:"Aceptado por cliente",amount_clp:"706000"}),charges.ExtraChargeError);
  await assert.rejects(()=>charges.decideExtraCharge(admin,id,{status:"aprobado",decision_note:"Aceptado por cliente",amount_clp:""}),/monto/);
  await charges.decideExtraCharge(admin,id,{status:"aprobado",decision_note:"Acordado con cliente",amount_clp:"706000"});
  assert.equal(await charges.pendingExtraChargeCount(ops,"rerchar"),0);
  await assert.rejects(()=>charges.decideExtraCharge(admin,id,{status:"descartado",decision_note:"Sin cobro",amount_clp:""}),/resuelto/);
  await assert.rejects(()=>charges.invoiceExtraCharge(admin,id,{invoice_number:"F-1050",invoiced_on:"2026-10-11"}),/anteceder/);
  await charges.invoiceExtraCharge(admin,id,{invoice_number:"F-1050",invoiced_on:"2026-10-13"});
  const second=await charges.proposeExtraCharge(ops,eyj,{...first,submission_key:randomUUID(),service_day:"2026-10-13",kind:"sobrestadia",amount_clp:"25000"});
  await charges.decideExtraCharge(admin,second,{status:"descartado",decision_note:"Gerencia indicó no cobrar",amount_clp:""});
  assert.equal((await charges.listExtraCharges(ops,"e_y_j"))[0].status,"descartado");
  assert.equal((await charges.listExtraCharges(ops,"rerchar"))[0].invoice_number,"F-1050");
  assert.equal((await db.query("SELECT id FROM service_invoices")).length,0,"no se inventó factura de servicio");
  assert.equal((await db.query("SELECT id FROM service_valuations")).length,0,"no se alteró la valorización principal");
  assert.equal((await db.query("SELECT id FROM audit_events WHERE entity_type='service_extra_charge'")).length,5);
});
