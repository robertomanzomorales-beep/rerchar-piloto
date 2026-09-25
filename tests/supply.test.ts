import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Actor } from "../lib/auth";

test("compra, recepción parcial, Kardex, bodegas y reservas mantienen los saldos", async () => {
  process.env.PGLITE_DATA_DIR = "memory://";
  const { db, transaction } = await import("../lib/db");
  const supply = await import("../lib/supply");
  for (const name of ["001_piloto.sql","002_flota_y_despacho.sql","003_abastecimiento.sql","004_mantenimiento_combustible.sql","005_contenedores.sql","006_acreditacion.sql","007_finanzas.sql","008_trazabilidad_ambiental.sql","009_certificados.sql","010_evidencia_persistente.sql","011_operacion_real_2026.sql"]) {
    const sql = await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async (tx) => {
      for (const statement of sql.split(/;\s*(?:\n|$)/).map((part) => part.trim()).filter(Boolean)) await tx.query(statement);
    });
  }
  const [admin] = await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('admin@demo.cl','Administración','hash','admin') RETURNING id");
  const [operator] = await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('operaciones@demo.cl','Operaciones','hash','operaciones') RETURNING id");
  const [driver] = await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('conductor@demo.cl','Conductor','hash','conductor') RETURNING id");
  const owner: Actor = { id: admin.id, name:"Administración",email:"admin@demo.cl",role:"admin",client_id:null };
  const ops: Actor = { id: operator.id, name:"Operaciones",email:"operaciones@demo.cl",role:"operaciones",client_id:null };
  const outsider: Actor = { id: driver.id, name:"Conductor",email:"conductor@demo.cl",role:"conductor",client_id:null };
  await assert.rejects(() => supply.createWarehouse(outsider,{code:"B-01",name:"Prohibida"}), supply.SupplyError);
  await assert.rejects(() => supply.listInventory(outsider), supply.SupplyError);
  const main = await supply.createWarehouse(owner,{code:"B-01",name:"Principal"});
  const branch = await supply.createWarehouse(ops,{code:"B-02",name:"Secundaria"});
  const item = await supply.createStockItem(ops,{code:"REP-01",name:"Repuesto hidráulico",unit:"un",minimum_qty:"2"});
  const second = await supply.createStockItem(ops,{code:"EPP-01",name:"Guantes",unit:"un",minimum_qty:"5"});
  const zeroMinimum = await supply.createStockItem(ops,{code:"EPP-02",name:"Gafas",unit:"un",minimum_qty:"0"});
  assert.ok(zeroMinimum);
  const input = { submission_key:randomUUID(),title:"Repuestos y seguridad",category:"repuestos",priority:"alta",item_id:item,quantity:"10",notes:"Reparación de vehículo" };
  const purchaseId = await supply.createPurchase(ops,input);
  assert.equal(await supply.createPurchase(ops,input),purchaseId,"la misma solicitud no genera una compra adicional");
  await supply.addPurchaseLine(ops,purchaseId,{item_id:second,quantity:"4"});
  await assert.rejects(() => supply.approvePurchase(ops,purchaseId),supply.SupplyError);
  await supply.approvePurchase(owner,purchaseId);
  await assert.rejects(() => supply.addPurchaseLine(ops,purchaseId,{item_id:item,quantity:"1"}),supply.SupplyError);
  await assert.rejects(() => supply.receivePurchase(owner,purchaseId,{ submission_key:randomUUID(),line_id:randomUUID(),warehouse_id:main,quantity:"1",guide_number:"G-1",invoice_number:"",payment_status:"pendiente" }),supply.SupplyError);
  const pricing=(await supply.getPurchase(owner,purchaseId)).lines;
  await supply.orderPurchase(ops,purchaseId,{supplier:"Proveedora Uno",order_reference:"OC-2026-01",expected_date:"2026-09-28",
    issuer:"e_y_j",supplier_tax_id:"76.000.000-0",supplier_address:"Calama",payment_terms:"Crédito 30 días",vat_rate:"0.19",
    prices:Object.fromEntries(pricing.map(line=>[line.id,"1200"]))});
  const { lines } = await supply.getPurchase(owner,purchaseId);
  const firstLine = lines.find((line) => line.item_id === item)!;
  const secondLine = lines.find((line) => line.item_id === second)!;
  const part = {submission_key:randomUUID(),line_id:firstLine.id,warehouse_id:main,quantity:"6",guide_number:"G-1",invoice_number:"F-1",payment_status:"pendiente"};
  const receiptId = await supply.receivePurchase(ops,purchaseId,part);
  assert.equal(await supply.receivePurchase(ops,purchaseId,part),receiptId,"reintentar una recepción no duplica stock");
  assert.equal((await supply.getPurchase(owner,purchaseId)).purchase.status,"parcial");
  await assert.rejects(() => supply.receivePurchase(ops,purchaseId,{...part,submission_key:randomUUID(),quantity:"5"}),supply.SupplyError);
  assert.equal((await supply.getPurchase(owner,purchaseId)).lines.find((line) => line.item_id === item)?.received_qty,"6.000");
  await supply.receivePurchase(ops,purchaseId,{...part,submission_key:randomUUID(),quantity:"4",guide_number:"G-2"});
  assert.equal((await supply.getPurchase(owner,purchaseId)).purchase.status,"parcial","una línea aún queda pendiente");
  await supply.receivePurchase(ops,purchaseId,{...part,submission_key:randomUUID(),line_id:secondLine.id,quantity:"4",guide_number:"G-3"});
  const detail = await supply.getPurchase(owner,purchaseId);
  assert.equal(detail.purchase.status,"recibida");
  assert.equal(detail.receipts.length,3);
  assert.equal(detail.events.length,7);
  let inventory = await supply.listInventory(ops);
  const balance = (itemId:string,warehouseId:string) => inventory.balances.find((row) => row.item_id===itemId && row.warehouse_id===warehouseId)!;
  assert.equal(balance(item,main).quantity,"10.000");
  await supply.reserveStock(ops,{item_id:item,warehouse_id:main,quantity:"7",reason:"Servicio de prueba"});
  await assert.rejects(() => supply.transferStock(ops,{item_id:item,from_id:main,to_id:branch,quantity:"4",reason:"Traslado bodega secundaria"}),supply.SupplyError);
  await assert.rejects(() => supply.adjustStock(ops,{item_id:item,warehouse_id:main,direction:"salida",quantity:"4",reason:"Conteo corregido"}),supply.SupplyError);
  inventory = await supply.listInventory(ops);
  assert.equal(balance(item,main).reserved,"7.000");
  const reservation = inventory.reservations[0];
  await supply.closeReservation(ops,reservation.id,"consumir");
  await assert.rejects(() => supply.closeReservation(ops,reservation.id,"consumir"),supply.SupplyError);
  await supply.transferStock(ops,{item_id:item,from_id:main,to_id:branch,quantity:"2",reason:"Traslado bodega secundaria"});
  await supply.adjustStock(ops,{item_id:item,warehouse_id:branch,direction:"entrada",quantity:"1",reason:"Conteo inicial de prueba"});
  const separateReservation = await supply.reserveStock(ops,{item_id:item,warehouse_id:branch,quantity:"1",reason:"Reserva temporal"});
  await supply.closeReservation(ops,separateReservation,"liberar");
  inventory = await supply.listInventory(ops,item,branch);
  assert.equal(balance(item,main).quantity,"1.000");
  assert.equal(balance(item,main).reserved,"0.000");
  assert.equal(balance(item,branch).quantity,"3.000");
  assert.equal(balance(item,branch).reserved,"0.000");
  assert.equal(inventory.reservations.length,0);
  assert.ok(inventory.movements.some((row) => row.kind === "transferencia_entrada"));
  const [ledger] = await db.query<{ quantity:string; reserved:string }>(`SELECT COALESCE(sum(qty_delta),0)::text AS quantity,COALESCE(sum(reserved_delta),0)::text AS reserved
    FROM inventory_movements WHERE item_id=$1 AND warehouse_id=$2`,[item,branch]);
  assert.equal(Number(ledger.quantity),Number(balance(item,branch).quantity));
  assert.equal(Number(ledger.reserved),Number(balance(item,branch).reserved));
  const [audits] = await db.query<{total:string}>("SELECT count(*)::text AS total FROM audit_events WHERE entity_type='purchase_request' AND entity_id=$1",[purchaseId]);
  assert.equal(Number(audits.total),7);
});
