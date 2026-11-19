import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import {seedGuideFollowupReview} from "./fixtures/guide-followup-review";

test("seguimiento completo y avisos coinciden con plazo, responsable y empresa",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),ledger=await import("../lib/service-ledger");
  for(const name of (await readdir("db")).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});}
  const f=await seedGuideFollowupReview(db,"2026-11-19"),actor=f.actors.admin;
  await t.test("el listado no pierde servicios después del registro 250",async()=>{assert.equal((await ledger.listGuideFollowups(actor,"rerchar","todas",f.today)).length,f.totalEligible);});
  await t.test("el filtro personal atrasado no incluye plazos futuros, recibidos ni otros responsables",async()=>{
    assert.equal(ledger.parseGuideFilter("mias_atrasadas"),"mias_atrasadas");
    const rows=await ledger.listGuideFollowups(actor,"rerchar",ledger.parseGuideFilter("mias_atrasadas"),f.today),overview=await ledger.guideFollowupOverview(actor,f.today);assert.equal(rows.length,Number(overview.my_overdue));assert.equal(rows.length,f.ownOverdue);assert.deepEqual(new Set(rows.map(row=>row.id)),new Set(f.groups["Propia atrasada"]));
  });
  await t.test("paginación completa, estable y acotada al filtro",async()=>{
    const expected=(await ledger.listGuideFollowups(actor,"rerchar","todas",f.today)).map(row=>row.id),seen:string[]=[];
    for(let page=1;page<=4;page++){const board=await ledger.guideFollowupPage(actor,"rerchar","todas",f.today,page);assert.equal(board.page,page);assert.equal(board.total,322);assert.equal(board.pages,4);assert.equal(board.rows.length,page===4?22:100);seen.push(...board.rows.map(row=>row.id));}
    assert.deepEqual(seen,expected);assert.equal(new Set(seen).size,322);
    const last=await ledger.guideFollowupPage(actor,"rerchar","mias_atrasadas",f.today,999);assert.equal(last.page,4);assert.equal(last.rows.length,12);assert.equal(last.total,312);
    const empty=await ledger.guideFollowupPage(actor,"e_y_j","todas",f.today,999);assert.equal(empty.total,0);assert.equal(empty.page,1);assert.equal(empty.pages,1);
  });
  await t.test("resumen, filtros heredados y responsable conservan el significado",async()=>{
    const overview=await ledger.guideFollowupOverview(actor,f.today);assert.deepEqual(overview,{waiting_request:"1",pending:"318",overdue:"315",my_overdue:"312",upcoming:"1",undated:"1",waiting_close:"1"});
    for(const [filter,count]of [["mias",315],["pendientes",318],["atrasadas",315],["proximas",1],["sin_plazo",1]] as const)assert.equal((await ledger.guideFollowupPage(actor,"rerchar",filter,f.today)).total,count);
    assert.equal((await ledger.guideFollowupPage(f.actors.operaciones,"rerchar","mias_atrasadas",f.today)).total,3);
    assert.equal((await ledger.guideFollowupPage(f.actors.operaciones,"rerchar","mias",f.today)).total,3);
  });
  await t.test("cliente y conductor no pueden consultar el seguimiento interno",async()=>{
    for(const role of ["cliente","conductor"] as const){await assert.rejects(()=>ledger.guideFollowupPage(f.actors[role],"rerchar","todas",f.today),ledger.LedgerError);await assert.rejects(()=>ledger.guideFollowupOverview(f.actors[role],f.today),ledger.LedgerError);}
    await assert.rejects(()=>ledger.guideFollowupPage(actor,"rerchar","todas","2026-02-30"),ledger.LedgerError);
  });
});
