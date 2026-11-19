import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("la ficha financiera conserva importes, reintentos y alcance del documento",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),finance=await import("../lib/finance");
  for(const name of (await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [admin]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('detail-review@example.invalid','Admin revisión','h','admin') RETURNING id");
  const actor:Actor={...admin,role:"admin",name:"Admin revisión",email:"detail-review@example.invalid",client_id:null};
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente financiero de revisión') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena revisión') RETURNING id",[client.id]);
  async function fixture(company:string,code:string){
    const contract=await finance.createContract(actor,{client_id:client.id,site_id:site.id,operating_company:company,code,starts_on:"2020-01-01",ends_on:"",notes:""});
    const tariff=await finance.createTariff(actor,{contract_id:contract,service_type:"retiro",waste_type:code,unit:"servicio",unit_price_clp:"1000.25",valid_from:"2020-01-01",valid_until:""});
    const [service]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,closed_at,created_by)
      VALUES(gen_random_uuid(),$1,$2,$3,'retiro',$4,'Faena','Patio','completada','2020-02-01T15:00:00Z',$5) RETURNING id`,[client.id,site.id,company,code,actor.id]);
    const valuation=await finance.valueService(actor,service.id,{tariff_id:tariff,client_order_reference:""});
    const invoice=await finance.registerInvoice(actor,service.id,{invoice_number:code,issued_on:"2020-02-01",due_on:"2020-03-01",total_clp:"1190.30"});
    return {service:service.id,valuation,tariff,invoice};
  }
  const first=await fixture("rerchar","RER-DETALLE"),other=await fixture("e_y_j","EYJ-DETALLE");
  const payment={submission_key:randomUUID(),amount_clp:"1.25",paid_on:"2020-02-01",method:"transferencia",reference:"Transferencia de revisión"};
  const cost={submission_key:randomUUID(),category:"peajes",amount_clp:"10.25",description:"Peajes de revisión del servicio"};
  await t.test("un abono idéntico se registra una vez y una clave con datos distintos se rechaza",async()=>{
    const id=await finance.registerPayment(actor,first.invoice,payment,first.service);assert.equal(await finance.registerPayment(actor,first.invoice,payment,first.service),id);
    for(const change of [{amount_clp:"1.50"},{paid_on:"2020-02-02"},{method:"efectivo"},{reference:"Otro comprobante"}])await assert.rejects(()=>finance.registerPayment(actor,first.invoice,{...payment,...change},first.service),/otros datos/);
    await assert.rejects(()=>finance.registerPayment(actor,other.invoice,payment,other.service),/otra factura/);
    assert.equal((await db.query<{n:string}>("SELECT count(*)::text n FROM invoice_payments WHERE submission_key=$1",[payment.submission_key]))[0].n,"1");
    assert.equal((await finance.getFinancialService(actor,first.service)).service.paid_clp,"1.25");
    assert.equal((await db.query<{n:string}>("SELECT count(*)::text n FROM audit_events WHERE entity_type='invoice_payment' AND entity_id=$1",[id]))[0].n,"1");
  });
  await t.test("los costos distinguen un reintento exacto de un nuevo gasto",async()=>{
    const id=await finance.addServiceCost(actor,first.service,cost);assert.equal(await finance.addServiceCost(actor,first.service,cost),id);
    for(const change of [{amount_clp:"11.25"},{category:"otros"},{description:"Descripción de un costo distinto"}])await assert.rejects(()=>finance.addServiceCost(actor,first.service,{...cost,...change}),/otros datos/);
    await assert.rejects(()=>finance.addServiceCost(actor,other.service,cost),/otro servicio/);
    assert.equal((await finance.getFinancialService(actor,first.service)).service.manual_cost_clp,"10.25");
    assert.equal((await db.query<{n:string}>("SELECT count(*)::text n FROM audit_events WHERE entity_type='service_cost' AND entity_id=$1",[id]))[0].n,"1");
  });
  await t.test("la conciliación, anulación y abonos no cambian una factura ajena a la ficha",async()=>{
    await db.query("UPDATE service_invoices SET total_verified=false WHERE id=$1",[other.invoice]);
    await assert.rejects(()=>finance.confirmServiceInvoiceTotal(actor,other.invoice,{total_clp:"1400.75",reason:"Revisado contra documento externo"},first.service),/conciliación/);
    await assert.rejects(()=>finance.voidInvoice(actor,other.invoice,"Documento de otra ficha",first.service),/no está vigente/);
    await assert.rejects(()=>finance.registerPayment(actor,other.invoice,{...payment,submission_key:randomUUID()},first.service),/no encontrada/);
    const [untouched]=await db.query<{status:string;total_verified:boolean;total_clp:string}>("SELECT status,total_verified,total_clp FROM service_invoices WHERE id=$1",[other.invoice]);assert.deepEqual(untouched,{status:"emitida",total_verified:false,total_clp:"1190.30"});
    await finance.confirmServiceInvoiceTotal(actor,other.invoice,{total_clp:"1400.75",reason:"Revisado contra documento externo"},other.service);
    assert.equal((await finance.getFinancialService(actor,other.service)).service.total_clp,"1000.25","confirmar total bruto no cambia la valorización neta");
  });
  await t.test("el pago exige una fecha realizada, no excede el saldo y conserva el cierre exacto en centavos",async()=>{
    await assert.rejects(()=>finance.registerPayment(actor,first.invoice,{...payment,submission_key:randomUUID(),paid_on:"2099-01-01"}),/futura/);
    await assert.rejects(()=>finance.registerPayment(actor,first.invoice,{...payment,submission_key:randomUUID(),amount_clp:"1189.06"}),/supera/);
    await finance.registerPayment(actor,first.invoice,{...payment,submission_key:randomUUID(),amount_clp:"1189.05"},first.service);
    const {service}=await finance.getFinancialService(actor,first.service);assert.equal(service.invoice_total,"1190.30");assert.equal(service.paid_clp,"1190.30");
    await assert.rejects(()=>finance.voidInvoice(actor,first.invoice,"No corresponde anular con pagos",first.service),/registra pagos/);
  });
  await t.test("un servicio que ya no está cerrado no admite nuevas facturas ni costos",async()=>{
    await finance.voidInvoice(actor,other.invoice,"Documento corregido antes de cobrar",other.service);
    await db.query("UPDATE service_requests SET status='solicitada' WHERE id=$1",[other.service]);
    await assert.rejects(()=>finance.registerInvoice(actor,other.service,{invoice_number:"EYJ-NUEVA",issued_on:"2020-02-01",due_on:"2020-03-01",total_clp:"1"}),/servicio cerrado/);
    await assert.rejects(()=>finance.addServiceCost(actor,other.service,{...cost,submission_key:randomUUID()}),/servicios cerrados/);
    await db.query("UPDATE service_requests SET status='completada' WHERE id=$1",[other.service]);
  });
  await t.test("los historiales completos tienen orden estable y mantienen saldos totales",async()=>{
    await db.query(`INSERT INTO service_costs(submission_key,service_id,category,amount_clp,description,created_by,created_at)
      SELECT gen_random_uuid(),$1,'otros',1.25,'Costo histórico '||n,$2,'2020-01-01' FROM generate_series(1,213) n`,[first.service,actor.id]);
    await db.query(`INSERT INTO service_invoices(valuation_id,invoice_number,issued_on,due_on,total_clp,status,created_by,created_at)
      SELECT $1,'ANULADA-REV-'||n,'2020-01-01','2020-02-01',1,'anulada',$2,'2020-01-01' FROM generate_series(1,207) n`,[first.valuation,actor.id]);
    const data=await finance.getFinancialService(actor,first.service),again=await finance.getFinancialService(actor,first.service);assert.equal(data.costs.length,214);assert.equal(data.voidedInvoices.length,207);assert.equal(Number(data.service.manual_cost_clp),276.5);
    assert.deepEqual(data.costs.map(x=>x.id),again.costs.map(x=>x.id));assert.deepEqual(data.voidedInvoices.map(x=>x.id),again.voidedInvoices.map(x=>x.id));assert.deepEqual(data.payments.map(x=>x.id),again.payments.map(x=>x.id));
  });
  await t.test("un acceso administrativo revocado detiene las siete operaciones de la ficha",async()=>{
    await db.query("UPDATE users SET role='operaciones' WHERE id=$1",[actor.id]);
    const operations=[()=>finance.valueService(actor,first.service,{tariff_id:first.tariff,client_order_reference:""}),()=>finance.updateClientOrderReference(actor,first.service,{client_order_reference:"OC",reason:"Corrección de referencia"}),()=>finance.registerInvoice(actor,first.service,{invoice_number:"STALE",issued_on:"2020-01-01",due_on:"2020-02-01",total_clp:"1"}),()=>finance.confirmServiceInvoiceTotal(actor,first.invoice,{total_clp:"1",reason:"Verificado"}),()=>finance.voidInvoice(actor,first.invoice,"Motivo de prueba"),()=>finance.registerPayment(actor,first.invoice,{...payment,submission_key:randomUUID()}),()=>finance.addServiceCost(actor,first.service,{...cost,submission_key:randomUUID()})];
    for(const operation of operations)await assert.rejects(operation,/acceso de administración/);
  });
});
