import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("venta de material comparte un folio real, cobra el saldo y anula sin perder la guía",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const guides=await import("../lib/material-guides");
  const billing=await import("../lib/material-sale-billing");
  const receivables=await import("../lib/receivables");
  const extra=await import("../lib/extra-charges");
  const {rercharMaterialDashboard}=await import("../lib/company-dashboard");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [client,another]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Metal Norte'),('Otro comprador') RETURNING id");
  const [owner,operator]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role)
    VALUES('material@demo.cl','Administración','h','admin'),('operador@demo.cl','Operaciones','h','operaciones') RETURNING id`);
  const actor:Actor={id:owner.id,name:"Administración",email:"material@demo.cl",role:"admin",client_id:null};
  const ops:Actor={id:operator.id,name:"Operaciones",email:"operador@demo.cl",role:"operaciones",client_id:null};
  const input={submission_key:randomUUID(),guide_number:"M-101",movement_on:"2026-10-02",movement_type:"venta",
    counterparty_id:client.id,origin:"Faena",destination:"Comprador",line_number:"1",material_name:"Fierro",
    origin_kg:"100",arrival_kg:"100",invoice_kg:"90",invoice_price_clp:"100",invoice_number:"R-900",invoice_issued_on:"2026-10-03"};
  const guideId=await guides.createMaterialGuide(actor,input);
  const secondId=await guides.saveMaterialGuideItem(actor,guideId,{line_number:"2",material_name:"Aluminio",origin_kg:"30",arrival_kg:"30"});
  const itemId=(await guides.getMaterialGuide(actor,guideId)).items[0].id;
  const invoice={invoice_number:"R-900",issued_on:"2026-10-03",due_on:"2026-10-13",total_clp:"11900"};
  await assert.rejects(()=>billing.linkMaterialSaleInvoice(ops,guideId,itemId,invoice),billing.MaterialSaleBillingError);
  await assert.rejects(()=>billing.linkMaterialSaleInvoice(actor,guideId,itemId,{...invoice,total_clp:""}),/total real/);
  const invoiceId=await billing.linkMaterialSaleInvoice(actor,guideId,itemId,invoice);
  assert.equal(await billing.linkMaterialSaleInvoice(actor,guideId,secondId,invoice),invoiceId,"dos materiales comparten el total del documento");
  assert.equal((await db.query<{n:string}>("SELECT count(*)::text AS n FROM extra_receivable_invoices WHERE invoice_number='R-900'"))[0].n,"1");
  assert.equal((await receivables.receivablesOverview(actor,"rerchar","2026-10-14")).outstanding,"11900.00");
  const [row]=await receivables.listReceivables(actor,"rerchar");
  assert.equal(row.source,"material");assert.equal(row.guide_id,guideId);assert.equal(row.guide_count,"1");
  assert.equal((await receivables.listReceivables(actor,"e_y_j")).length,0,"la venta no aparece en otra empresa");
  assert.equal((await guides.getMaterialGuide(actor,guideId)).guide.missing_payment,"2");
  assert.equal((await rercharMaterialDashboard()).guides.pending,"1");
  await assert.rejects(()=>guides.saveMaterialGuideItem(actor,guideId,{item_id:itemId,line_number:"1",material_name:"Fierro",
    origin_kg:"100",invoice_number:"R-901",invoice_issued_on:"2026-10-03",invoice_status:"pendiente"}),guides.MaterialGuideError);
  const header={movement_on:"2026-10-02",counterparty_id:another.id,origin:"Faena",destination:"Comprador"};
  await assert.rejects(()=>guides.updateMaterialGuide(actor,guideId,header),guides.MaterialGuideError);
  const secondGuide=await guides.createMaterialGuide(actor,{...input,submission_key:randomUUID(),guide_number:"M-102",counterparty_id:another.id,invoice_number:""});
  const otherItem=(await guides.getMaterialGuide(actor,secondGuide)).items[0].id;
  await assert.rejects(()=>billing.linkMaterialSaleInvoice(actor,secondGuide,otherItem,invoice),billing.MaterialSaleBillingError);
  await extra.registerExtraReceivablePayment(actor,invoiceId,{submission_key:randomUUID(),amount_clp:"5000",paid_on:"2026-10-10",reference:"Transferencia"});
  assert.equal((await receivables.receivablesOverview(actor,"rerchar","2026-10-14")).outstanding,"6900.00");
  assert.equal((await billing.getMaterialSaleInvoices(actor,guideId))[0].paid_clp,"5000.00");
  await assert.rejects(()=>extra.voidExtraReceivableInvoice(actor,invoiceId,"Documento errado"),extra.ExtraChargeError);
  await extra.registerExtraReceivablePayment(actor,invoiceId,{submission_key:randomUUID(),amount_clp:"6900",paid_on:"2026-10-11",reference:"Saldo"});
  assert.equal((await guides.getMaterialGuide(actor,guideId)).guide.missing_payment,"0");
  assert.equal((await rercharMaterialDashboard()).guides.pending,"1","queda pendiente sólo la segunda guía sin factura");
  const cancelGuide=await guides.createMaterialGuide(actor,{...input,submission_key:randomUUID(),guide_number:"M-103",invoice_number:""});
  const cancelItem=(await guides.getMaterialGuide(actor,cancelGuide)).items[0].id;
  const cancelInvoice=await billing.linkMaterialSaleInvoice(actor,cancelGuide,cancelItem,{...invoice,invoice_number:"R-901"});
  await extra.voidExtraReceivableInvoice(actor,cancelInvoice,"Folio mal registrado");
  assert.equal((await guides.getMaterialGuide(actor,cancelGuide)).items[0].receivable_invoice_id,null);
  assert.equal((await receivables.listReceivables(actor,"rerchar")).length,1);
});
