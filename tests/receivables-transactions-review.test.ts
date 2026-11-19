import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";
import type {Company} from "../lib/companies";

test("cobranzas y transacciones conservan centavos, contexto e historial completo",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),charges=await import("../lib/extra-charges"),receivables=await import("../lib/receivables"),transactions=await import("../lib/financial-transactions"),finance=await import("../lib/finance");
  for(const name of (await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('receivables-review@example.invalid','Administración','h','admin') RETURNING id"),actor:Actor={...user,role:"admin",name:"Administración",email:"receivables-review@example.invalid",client_id:null};
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente revisión cobranza') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena revisión') RETURNING id",[client.id]);
  const [asset]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES('CAM-TR-REV','Camión de revisión','camion') RETURNING id");
  const services:Record<string,string>={},accounts:Record<string,string>={};
  async function account(company:Company,code:string,total="100000"){
    return (await db.query<{id:string}>("INSERT INTO extra_receivable_invoices(issuer,client_id,invoice_number,issued_on,due_on,total_clp,created_by) VALUES($1,$2,$3,'2020-01-01','2020-02-01',$4,$5) RETURNING id",[company,client.id,code,total,actor.id]))[0].id;
  }
  for(const company of ["rerchar","e_y_j"] as const){
    const contract=await finance.createContract(actor,{client_id:client.id,site_id:site.id,operating_company:company,code:"TR-"+company,starts_on:"2020-01-01",ends_on:"",notes:""});
    const rate=await finance.createTariff(actor,{contract_id:contract,service_type:"retiro",waste_type:"",unit:"servicio",unit_price_clp:"100.25",valid_from:"2020-01-01",valid_until:""});
    const [service]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,closed_at,created_by)
      VALUES(gen_random_uuid(),$1,$2,$3,'retiro','Metal','Faena','Patio','completada','2020-01-02T15:00:00Z',$4) RETURNING id`,[client.id,site.id,company,actor.id]);services[company]=service.id;
    await db.query("INSERT INTO service_day_reports(service_id,day,asset_id,outcome,observation,recorded_by) VALUES($1,'2020-01-02',$2,'incompleto','Espera documentada',$3)",[service.id,asset.id,actor.id]);
    await finance.valueService(actor,service.id,{tariff_id:rate,client_order_reference:""});
    const main=await finance.registerInvoice(actor,service.id,{invoice_number:"SERV-TR-"+company,issued_on:"2020-01-01",due_on:"2020-02-01",total_clp:"100000"});
    await db.query(`INSERT INTO invoice_payments(submission_key,invoice_id,amount_clp,paid_on,method,reference,created_by,created_at)
      SELECT gen_random_uuid(),$1,0.10,'2020-01-02','efectivo','Servicio histórico '||n,$2,'2020-01-02' FROM generate_series(1,317) n`,[main,actor.id]);
    accounts[company]=await account(company,"CTA-TR-"+company);
    await db.query(`INSERT INTO extra_receivable_payments(submission_key,invoice_id,amount_clp,paid_on,reference,created_by,created_at)
      SELECT gen_random_uuid(),$1,0.20,'2020-01-02','Cobro histórico '||n,$2,'2020-01-02' FROM generate_series(1,211) n`,[accounts[company],actor.id]);
    const [supplier]=await db.query<{id:string}>(`INSERT INTO supplier_invoices(issuer,supplier_tax_id,supplier_name,invoice_number,issued_on,description,total_clp,recorded_by)
      VALUES($1,'RUT-PRUEBA','Proveedor de revisión',$2,'2020-01-01','Revisión de movimientos',100000,$3) RETURNING id`,[company,"PROV-TR-"+company,actor.id]);
    await db.query(`INSERT INTO supplier_invoice_payments(submission_key,invoice_id,amount_clp,paid_on,reference,recorded_by,created_at)
      SELECT gen_random_uuid(),$1,0.25,'2020-01-02','Pago histórico '||n,$2,'2020-01-02' FROM generate_series(1,239) n`,[supplier.id,actor.id]);
  }
  await t.test("más de quinientos movimientos por empresa permanecen accesibles, ordenados y sumados sin recorte",async()=>{
    for(const company of ["rerchar","e_y_j"] as const){
      const full=await transactions.listFinancialTransactions(actor,company);assert.equal(full.length,767);
      const seen:string[]=[];for(let offset=0;offset<800;offset+=100){const page=await transactions.listFinancialTransactionsPage(actor,company,"",100,offset);assert.equal(page.total,767);assert.equal(Number(page.incoming),73.9);assert.equal(Number(page.outgoing),59.75);seen.push(...page.items.map(r=>r.source+":"+r.id));}
      assert.deepEqual(seen,full.map(r=>r.source+":"+r.id));assert.equal(new Set(seen).size,767);
      assert.deepEqual(full.map(r=>r.id),(await transactions.listFinancialTransactions(actor,company)).map(r=>r.id));
      assert.ok(full.filter(r=>r.source==="servicio").every(r=>r.service_id===services[company]));
    }
    const all=await transactions.listFinancialTransactionsPage(actor,"","",100,0);assert.equal(all.total,1534);assert.equal(Number(all.incoming),147.8);assert.equal(Number(all.outgoing),119.5);
  });
  await t.test("los filtros de entradas y salidas mantienen totales completos y el alcance de empresa",async()=>{
    const input=await transactions.listFinancialTransactionsPage(actor,"rerchar","entrada",100,500),output=await transactions.listFinancialTransactionsPage(actor,"e_y_j","salida",100,200);
    assert.equal(input.total,528);assert.equal(input.items.length,28);assert.equal(Number(input.incoming),73.9);assert.equal(Number(input.outgoing),0);assert.ok(input.items.every(r=>r.company==="rerchar"&&r.direction==="entrada"));
    assert.equal(output.total,239);assert.equal(output.items.length,39);assert.equal(Number(output.incoming),0);assert.equal(Number(output.outgoing),59.75);
    await assert.rejects(()=>transactions.listFinancialTransactionsPage({...actor,role:"operaciones"}));
  });
  let decimal="",firstPayment="";const payment={submission_key:randomUUID(),amount_clp:"0.10",paid_on:"2020-01-02",reference:"Primer abono exacto"};
  await t.test("un abono de 0,10 y otro de 0,20 saldan exactamente una factura de 0,30",async()=>{
    decimal=await account("rerchar","DECIMAL-REV","0.30");firstPayment=await charges.registerExtraReceivablePayment(actor,decimal,payment,"rerchar");
    await charges.registerExtraReceivablePayment(actor,decimal,{...payment,submission_key:randomUUID(),amount_clp:"0.20",reference:"Saldo exacto"},"rerchar");
    const row=await receivables.getReceivableInvoice(actor,"rerchar",decimal);assert.equal(row?.paid_clp,"0.30");assert.equal(row?.total_clp,"0.30");
    await assert.rejects(()=>charges.registerExtraReceivablePayment(actor,decimal,{...payment,submission_key:randomUUID(),amount_clp:"0.01"},"rerchar"),/supera/);
  });
  await t.test("los reintentos exactos se reconocen y los datos cambiados se rechazan",async()=>{
    assert.equal(await charges.registerExtraReceivablePayment(actor,decimal,payment,"rerchar"),firstPayment);
    for(const change of [{amount_clp:"0.11"},{paid_on:"2020-01-03"},{reference:"Otro respaldo"}])await assert.rejects(()=>charges.registerExtraReceivablePayment(actor,decimal,{...payment,...change},"rerchar"),/otros datos/);
    assert.equal((await db.query<{n:string}>("SELECT count(*)::text n FROM extra_receivable_payments WHERE invoice_id=$1",[decimal]))[0].n,"2");
  });
  let legacy="",unpaid="";
  await t.test("el origen seleccionado queda visible tras conciliar o anular y no se modifica desde la otra empresa",async()=>{
    unpaid=await account("rerchar","ANULAR-REV");
    await assert.rejects(()=>charges.registerExtraReceivablePayment(actor,unpaid,{...payment,submission_key:randomUUID()},"e_y_j"),/no está vigente/);
    await assert.rejects(()=>charges.voidExtraReceivableInvoice(actor,unpaid,"Documento de otra empresa","e_y_j"),/no vigente/);
    assert.equal(await receivables.getReceivableInvoice(actor,"e_y_j",unpaid),undefined);
    const [row]=await db.query<{id:string}>(`INSERT INTO service_extra_charges(submission_key,service_id,service_day,kind,reason,source_outcome,source_observation,amount_clp,status,decision_note,invoice_number,invoiced_on,created_by,decided_by,decided_at)
      VALUES(gen_random_uuid(),$1,'2020-01-02','sobrestadia','Espera anterior por conciliar','incompleto','Espera documentada',10,'facturado','Autorizado','LEG-REV','2020-01-02',$2,$2,now()) RETURNING id`,[services.rerchar,actor.id]);legacy=row.id;
    const data={invoice_number:"LEG-REV",invoiced_on:"2020-01-02",due_on:"2020-02-02",total_clp:"12.25"};
    await assert.rejects(()=>charges.invoiceExtraCharge(actor,legacy,data,"e_y_j"),/Apruebe primero/);await charges.invoiceExtraCharge(actor,legacy,data,"rerchar");
    assert.ok(!(await receivables.listLegacyReconciliation(actor,"rerchar")).some(x=>x.id===legacy));const selected=await receivables.getReconciliationCharge(actor,"rerchar",legacy);assert.ok(selected?.receivable_invoice_id);assert.equal(await receivables.getReconciliationCharge(actor,"e_y_j",legacy),undefined);
    await charges.voidExtraReceivableInvoice(actor,unpaid,"Folio registrado por error","rerchar");assert.equal((await receivables.getReceivableInvoice(actor,"rerchar",unpaid))?.status,"anulada");
    assert.ok(!(await receivables.listReceivables(actor,"rerchar")).some(r=>r.id===unpaid));
  });
  await t.test("un perfil revocado impide las tres escrituras de cobranza",async()=>{
    await db.query("UPDATE users SET active=false WHERE id=$1",[actor.id]);
    await assert.rejects(()=>charges.registerExtraReceivablePayment(actor,accounts.rerchar,{...payment,submission_key:randomUUID()}),/acceso de administración/);
    await assert.rejects(()=>charges.voidExtraReceivableInvoice(actor,unpaid,"Folio de revisión administrativa"),/acceso de administración/);
    await assert.rejects(()=>charges.invoiceExtraCharge(actor,legacy,{invoice_number:"LEG-REV",invoiced_on:"2020-01-02",due_on:"2020-02-02",total_clp:"12.25"}),/acceso de administración/);
  });
});
