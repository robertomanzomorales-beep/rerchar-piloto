import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("ingresos, facturas y seguimiento conservan cálculos, permisos y respaldos",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const materials=await import("../lib/materials");
  const invoices=await import("../lib/supplier-invoices");
  const files=await import("../lib/operation-files");
  const ledger=await import("../lib/service-ledger");
  const guides=await import("../lib/guides");
  const fs=await import("node:fs/promises");
  for(const name of (await fs.readdir(resolve(process.cwd(),"db"))).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [ca,cb]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Empresa A'),('Empresa B') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena A') RETURNING id",[ca.id]);
  const [admin,customer,outsider]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role,client_id)
    VALUES('admin@demo.cl','Admin','h','admin',null),('a@demo.cl','Cliente A','h','cliente',$1),
    ('b@demo.cl','Cliente B','h','cliente',$2) RETURNING id`,[ca.id,cb.id]);
  const owner:Actor={id:admin.id,name:"Admin",email:"admin@demo.cl",role:"admin",client_id:null};
  const viewer:Actor={id:customer.id,name:"A",email:"a@demo.cl",role:"cliente",client_id:ca.id};
  const stranger:Actor={id:outsider.id,name:"B",email:"b@demo.cl",role:"cliente",client_id:cb.id};
  const [service]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,created_by)
    VALUES($1,$2,$3,'retiro','Cobre','Faena','Destino',$4) RETURNING id`,[randomUUID(),ca.id,site.id,owner.id]);
  const receipt=await materials.createMaterialReceipt(owner,{client_id:ca.id,service_id:service.id,kind:"ingreso",
    movement_on:"2026-09-25",site_name:"Faena A",weighing_ticket:"TK-1",material_name:"Cobre",
    supplier_kg:"1200",rerchar_kg:"1180",impurity_kg:"80",net_basis:"rerchar",net_reported_kg:"1100",
    unit_price_clp:"150",payment_status:"pendiente"});
  assert.equal(materials.materialAmounts(await materials.getMaterialReceipt(viewer,receipt)).total_clp,165000);
  assert.equal((await materials.listMaterialReceipts(stranger)).length,0);
  await assert.rejects(()=>materials.getMaterialReceipt(stranger,receipt),materials.MaterialError);
  await assert.rejects(()=>materials.createMaterialReceipt(owner,{client_id:ca.id,kind:"ingreso",movement_on:"2026-09-25",
    site_name:"Faena A",weighing_ticket:"TK-2",material_name:"Cobre",supplier_kg:"1200",rerchar_kg:"1180",
    impurity_kg:"80",net_basis:"rerchar",net_reported_kg:"950"}),materials.MaterialError);

  const pdf=new File([Buffer.from("%PDF-1.4\nmock")],"ticket.pdf",{type:"application/pdf"});
  const fileId=await files.addOperationFile(owner,"receipt",receipt,"ticket",pdf);
  assert.equal((await files.getOperationFile(viewer,fileId))?.filename,"ticket.pdf");
  assert.equal(await files.getOperationFile(stranger,fileId),null);

  const invoice=await invoices.createSupplierInvoice(owner,{issuer:"e_y_j",supplier_tax_id:"76.123.456-7",supplier_name:"Proveedor",
    invoice_number:"123",issued_on:"2026-09-20",due_on:"2026-10-20",description:"Insumo mensual",net_clp:"10000",
    vat_clp:"1900",total_clp:"11900",cost_area:"Flota"});
  await assert.rejects(()=>invoices.getSupplierInvoice(viewer,invoice),invoices.SupplierInvoiceError);
  const key=randomUUID();
  const payment=await invoices.registerSupplierPayment(owner,invoice,{submission_key:key,amount_clp:"5000",paid_on:"2026-09-25",reference:"Transferencia 123"});
  assert.equal(await invoices.registerSupplierPayment(owner,invoice,{submission_key:key,amount_clp:"5000",paid_on:"2026-09-25",reference:"Transferencia 123"}),payment);
  await assert.rejects(()=>invoices.registerSupplierPayment(owner,invoice,{submission_key:randomUUID(),amount_clp:"7000",paid_on:"2026-09-25",reference:"Exceso"}),invoices.SupplierInvoiceError);
  assert.equal((await invoices.getSupplierInvoice(owner,invoice)).invoice.paid_clp,"5000.00");

  await ledger.saveGuideFollowup(owner,service.id,{requested_on:"2026-09-20",received_on:"2026-09-24",documents_sent_on:"",notes:"En revisión"});
  await ledger.saveCommercialDetails(owner,service.id,{quote_reference:"COT-1",order_reference:"OC-2",sidrep:"SID-3",rental_days:"3",quantity:"1",service_value_clp:"20000"});
  assert.equal((await ledger.getServiceLedger(viewer,service.id)).commercial?.sidrep,"SID-3");
  await assert.rejects(()=>ledger.getServiceLedger(stranger,service.id),ledger.LedgerError);
  await assert.rejects(()=>ledger.saveGuideFollowup(owner,service.id,{requested_on:"2026-09-25",received_on:"2026-09-20"}),ledger.LedgerError);

  await guides.saveGuideControl(owner,service.id,{guide_number:"G-1",movement_date:"2026-09-25",movement_type:"venta",
    origin_kg:"100",arrival_kg:"90",destination_impurities_kg:"10",invoice_kg:"80",agreed_price_clp:"250",
    invoice_price_clp:"240",freight_company:"Transportes"});
  const [guide]=await guides.listGuideControls(viewer,service.id);
  assert.deepEqual(guides.guideValues(guide),{estimated_clp:20000,billed_clp:19200,variance_clp:800});
  await guides.saveGuideControl(owner,service.id,{guide_number:"G-1",movement_date:"2026-09-25",movement_type:"venta",invoice_price_clp:"250"});
  const [updated]=await guides.listGuideControls(viewer,service.id);
  assert.equal(updated.arrival_kg,"90.00");
  assert.equal(updated.freight_company,"Transportes");
  assert.equal(guides.guideValues(updated).variance_clp,0);
});
