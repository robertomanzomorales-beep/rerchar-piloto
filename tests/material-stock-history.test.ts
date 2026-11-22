import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import {seedMaterialStockHistory} from "./fixtures/material-stock-history";

test("el historial de materiales conserva movimientos anteriores al corte general y todas sus páginas",async t=>{
  Object.assign(process.env,{DATABASE_URL:"",PGLITE_DATA_DIR:"memory://",NODE_ENV:"development"});
  const {db,transaction}=await import("../lib/db"),stock=await import("../lib/material-stock");
  for(const name of(await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(resolve("db",name),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const f=await seedMaterialStockHistory(db),older=f.materials[1].id;
  const balance=await db.query("SELECT material_id,quantity_kg::text FROM material_stock_balances ORDER BY material_id");
  await t.test("filtrar antes de paginar recupera 205 asientos antiguos en orden estable",async()=>{
    const result=await stock.listMaterialStockMovementsPage(f.actors.admin,older,1);
    assert.equal(result.total,205);assert.equal(result.allTotal,410);assert.equal(result.totalPages,3);
    const rows=[...result.movements];
    for(const page of [2,3])rows.push(...(await stock.listMaterialStockMovementsPage(f.actors.admin,older,page)).movements);
    assert.deepEqual(rows.map(r=>r.id),f.ids[older]);assert.equal(new Set(rows.map(r=>r.id)).size,205);
    assert.ok(rows.every(r=>r.material_id===older&&r.reference.startsWith("OLD-STOCK-")));
  });
  await t.test("la consulta general conserva los 410 asientos y recupera una página fuera de rango",async()=>{
    const ids:string[]=[];for(let page=1;page<=5;page++)ids.push(...(await stock.listMaterialStockMovementsPage(f.actors.admin,"",page)).movements.map(r=>r.id));
    assert.deepEqual(ids,f.allIds);assert.equal(new Set(ids).size,410);
    const last=await stock.listMaterialStockMovementsPage(f.actors.admin,older,999);assert.equal(last.page,3);assert.equal(last.movements.length,5);
    const empty=await stock.listMaterialStockMovementsPage(f.actors.admin,f.materials[2].id,3);assert.equal(empty.page,1);assert.equal(empty.total,0);assert.equal(empty.allTotal,410);assert.deepEqual(empty.movements,[]);
    assert.equal((await stock.listMaterialStockMovements(f.actors.admin)).length,200,"la consulta anterior mantiene su tamaño predeterminado");
  });
  await t.test("consulta operativa, material válido y restricciones de cada perfil",async()=>{
    assert.equal((await stock.listMaterialStockMovementsPage(f.actors.operaciones,older)).total,205);
    for(const role of ["cliente","conductor"] as const)await assert.rejects(()=>stock.listMaterialStockMovementsPage(f.actors[role],older),stock.MaterialStockError);
    await assert.rejects(()=>stock.listMaterialStockMovementsPage(f.actors.admin,"material-no-valido"),stock.MaterialStockError);
    assert.deepEqual(await db.query("SELECT material_id,quantity_kg::text FROM material_stock_balances ORDER BY material_id"),balance);
  });
});
