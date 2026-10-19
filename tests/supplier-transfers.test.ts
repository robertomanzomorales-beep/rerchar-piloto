import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("solicitud, aprobación, ejecución y verificación requieren personas y respaldos distintos y aplican un solo pago por empresa",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const {createSupplierInvoice,getSupplierInvoice,registerSupplierPayment,reviewSupplierInvoice}=await import("../lib/supplier-invoices");
  const {addOperationFile}=await import("../lib/operation-files");
  const counterparties=await import("../lib/counterparties");
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
  const profileInput={kind:"proveedor",legal_name:"Proveedor A",tax_id:"76.347.909-9",business_activity:"Insumos industriales",
    legal_address:"Calle Principal 123",locality:"Santiago",phone:"+56222223333",general_email:"proveedor@demo.cl",
    tax_status:"afecto",legal_representative:"Representante Legal",invoice_email:"facturas@demo.cl",
    payment_terms:"30",requires_oc:"no",requires_hes:"no",requires_edp:"no",bank_name:"Banco Verificado",
    account_type:"corriente",account_number:"9988776655",account_holder:"Proveedor A",
    account_holder_tax_id:"76.347.909-9",proof_email:"comprobantes@demo.cl",
    contacts:["compras","servicios","contabilidad","operaciones","prevencion"].map(area=>({area}))};
  const profileId=await counterparties.saveCounterparty(requester,profileInput);
  const document=new File([Buffer.from("%PDF-1.4\nrespaldo")],"respaldo.pdf",{type:"application/pdf"});
  for(const kind of ["rut_empresa","certificado_bancario","carpeta_tributaria"])
    await counterparties.uploadCounterpartyDocument(requester,profileId,kind,document);
  assert.equal((await counterparties.getCounterparty(requester,profileId)).documents.length,3);
  await assert.rejects(()=>counterparties.getCounterparty(viewer,profileId),/Sólo administración/);
  await assert.rejects(()=>counterparties.verifyCounterparty(requester,profileId),/Otra persona/);
  await counterparties.verifyCounterparty(approver,profileId);
  const supply=await import("../lib/supply");
  const stock=await supply.createStockItem(requester,{code:"REP-OC",name:"Repuesto para OC",unit:"un",minimum_qty:"0"});
  const purchaseId=await supply.createPurchase(requester,{submission_key:randomUUID(),title:"Compra con ficha verificada",
    category:"repuestos",priority:"normal",item_id:stock,quantity:"2",notes:"Proveedor validado por Carol"});
  await supply.approvePurchase(approver,purchaseId);
  const purchaseLine=(await supply.getPurchase(requester,purchaseId)).lines[0];
  const draft={supplier_profile_id:profileId,supplier:"",supplier_tax_id:"99.999.999-9",supplier_address:"Domicilio incorrecto",
    payment_terms:"",issuer:"rerchar",expected_date:"",vat_rate:"0.19",prices:{[purchaseLine.id]:"5000"},discounts:{}};
  await assert.rejects(()=>supply.savePurchaseDraft(requester,purchaseId,{...draft,supplier_profile_id:randomUUID()}),/ficha de proveedor verificada/);
  await supply.savePurchaseDraft(requester,purchaseId,draft);
  const purchase=(await supply.getPurchase(requester,purchaseId)).purchase;
  assert.equal(purchase.supplier_profile_id,profileId);
  assert.equal(purchase.supplier,"Proveedor A");
  assert.equal(purchase.supplier_tax_id,"76347909-9");
  assert.equal(purchase.supplier_address,"Calle Principal 123");
  assert.equal(purchase.payment_terms,"Crédito 30 días");
  await counterparties.saveCounterparty(requester,{...profileInput,id:profileId,legal_address:"Calle Principal 456"});
  await assert.rejects(()=>supply.issuePurchaseDraft(requester,purchaseId,"EMITIR"),/pendiente de revisión/);
  await counterparties.verifyCounterparty(approver,profileId);
  await assert.rejects(()=>supply.issuePurchaseDraft(requester,purchaseId,"EMITIR"),/ficha del proveedor cambió/);
  await supply.savePurchaseDraft(requester,purchaseId,draft);
  assert.equal((await supply.getPurchase(requester,purchaseId)).purchase.supplier_address,"Calle Principal 456");
  await supply.issuePurchaseDraft(requester,purchaseId,"EMITIR");
  assert.equal((await supply.getPurchase(requester,purchaseId)).purchase.order_reference,"OC-RER-000001");
  const fromOrder={issuer:"rerchar",invoice_number:"R-OC",purchase_id:purchaseId,issued_on:"2026-10-01",
    description:"Repuestos de la OC",total_clp:"10000",supplier_tax_id:"",supplier_name:""};
  await assert.rejects(()=>createSupplierInvoice(requester,{...fromOrder,supplier_profile_id:randomUUID()}),/misma ficha/);
  const linkedInvoice=await createSupplierInvoice(requester,fromOrder);
  assert.equal((await getSupplierInvoice(requester,linkedInvoice)).invoice.supplier_profile_id,profileId);
  assert.equal((await getSupplierInvoice(requester,linkedInvoice)).invoice.supplier_tax_id,"76347909-9");
  const data={supplier_tax_id:"76.347.909-9",supplier_name:"Proveedor A",issued_on:"2026-10-01",
    due_on:"2026-10-20",description:"Insumos",total_clp:"10000"};
  const invoice=await createSupplierInvoice(requester,{...data,issuer:"rerchar",invoice_number:"R-1",supplier_profile_id:profileId});
  const other=await createSupplierInvoice(requester,{...data,issuer:"e_y_j",invoice_number:"E-1",supplier_profile_id:profileId});
  const request={submission_key:randomUUID(),amount_clp:"6000",bank_name:"Banco A",account_type:"corriente",account_number:"1234567890"};
  await assert.rejects(()=>transfers.requestSupplierTransfer(viewer,invoice,request),transfers.SupplierTransferError);
  await assert.rejects(()=>transfers.requestSupplierTransfer(requester,invoice,request),/Revise y acepte/);
  await reviewSupplierInvoice(approver,invoice,{decision:"disputada",note:"Monto no coincide con orden"});
  await assert.rejects(()=>transfers.requestSupplierTransfer(requester,invoice,request),/Revise y acepte/);
  const pdf=new File([Buffer.from("%PDF-1.4\nfactura")],"factura.pdf",{type:"application/pdf"});
  await assert.rejects(()=>reviewSupplierInvoice(approver,invoice,{decision:"aceptada",note:""}),/factura original/);
  await addOperationFile(requester,"invoice",invoice,"factura",pdf);
  await reviewSupplierInvoice(approver,invoice,{decision:"aceptada",note:"Folio y montos correctos"});
  const id=await transfers.requestSupplierTransfer(requester,invoice,request);
  assert.equal((await transfers.invoiceSupplierTransfers(requester,invoice))[0].account_number,"9988776655",
    "la cuenta de la solicitud proviene de la ficha verificada, aunque el formulario envíe otro número");
  assert.equal(await transfers.requestSupplierTransfer(requester,invoice,request),id);
  await assert.rejects(()=>transfers.requestSupplierTransfer(requester,invoice,{...request,submission_key:randomUUID(),amount_clp:"5000"}),/saldo disponible/);
  await assert.rejects(()=>registerSupplierPayment(requester,invoice,{submission_key:randomUUID(),amount_clp:"1",paid_on:"2026-10-13",reference:"Manual"}),/transferencias pendientes/);
  await assert.rejects(()=>transfers.decideSupplierTransfer(requester,id,"aprobada",""),/propia transferencia/);
  await assert.rejects(()=>reviewSupplierInvoice(approver,invoice,{decision:"disputada",note:"Nueva observación de importe"}),/transferencias en curso/);
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
  await addOperationFile(requester,"invoice",other,"factura",pdf);
  await reviewSupplierInvoice(approver,other,{decision:"aceptada",note:"Factura contrastada"});
  const second=await transfers.requestSupplierTransfer(requester,other,{...request,submission_key:randomUUID(),amount_clp:"3000"});
  await transfers.decideSupplierTransfer(approver,second,"rechazada","Cuenta incorrecta");
  assert.equal((await transfers.listSupplierTransfers(requester,"e_y_j"))[0].status,"rechazada");
  assert.equal((await getSupplierInvoice(requester,other)).invoice.paid_clp,"0.00");
  const stale=await transfers.requestSupplierTransfer(requester,other,{...request,submission_key:randomUUID(),amount_clp:"1000"});
  await counterparties.saveCounterparty(requester,{...profileInput,id:profileId,account_number:"1122334455"});
  await assert.rejects(()=>createSupplierInvoice(requester,{...fromOrder,invoice_number:"R-OC-2"}),/ficha de proveedor verificada/);
  await assert.rejects(()=>transfers.decideSupplierTransfer(approver,stale,"aprobada","Revisada"),/ficha bancaria cambió/);
  await transfers.decideSupplierTransfer(approver,stale,"rechazada","Cuenta reemplazada");
  await assert.rejects(()=>transfers.requestSupplierTransfer(requester,other,{...request,submission_key:randomUUID()}),/verifique la ficha bancaria/);
});
