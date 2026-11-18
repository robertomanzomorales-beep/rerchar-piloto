import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("una factura no se repite por puntos, espacios o minúsculas en el RUT del proveedor",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const invoices=await import("../lib/supplier-invoices");
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(`db/${name}`,"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('invoice-entry@example.invalid','Admin','h','admin') RETURNING id");
  const actor:Actor={id:user.id,name:"Admin",email:"invoice-entry@example.invalid",role:"admin",client_id:null};
  await db.query(`INSERT INTO supplier_invoices(issuer,supplier_tax_id,supplier_name,invoice_number,issued_on,description,total_clp,recorded_by)
    VALUES('rerchar','76.123.456-k','Proveedor histórico','H-01','2026-11-01','Factura histórica',1000,$1)`,[user.id]);
  const input={issuer:"rerchar",supplier_tax_id:"76123456-K",supplier_name:"Proveedor histórico",invoice_number:"H-01",
    issued_on:"2026-11-01",description:"Misma factura con otro formato",total_clp:"1000"};
  await assert.rejects(()=>invoices.createSupplierInvoice(actor,input),/ya está registrada/);
  await assert.rejects(()=>invoices.createSupplierInvoice(actor,{...input,supplier_tax_id:"76 123 456-k"}),/ya está registrada/);
  await assert.rejects(()=>invoices.createSupplierInvoice(actor,{...input,invoice_number:"INVALIDA",supplier_tax_id:"....."}),/Indique el proveedor/);
  assert.equal((await db.query("SELECT id FROM supplier_invoices WHERE issuer='rerchar' AND invoice_number='H-01'")).length,1);
  const other=await invoices.createSupplierInvoice(actor,{...input,issuer:"e_y_j",supplier_tax_id:" 76.123.456-k "});
  assert.equal((await invoices.getSupplierInvoice(actor,other)).invoice.supplier_tax_id,"76123456-K");
  await invoices.createSupplierInvoice(actor,{...input,invoice_number:"H-02"});
  assert.equal((await db.query("SELECT id FROM supplier_invoices")).length,3);
});
