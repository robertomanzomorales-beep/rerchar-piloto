import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("tarifa vigente, valorización, reemisión, pagos y margen conservan saldos",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const finance=await import("../lib/finance");
  const continuity=await import("../lib/continuity");
  for(const name of ["001_piloto.sql","002_flota_y_despacho.sql","003_abastecimiento.sql","004_mantenimiento_combustible.sql","005_contenedores.sql","006_acreditacion.sql","007_finanzas.sql","008_trazabilidad_ambiental.sql","009_certificados.sql"]){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean)) await tx.query(part);});
  }
  const [admin]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('admin@demo.cl','Admin','hash','admin') RETURNING id");
  const [operations]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('ops@demo.cl','Operaciones','hash','operaciones') RETURNING id");
  const owner:Actor={id:admin.id,name:"Admin",email:"admin@demo.cl",role:"admin",client_id:null};
  const ops:Actor={id:operations.id,name:"Operaciones",email:"ops@demo.cl",role:"operaciones",client_id:null};
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients (name) VALUES ('Cliente financiero'),('Cliente ajeno') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites (client_id,name) VALUES ($1,'Faena') RETURNING id",[client.id]);
  const [asset]=await db.query<{id:string}>("INSERT INTO assets (code,label,kind,reading_unit) VALUES ('CAM-F01','Camión finanzas','camion','km') RETURNING id");
  const [service]=await db.query<{id:string}>(`INSERT INTO service_requests
    (submission_key,client_id,site_id,service_type,waste_type,origin,destination,status,gross_kg,tare_kg,assigned_asset_id,created_by,closed_at)
    VALUES ($1,$2,$3,'retiro','Chatarra','Faena','Patio','completada',150,100,$4,$5,'2026-09-24T13:00:00Z') RETURNING id`,
    [randomUUID(),client.id,site.id,asset.id,owner.id]);
  await assert.rejects(()=>finance.listFinance(ops),finance.FinanceError);
  const contract=await finance.createContract(owner,{client_id:client.id,site_id:site.id,code:"CT-01",starts_on:"2026-01-01",ends_on:"",notes:""});
  const wrong=await finance.createContract(owner,{client_id:other.id,site_id:"",code:"CT-OTRO",starts_on:"2026-01-01",ends_on:"",notes:""});
  const wrongTariff=await finance.createTariff(owner,{contract_id:wrong,service_type:"retiro",waste_type:"",unit:"kg",unit_price_clp:"10",valid_from:"2026-01-01",valid_until:""});
  await assert.rejects(()=>finance.valueService(owner,service.id,{tariff_id:wrongTariff,client_order_reference:""}),finance.FinanceError);
  const tariff=await finance.createTariff(owner,{contract_id:contract,service_type:"retiro",waste_type:"",unit:"kg",unit_price_clp:"1000.00",valid_from:"2026-01-01",valid_until:""});
  await assert.rejects(()=>finance.createTariff(owner,{contract_id:contract,service_type:"retiro",waste_type:"",unit:"servicio",unit_price_clp:"200",valid_from:"2026-06-01",valid_until:""}),finance.FinanceError);
  await finance.valueService(owner,service.id,{tariff_id:tariff,client_order_reference:"OC-CLIENTE-1"});
  await assert.rejects(()=>finance.valueService(owner,service.id,{tariff_id:tariff,client_order_reference:""}));
  let {service:detail}=await finance.getFinancialService(owner,service.id);
  assert.equal(detail.quantity,"50.00");
  assert.equal(detail.total_clp,"50000.00");
  const firstInvoice=await finance.registerInvoice(owner,service.id,{invoice_number:"F-ANULADA",issued_on:"2026-09-24",due_on:"2026-10-01"});
  await finance.voidInvoice(owner,firstInvoice,"Error de folio externo");
  const activeInvoice=await finance.registerInvoice(owner,service.id,{invoice_number:"F-001",issued_on:"2026-09-24",due_on:"2026-10-01"});
  const payment={submission_key:randomUUID(),amount_clp:"20000",paid_on:"2026-09-24",method:"transferencia",reference:"Transferencia A"};
  const paymentId=await finance.registerPayment(owner,activeInvoice,payment);
  assert.equal(await finance.registerPayment(owner,activeInvoice,payment),paymentId);
  await assert.rejects(()=>finance.registerPayment(owner,activeInvoice,{...payment,submission_key:randomUUID(),amount_clp:"40000",reference:"Exceso"}),finance.FinanceError);
  await assert.rejects(()=>finance.voidInvoice(owner,activeInvoice,"Hay pagos asociados"),finance.FinanceError);
  await finance.registerPayment(owner,activeInvoice,{...payment,submission_key:randomUUID(),amount_clp:"30000",reference:"Transferencia B"});
  const cost={submission_key:randomUUID(),category:"peajes",amount_clp:"7000",description:"Peajes del traslado"};
  const costId=await finance.addServiceCost(owner,service.id,cost);
  assert.equal(await finance.addServiceCost(owner,service.id,cost),costId);
  await continuity.registerFuel(owner,{submission_key:randomUUID(),asset_id:asset.id,driver_id:"",service_id:service.id,
    fuel_date:"2026-09-24",liters:5,cost_clp:5000,reading:100,full_tank:false,supplier:"Estación piloto",receipt_number:"B-100",notes:""});
  ({service:detail}=await finance.getFinancialService(owner,service.id));
  assert.equal(detail.invoice_number,"F-001");
  assert.equal(Number(detail.paid_clp),50000);
  assert.equal(Number(detail.manual_cost_clp),7000);
  assert.equal(Number(detail.fuel_cost_clp),5000);
  assert.equal(Number(detail.total_clp)-Number(detail.manual_cost_clp)-Number(detail.fuel_cost_clp),38000);
  assert.equal((await finance.getFinancialService(owner,service.id)).voidedInvoices.length,1);
  assert.equal((await finance.getFinancialService(owner,service.id)).payments.length,2);
});
