import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";
import type {AuditRow} from "../lib/audit-report";
test("la auditoría pagina y exporta todo el filtro con fechas y permisos correctos",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),audit=await import("../lib/audit-report"),csv=await import("../lib/audit-csv");
  for(const name of (await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});}
  const users=await db.query<{id:string;role:Actor['role']}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@audit.example.invalid','Administración revisión','h','admin'),('ops@audit.example.invalid','Operaciones revisión','h','operaciones'),('driver@audit.example.invalid','Conductor revisión','h','conductor') RETURNING id,role"),actors=users.map(u=>({...u,name:"Revisión",email:"user@example.invalid",client_id:null})),[admin,ops,driver]=actors,targets=[randomUUID(),randomUUID()];
  for(const [i,company]of ["rerchar","e_y_j"].entries())await db.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value,created_at)
    SELECT $1,CASE WHEN n%2=0 THEN 'day_result' ELSE 'update' END,CASE WHEN n%2=0 THEN 'service_request' ELSE 'asset' END,$2,jsonb_build_object('company',$3::text),'2026-11-19T00:00:00.123456Z' FROM generate_series(1,1205) n`,[i===0?ops.id:admin.id,targets[i],company]);
  const filters=audit.auditFilter({}),expected:string[]=[];
  await t.test("todos los eventos de ambas operaciones tienen páginas estables e indicadores completos",async()=>{
    assert.deepEqual(await audit.auditOverview(admin,filters),{total:2410,people:2,entities:2});for(let offset=0;offset<2500;offset+=100)expected.push(...(await audit.auditReport(admin,filters,100,offset)).map(r=>r.id));assert.equal(expected.length,2410);assert.equal(new Set(expected).size,2410);
    assert.deepEqual(await audit.auditOverview(admin,audit.auditFilter({kind:"service_request"})),{total:1204,people:2,entities:1});assert.equal((await audit.auditReport(admin,audit.auditFilter({kind:"sin_registros"}))).length,0);assert.deepEqual((await audit.auditKinds(admin)).map(k=>k.entity_type),["asset","service_request"]);
    const one=await audit.auditReport(admin,filters,1);assert.ok(one[0].created_at_cursor.includes("123456"));
  });
  await t.test("la exportación conserva más de mil eventos y los microsegundos del orden",async()=>{
    const exported:AuditRow[]=[];for await(const batch of audit.iterateAuditReport(admin,filters)){assert.ok(batch.length<=500);exported.push(...batch);}assert.deepEqual(exported.map(r=>r.id),expected);assert.deepEqual(new Set(exported.map(r=>r.entity_id)),new Set(targets));
    const text=csv.auditCsvHeader+csv.auditCsvRows(exported);assert.equal(text.trim().split("\r\n").length,2411);assert.equal((text.match(/Fecha y hora \(Chile\)/g)||[]).length,1);assert.equal((text.match(/\uFEFF/g)||[]).length,1);
  });
  await t.test("un evento más reciente no desplaza ni repite registros durante la exportación",async()=>{
    const iterator=audit.iterateAuditReport(admin,filters),first=await iterator.next();assert.equal(first.value?.length,500);const [inserted]=await db.query<{id:string}>("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,created_at) VALUES($1,'update','asset',$2,'2026-11-19T01:00:00Z') RETURNING id",[admin.id,targets[0]]);const seen=[...first.value!];for await(const batch of iterator)seen.push(...batch);assert.deepEqual(seen.map(r=>r.id),expected);await db.query("DELETE FROM audit_events WHERE id=$1",[inserted.id]);
  });
  await t.test("los filtros usan el día de Chile, admiten límites inclusivos y rechazan períodos inválidos",async()=>{
    await db.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,created_at) VALUES($1,'check','boundary_check',$2,'2026-09-29T02:30:00Z'),($1,'check','boundary_check',$2,'2026-09-29T03:01:00Z')",[admin.id,targets[0]]);
    for(const day of ["2026-09-28","2026-09-29"])assert.equal((await audit.auditReport(admin,audit.auditFilter({from:day,to:day,kind:"boundary_check"}))).length,1);
    for(const input of [{from:"2026-02-31"},{to:"no-fecha"},{from:"2026-11-19",to:"2026-11-18"},{kind:"tipo inválido"}])assert.ok(audit.auditFilterIssue(input));assert.equal(audit.auditFilterIssue({from:"2024-02-29",to:"2024-02-29",kind:"registro_2"}),"");await assert.rejects(()=>audit.auditReport(admin,{from:"2026-11-19",to:"2026-11-18",kind:""}),/posterior/);
  });
  await t.test("el CSV conserva comillas y saltos y protege valores que parecen fórmulas",async()=>{
    const [base]=await audit.auditReport(admin,filters,1),row={...base,actor_name:'  =SUM(1,2)\n"Nombre; citado"'};const encoded=csv.auditCsvRows([row]);assert.ok(encoded.includes('"\'  =SUM(1,2)\n""Nombre; citado"""'));assert.ok(encoded.endsWith("\r\n"));assert.equal(csv.auditCsvRows([]),"");assert.equal(audit.auditActionLabel("day_result"),"Resultado de parte diario");assert.equal(audit.auditEntityLabel("service_request"),"Servicio");
  });
  await t.test("páginas, tipos e indicadores requieren administración con acceso vigente",async()=>{
    for(const actor of [ops,driver]){await assert.rejects(()=>audit.auditReport(actor,filters),/administración/);await assert.rejects(()=>audit.auditKinds(actor),/administración/);await assert.rejects(()=>audit.auditOverview(actor,filters),/administración/);await assert.rejects(()=>audit.iterateAuditReport(actor,filters).next(),/administración/);}
    await db.query("UPDATE users SET active=false WHERE id=$1",[admin.id]);await assert.rejects(()=>audit.auditReport(admin,filters),/ya no está activo/);await db.query("UPDATE users SET active=true WHERE id=$1",[admin.id]);const iterator=audit.iterateAuditReport(admin,filters);await iterator.next();await db.query("UPDATE users SET role='operaciones' WHERE id=$1",[admin.id]);await assert.rejects(()=>iterator.next(),/ya no está activo/);await db.query("UPDATE users SET role='admin' WHERE id=$1",[admin.id]);
  });
  await t.test("un cursor inválido no llega a una consulta UUID o fecha defectuosa",async()=>{
    await assert.rejects(()=>audit.auditReport(admin,filters,100,0,{at:"fecha inválida",id:randomUUID()}),/Página/);await assert.rejects(()=>audit.auditReport(admin,filters,100,0,{at:"2026-11-19T00:00:00Z",id:"------------------------------------"}),/Página/);
  });
});
