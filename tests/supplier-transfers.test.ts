import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("solicitud, aprobación, ejecución y verificación requieren personas y respaldos distintos y aplican un solo pago por empresa",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const {createSupplierInvoice,getSupplierInvoice,registerSupplierPayment}=await import("../lib/supplier-invoices");
  const {addOperationFile}=await import("../lib/operation-files");
  const transfers=await import("../lib/supplier-transfers");
  const {listFinancialTransactions}=await import("../lib/financial-transactions");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const users=await db.query<{id:string;name:string;email:string;role:"admin"|"operaciones"}>(`INSERT INTO users(email,name,password_hash,role)
    VALUES('solicita@demo.cl','Solicita','h','admin'),('aprueba@demo.cl','Aprueba','h','admin'),
    ('observa@demo.cl','Observa','h','operaciones') RETURNING id,name,email,role`);
  const [requester,approver,viewer]=users.map(u=>({...u,client_id:null}) as Actor);
  const data={supplier_tax_id:"76.123.456-7",supplier_name:"Proveedor A",issued_on:"2026-10-01",
    due_on:"2026-10-20",description:"Insumos",total_clp:"10000"};
  const invoice=await createSupplierInvoice(requester,{...data,issuer:"rerchar",invoice_number:"R-1"});
  const other=await createSupplierInvoice(requester,{...data,issuer:"e_y_j",invoice_number:"E-1"});
  const request={submission_key:randomUUID(),amount_clp:"6000",bank_name:"Banco A",account_type:"corriente",account_number:"1234567890"};
  await assert.rejects(()=>transfers.requestSupplierTransfer(viewer,invoice,request),transfers.SupplierTransferError);
  const id=await transfers.requestSupplierTransfer(requester,invoice,request);
  assert.equal(await transfers.requestSupplierTransfer(requester,invoice,request),id);
  await assert.rejects(()=>transfers.requestSupplierTransfer(requester,invoice,{...request,submission_key:randomUUID(),amount_clp:"5000"}),/saldo disponible/);
  await assert.rejects(()=>registerSupplierPayment(requester,invoice,{submission_key:randomUUID(),amount_clp:"1",paid_on:"2026-10-13",reference:"Manual"}),/transferencias pendientes/);
  await assert.rejects(()=>transfers.decideSupplierTransfer(requester,id,"aprobada",""),/propia transferencia/);
  await assert.rejects(()=>transfers.decideSupplierTransfer(approver,id,"aprobada",""),/factura original/);
  const pdf=new File([Buffer.from("%PDF-1.4\nfactura")],"factura.pdf",{type:"application/pdf"});
  await addOperationFile(requester,"invoice",invoice,"factura",pdf);
  await transfers.decideSupplierTransfer(approver,id,"aprobada","Revisada");
  await assert.rejects(()=>transfers.executeSupplierTransfer(approver,id,{paid_on:"2026-10-13",bank_reference:"REF-100"},pdf),/otra persona/);
  await assert.rejects(()=>transfers.executeSupplierTransfer(requester,id,{paid_on:"2026-10-13",bank_reference:"REF-100"},new File(["mal"],"mal.pdf")),/válido/);
  await transfers.executeSupplierTransfer(requester,id,{paid_on:"2026-10-13",bank_reference:"REF-100"},pdf);
  assert.equal((await getSupplierInvoice(requester,invoice)).invoice.paid_clp,"0.00","la ejecución no se cuenta como pago hasta verificar");
  await assert.rejects(()=>transfers.verifySupplierTransfer(requester,id,{checked_amount_clp:"6000",checked_reference:"REF-100",verification_note:"Comprobante revisado"}),/propio pago/);
  await assert.rejects(()=>transfers.verifySupplierTransfer(approver,id,{checked_amount_clp:"6000",checked_reference:"INCORRECTA",verification_note:"Comprobante revisado"}),/no coinciden/);
  const checked={checked_amount_clp:"6000",checked_reference:"REF-100",verification_note:"Monto, fecha y referencia comprobados"};
  const payment=await transfers.verifySupplierTransfer(approver,id,checked);
  assert.equal(await transfers.verifySupplierTransfer(approver,id,checked),payment,"la repetición conserva el pago único");
  assert.equal((await getSupplierInvoice(requester,invoice)).invoice.paid_clp,"6000.00");
  assert.equal((await db.query<{count:string}>("SELECT count(*)::text AS count FROM supplier_invoice_payments WHERE invoice_id=$1",[invoice]))[0].count,"1");
  assert.equal((await transfers.supplierTransferProof(requester,id))?.filename,"factura.pdf");
  const rerchar=await listFinancialTransactions(requester,"rerchar","salida");
  assert.equal(rerchar.length,1);assert.equal(rerchar[0].verification,"verificada");assert.equal(rerchar[0].transfer_id,id);
  assert.equal((await listFinancialTransactions(requester,"e_y_j","salida")).length,0);
  assert.equal((await transfers.supplierTransferOverview(requester,"rerchar")).verificadas,"1");
  const second=await transfers.requestSupplierTransfer(requester,other,{...request,submission_key:randomUUID(),amount_clp:"3000"});
  await transfers.decideSupplierTransfer(approver,second,"rechazada","Cuenta incorrecta");
  assert.equal((await transfers.listSupplierTransfers(requester,"e_y_j"))[0].status,"rechazada");
  assert.equal((await getSupplierInvoice(requester,other)).invoice.paid_clp,"0.00");
});
