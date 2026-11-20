import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {seedCounterpartyReview} from "./fixtures/counterparty-review";

test("fichas legales: directorio completo y recuperación privada de formularios",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const{db,transaction}=await import("../lib/db"),api=await import("../lib/counterparties");
  for(const name of(await readdir("db")).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(value=>value.trim()).filter(Boolean))await tx.query(part);});
  }
  const f=await seedCounterpartyReview(db);
  assert.equal((await api.listCounterparties(f.actors.admin)).length,425,"una ficha posterior a la 400 sigue disponible");
  await t.test("paginación estable sin omisiones incluso con nombres repetidos",async()=>{
    const seen=new Set<string>();for(let page=1;page<=5;page++){
      const result=await api.counterpartyPage(f.actors.admin,page);assert.equal(result.total,425);assert.equal(result.page,page);assert.equal(result.rows.length,page===5?25:100);
      for(const row of result.rows){assert.ok(!seen.has(row.id));seen.add(row.id);assert.ok(!("account_number"in row));}
    }
    assert.equal(seen.size,425);assert.equal((await api.counterpartyPage(f.actors.admin,999)).page,5);
  });
  await t.test("sólo administración consulta el listado o una ficha bancaria",async()=>{
    for(const role of["operaciones","conductor","cliente"]as const){await assert.rejects(()=>api.listCounterparties(f.actors[role]),api.CounterpartyError);await assert.rejects(()=>api.counterpartyPage(f.actors[role],1),api.CounterpartyError);await assert.rejects(()=>api.getCounterparty(f.actors[role],f.profiles[0].id),api.CounterpartyError);}
  });
  const state=await import("../lib/counterparty-form-state");
  await t.test("el borrador conserva campos bancarios y contactos sólo en los datos del formulario",()=>{
    const form=new FormData();form.set("legal_name",'Empresa & "prueba"');form.set("account_number","CUENTA-PRIVADA-SINTETICA");form.set("compras_email","compras@example.invalid");form.set("bank_notes","Nota\nconservada");form.set("password","NO_CONSERVAR");form.set("archivo",new File(["NO_CONSERVAR_ARCHIVO"],"privado.pdf"));
    const result=state.counterpartyDraft(form,"RUT inválido");assert.equal(result.values.account_number,"CUENTA-PRIVADA-SINTETICA");assert.equal(result.values.compras_email,"compras@example.invalid");assert.equal(result.values.bank_notes,"Nota\nconservada");assert.ok(!JSON.stringify(result).includes("NO_CONSERVAR"));
    const href=state.counterpartyHref(state.counterpartyContext({pagina:"4"}),f.profiles[0].id);assert.ok(href.includes("pagina=4"));assert.ok(!href.includes("CUENTA"));assert.deepEqual(state.counterpartyContext({pagina:"-1"}),{});
  });
});
