import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("compras, facturas y Kardex permiten recorrer todo el historial sin omisiones",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const supply=await import("../lib/supply");
  const invoices=await import("../lib/supplier-invoices");
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(`db/${name}`,"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('history@example.invalid','Admin','h','admin') RETURNING id");
  const actor:Actor={id:user.id,email:"history@example.invalid",name:"Admin",role:"admin",client_id:null};
  const driver:Actor={...actor,role:"conductor"};
  await db.query(`INSERT INTO purchase_requests(submission_key,title,category,priority,status,requested_by,created_at)
    SELECT gen_random_uuid(),'Compra histórica '||n,'insumos','normal',CASE WHEN n%2=0 THEN 'solicitada' ELSE 'ordenada' END,$1,'2026-11-01'
    FROM generate_series(1,235) n`,[user.id]);
  const first=await supply.listPurchases(actor,"",100,0);
  assert.equal(first.length,100,"se debe poder solicitar una página, sin quedar limitado a las últimas 150 compras");
  const purchases=[...first,...await supply.listPurchases(actor,"",100,100),...await supply.listPurchases(actor,"",100,200)];
  assert.equal(purchases.length,235);assert.equal(new Set(purchases.map(row=>row.id)).size,235);
  assert.deepEqual(await supply.purchaseOverview(actor),{total:"235",pending:"117",delivery:"118"});
  assert.equal((await supply.purchaseOverview(actor,"solicitada")).total,"117");
  assert.ok((await supply.listPurchases(actor,"solicitada",100,100)).every(row=>row.status==="solicitada"));
  await assert.rejects(()=>supply.purchaseOverview(driver),supply.SupplyError);

  await db.query(`INSERT INTO supplier_invoices(issuer,supplier_tax_id,supplier_name,invoice_number,issued_on,due_on,description,total_clp,recorded_by,created_at)
    SELECT CASE WHEN n<=425 THEN 'rerchar' ELSE 'e_y_j' END,'76347909-9','Proveedor histórico','H-'||n,'2026-11-01','2026-11-10','Histórico de factura',1000,$1,'2026-11-01'
    FROM generate_series(1,462) n`,[user.id]);
  const invoiceRows=[];
  for(let offset=0;offset<425;offset+=100)invoiceRows.push(...await invoices.listSupplierInvoices(actor,"rerchar","vencidas","2026-11-18",100,offset));
  assert.equal(invoiceRows.length,425);assert.equal(new Set(invoiceRows.map(row=>row.id)).size,425);
  assert.equal(await invoices.supplierInvoiceCount(actor,"rerchar","vencidas","2026-11-18"),425);
  assert.equal(await invoices.supplierInvoiceCount(actor,"e_y_j","vencidas","2026-11-18"),37);
  assert.equal(await invoices.supplierInvoiceCount(actor,"rerchar","pagadas","2026-11-18"),0);
  assert.equal(Number((await invoices.supplierInvoiceOverview(actor,"rerchar","2026-11-18")).outstanding),425000);
  await assert.rejects(()=>invoices.supplierInvoiceCount(driver,"rerchar"),invoices.SupplierInvoiceError);

  const warehouse=await supply.createWarehouse(actor,{code:"H-01",name:"Histórico principal"});
  const other=await supply.createWarehouse(actor,{code:"H-02",name:"Histórico secundario"});
  const item=await supply.createStockItem(actor,{code:"H-ART",name:"Artículo histórico",unit:"un",minimum_qty:"0"});
  await db.query(`INSERT INTO inventory_movements(item_id,warehouse_id,kind,qty_delta,note,created_by,created_at)
    SELECT $1,CASE WHEN n<=235 THEN $2::uuid ELSE $3::uuid END,'ajuste_entrada',1,'Movimiento '||n,$4,'2026-11-01'
    FROM generate_series(1,242) n`,[item,warehouse,other,user.id]);
  await db.query(`INSERT INTO inventory_reservations(item_id,warehouse_id,quantity,reason,created_by,created_at)
    SELECT $1,$2,1,'Reserva '||n,$3,'2026-11-01' FROM generate_series(1,135) n`,[item,warehouse,user.id]);
  const pages=await Promise.all([1,2,3].map(page=>supply.listInventory(actor,item,warehouse,page,Math.min(page,2))));
  const moves=pages.flatMap(page=>page.movements);
  assert.equal(moves.length,235);assert.equal(new Set(moves.map(row=>row.id)).size,235);
  assert.ok(pages.every(page=>page.movementCount===235&&page.reservationCount===135));
  const reservations=[...pages[0].reservations,...pages[1].reservations];
  assert.equal(reservations.length,135);assert.equal(new Set(reservations.map(row=>row.id)).size,135);
  assert.equal((await supply.listInventory(actor,item,other)).movementCount,7);
  assert.equal((await supply.listInventory(actor,item,warehouse,4)).movements.length,0);
  await assert.rejects(()=>supply.listInventory(driver,item,warehouse,2),supply.SupplyError);
});
