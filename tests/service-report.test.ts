import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import {seedServiceReport} from "./fixtures/service-report";

test("el reporte completo conserva más de mil servicios, pesajes válidos, empresa y alcance de cada perfil",async()=>{
  Object.assign(process.env,{DATABASE_URL:"",PGLITE_DATA_DIR:"memory://",NODE_ENV:"development"});
  const {db,transaction}=await import("../lib/db");
  const {reportServices,normalizeReportFilters,serviceReportOverview,iterateReportServices}=await import("../lib/pilot");
  for(const name of (await readdir(resolve("db"))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(resolve("db",name),"utf8");
    await transaction(async tx=>{for(const s of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(s);});
  }
  const {actors,client,site}=await seedServiceReport(db),filters=normalizeReportFilters({company:"rerchar"});
  assert.deepEqual(await serviceReportOverview(actors.admin,filters),{total:1205,completed:1204,netKg:60000,weighed:1201});
  assert.equal((await serviceReportOverview(actors.operaciones,filters)).total,1205);
  assert.equal((await serviceReportOverview(actors.cliente,filters)).total,1001);
  assert.deepEqual(await serviceReportOverview(actors.conductor,filters),{total:10,completed:9,netKg:250,weighed:6});
  assert.equal((await serviceReportOverview(actors.cliente,normalizeReportFilters({company:"e_y_j"}))).total,0);
  assert.equal((await serviceReportOverview(actors.admin,normalizeReportFilters({company:"e_y_j"}))).total,2);
  assert.equal((await serviceReportOverview(actors.admin,normalizeReportFilters({company:"pendiente"}))).total,1);
  assert.equal((await serviceReportOverview(actors.admin,normalizeReportFilters({from:"2026-11-18",to:"2026-11-18"}))).total,1205);
  assert.equal((await serviceReportOverview(actors.admin,normalizeReportFilters({from:"2026-11-19",to:"2026-11-19"}))).total,3);
  assert.deepEqual(await serviceReportOverview(actors.admin,normalizeReportFilters({company:"rerchar",status:"solicitada"})),{total:1,completed:0,netKg:0,weighed:0});
  assert.deepEqual(await serviceReportOverview(actors.admin,normalizeReportFilters({from:"2100-01-01"})),{total:0,completed:0,netKg:0,weighed:0});
  const pages=[];
  for(let offset=0;offset<1205;offset+=100)pages.push(await reportServices(actors.admin,filters,{limit:100,offset}));
  assert.deepEqual(pages.map(p=>p.length),[100,100,100,100,100,100,100,100,100,100,100,100,5]);
  const expected=pages.flat().map(r=>r.id);assert.equal(new Set(expected).size,1205);
  const exported=[];for await(const batch of iterateReportServices(actors.admin,filters))exported.push(...batch);
  assert.deepEqual(exported.map(r=>r.id),expected);
  assert.match(exported[499].created_at_cursor,/123456/,
    "el cursor conserva microsegundos PostgreSQL y no redondea al valor Date de JavaScript");
  for(const [actor,count] of [[actors.cliente,1001],[actors.conductor,10]] as const){
    const visible=[];for await(const batch of iterateReportServices(actor,filters))visible.push(...batch);
    assert.equal(visible.length,count);assert.equal(new Set(visible.map(r=>r.id)).size,count);
  }
  const iterator=iterateReportServices(actors.admin,filters),first=await iterator.next();assert.equal(first.value?.length,500);
  await db.query(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by,created_at)
    VALUES(gen_random_uuid(),$1,$2,'rerchar','retiro','Alta mientras exporta','Faena','Patio',$3,'2026-11-19T02:31:00Z')`,[client.id,site.id,actors.admin.id]);
  const stable=[...first.value!];for await(const batch of iterator)stable.push(...batch);
  assert.deepEqual(stable.map(r=>r.id),expected,"un alta más reciente no repite ni desplaza registros entre lotes");
});
