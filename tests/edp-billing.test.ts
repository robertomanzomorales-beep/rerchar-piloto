import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("EDP aprobado comparte folio de factura externa y cobranza sin duplicar saldo",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const {moduleReady}=await import("../lib/schema-readiness");
  const edp=await import("../lib/payment-statements");
  const charges=await import("../lib/extra-charges");
  const finance=await import("../lib/finance");
  const receivables=await import("../lib/receivables");
  const {eyjEdpInvoiceDashboard}=await import("../lib/company-dashboard");
  const migrations=(await readdir(resolve(process.cwd(),"db"))).filter(x=>/^\d+.*\.sql$/.test(x)).sort();
  async function apply(name:string){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  for(const name of migrations.filter(x=>x<"041"))await apply(name);
  assert.equal(await moduleReady("edp_billing"),false);
  const [user,operations]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role)
    VALUES('billing@demo.cl','Administración','h','admin'),('billingops@demo.cl','Operaciones','h','operaciones') RETURNING id`);
  const admin:Actor={id:user.id,name:"Administración",email:"billing@demo.cl",role:"admin",client_id:null};
  const ops:Actor={id:operations.id,name:"Operaciones",email:"billingops@demo.cl",role:"operaciones",client_id:null};
  assert.equal((await receivables.listReceivables(admin,"e_y_j")).length,0,"la pantalla existente funciona antes de migrar");
  assert.equal((await receivables.receivablesOverview(admin,"e_y_j","2026-10-14")).total,"0");
  assert.equal((await eyjEdpInvoiceDashboard()).ready,false);
  await apply("041_edp_factura_cobranza.sql");
  assert.equal(await moduleReady("edp_billing"),true);
  assert.equal(await moduleReady("edp_client_order"),false,"el módulo antiguo continúa disponible durante el despliegue");
  await apply("048_edp_orden_compra_cliente.sql");
  assert.equal(await moduleReady("edp_client_order"),true);
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente E y J'),('Cliente ajeno') RETURNING id");
  const base={client_id:client.id,period_on:"2026-10-01",statement_type:"residuos" as const,
    client_name:"Cliente E y J",client_tax_id:"99.999.999-9",client_address:"Dirección 123",
    client_contact:"contacto@cliente.cl"};
  async function approved(number:string,customer=client.id){
    const id=await edp.createPaymentStatement(admin,{...base,client_id:customer,number,submission_key:randomUUID()});
    await edp.saveStatementOperation(admin,id,{line_number:"1",description:"Servicio de transporte",
      operation_on:"2026-10-12",weight_kg:"1000",is_disposal:"0"});
    await edp.saveStatementCharge(admin,id,{line_number:"1",description:"Servicio mensual",pricing:"clp_servicio",
      unit_value:"100000",quantity:"1"});
    await edp.setPaymentStatementStatus(admin,id,"enviado");
    await edp.setPaymentStatementStatus(admin,id,"aprobado");
    if(number!=="01")await edp.saveStatementClientOrder(admin,id,{client_order_reference:`OC-${number}`,
      client_order_on:"2026-10-12",client_order_exception:""});
    return id;
  }
  const draft=await edp.createPaymentStatement(admin,{...base,number:"00",submission_key:randomUUID()});
  const invoice={invoice_number:"EYJ-110",issued_on:"2026-10-13",due_on:"2026-10-28",total_clp:"119000",variance_note:""};
  await assert.rejects(()=>edp.linkStatementInvoice(admin,draft,invoice),edp.PaymentStatementError);
  const first=await approved("01"),second=await approved("02"),otherClient=await approved("03",other.id);
  assert.equal((await eyjEdpInvoiceDashboard()).unbilled,"3");
  assert.equal((await eyjEdpInvoiceDashboard()).awaiting_order,"1");
  await assert.rejects(()=>edp.linkStatementInvoice(ops,first,invoice),edp.PaymentStatementError);
  await assert.rejects(()=>edp.linkStatementInvoice(admin,first,invoice),/Registre la OC/);
  await assert.rejects(()=>edp.saveStatementClientOrder(ops,first,{client_order_reference:"OC-01",client_order_on:"2026-10-12"}),edp.PaymentStatementError);
  await assert.rejects(()=>edp.saveStatementClientOrder(admin,first,{client_order_reference:"OC-01",client_order_on:""}),/fecha/);
  await edp.saveStatementClientOrder(admin,first,{client_order_reference:"OC-01",client_order_on:"2026-10-14"});
  await assert.rejects(()=>edp.linkStatementInvoice(admin,first,invoice),/anterior a la OC/);
  await edp.saveStatementClientOrder(admin,first,{client_order_reference:"OC-01",client_order_on:"2026-10-12"});
  assert.equal((await eyjEdpInvoiceDashboard()).ready_to_invoice,"3");
  await assert.rejects(()=>edp.linkStatementInvoice(admin,first,{...invoice,total_clp:"120000"}),/Explique la diferencia/);
  await assert.rejects(()=>edp.linkStatementInvoice(admin,first,{...invoice,issued_on:"2026-11-01",due_on:"2026-11-15"}),/futura/);
  await edp.linkStatementInvoice(admin,first,invoice);
  await assert.rejects(()=>edp.saveStatementClientOrder(admin,first,{client_order_reference:"OC-cambiada",client_order_on:"2026-10-12"}),/ya facturado/);
  assert.equal((await receivables.listReceivables(admin,"e_y_j")).length,1);
  assert.equal((await receivables.listReceivables(admin,"e_y_j"))[0].source,"edp");
  assert.equal((await eyjEdpInvoiceDashboard()).unbilled,"2");
  await assert.rejects(()=>edp.linkStatementInvoice(admin,otherClient,invoice),/otro cliente/);
  await assert.rejects(()=>edp.linkStatementInvoice(admin,second,invoice),/Explique la diferencia/);
  await edp.linkStatementInvoice(admin,second,{...invoice,variance_note:"Factura compartida entre dos EDP"});
  const rows=await receivables.listReceivables(admin,"e_y_j");
  assert.equal(rows.length,1,"un folio vinculado a dos EDP se cobra una sola vez");
  assert.equal(rows[0].edp_count,"2");
  assert.equal((await receivables.receivablesOverview(admin,"e_y_j","2026-10-29")).overdue,"1");
  assert.equal((await receivables.receivablesOverview(admin,"rerchar","2026-10-29")).total,"0");
  const account=(await edp.getPaymentStatement(admin,first)).statement.receivable_invoice_id!;
  const payment={submission_key:randomUUID(),amount_clp:"19000",paid_on:"2026-10-14",reference:"Comprobante 001"};
  const paymentId=await charges.registerExtraReceivablePayment(admin,account,payment);
  assert.equal(await charges.registerExtraReceivablePayment(admin,account,payment),paymentId);
  assert.equal((await receivables.listReceivables(admin,"e_y_j"))[0].paid_clp,"19000.00");
  await assert.rejects(()=>charges.voidExtraReceivableInvoice(admin,account,"Anulación incorrecta"),/registra pagos/);
  assert.equal((await eyjEdpInvoiceDashboard()).unbilled,"1");

  const third=await approved("04");
  await edp.linkStatementInvoice(admin,third,{...invoice,invoice_number:"EYJ-111"});
  const voidId=(await edp.getPaymentStatement(admin,third)).statement.receivable_invoice_id!;
  await charges.voidExtraReceivableInvoice(admin,voidId,"Folio informado incorrectamente");
  assert.equal((await edp.getPaymentStatement(admin,third)).statement.receivable_invoice_id,null);
  assert.equal((await eyjEdpInvoiceDashboard()).unbilled,"2");

  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const [service]=await db.query<{id:string}>(`INSERT INTO service_requests
    (submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by)
    VALUES($1,$2,$3,'e_y_j','traslado','Industrial','Faena','Planta',$4) RETURNING id`,
    [randomUUID(),client.id,site.id,user.id]);
  const [contract]=await db.query<{id:string}>(`INSERT INTO client_contracts(client_id,code,starts_on,created_by,operating_company)
    VALUES($1,'CT-EDP','2026-01-01',$2,'e_y_j') RETURNING id`,[client.id,user.id]);
  const [tariff]=await db.query<{id:string}>(`INSERT INTO service_tariffs(contract_id,service_type,unit,unit_price_clp,valid_from,created_by)
    VALUES($1,'traslado','servicio',100000,'2026-01-01',$2) RETURNING id`,[contract.id,user.id]);
  const [valuation]=await db.query<{id:string}>(`INSERT INTO service_valuations(service_id,tariff_id,quantity,unit_price_clp,total_clp,created_by)
    VALUES($1,$2,1,100000,100000,$3) RETURNING id`,[service.id,tariff.id,user.id]);
  const [main]=await db.query<{id:string}>(`INSERT INTO service_invoices
    (valuation_id,invoice_number,issued_on,due_on,total_clp,created_by,total_verified)
    VALUES($1,'EYJ-112','2026-10-13','2026-10-28',119000,$2,true) RETURNING id`,[valuation.id,user.id]);
  await edp.linkStatementInvoice(admin,third,{...invoice,invoice_number:"EYJ-112"});
  assert.equal((await edp.getPaymentStatement(admin,third)).statement.service_invoice_id,main.id);
  assert.equal((await receivables.listReceivables(admin,"e_y_j")).length,2);
  await finance.voidInvoice(admin,main.id,"Documento anulado por cliente");
  assert.equal((await edp.getPaymentStatement(admin,third)).statement.service_invoice_id,null);
  assert.equal((await receivables.listReceivables(admin,"e_y_j")).length,1);

  const [already]=await db.query<{id:string}>(`INSERT INTO extra_receivable_invoices
    (issuer,client_id,invoice_number,issued_on,due_on,total_clp,created_by)
    VALUES('e_y_j',$1,'EYJ-113','2026-10-13','2026-10-28',119000,$2) RETURNING id`,[client.id,user.id]);
  const fourth=await approved("05");
  await edp.linkStatementInvoice(admin,fourth,{...invoice,invoice_number:"EYJ-113"});
  assert.equal((await edp.getPaymentStatement(admin,fourth)).statement.receivable_invoice_id,already.id,
    "reutiliza el folio registrado previamente en cobranza");
  assert.equal((await receivables.listReceivables(admin,"e_y_j")).length,2);
  await charges.voidExtraReceivableInvoice(admin,already.id,"Folio ajeno a este cobro");
  assert.equal((await edp.getPaymentStatement(admin,fourth)).statement.receivable_invoice_id,null);
});
