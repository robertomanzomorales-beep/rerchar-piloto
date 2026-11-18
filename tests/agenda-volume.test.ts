import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("la semana no omite viajes ni partes al superar mil y cada perfil conserva su alcance",async()=>{
  Object.assign(process.env,{DATABASE_URL:"",PGLITE_DATA_DIR:"memory://",NODE_ENV:"development"});
  const {db,transaction}=await import("../lib/db");
  const {weeklyFleet}=await import("../lib/fleet-schedule");
  const {listAgenda}=await import("../lib/pilot");
  const {listWeekResults}=await import("../lib/service-day");
  for(const name of (await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const s of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(s);});
  }
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente agenda'),('Cliente ajeno') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const [otherSite]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena ajena') RETURNING id",[other.id]);
  const actors={} as Record<"admin"|"conductor"|"cliente",Actor>;
  for(const role of ["admin","conductor","cliente"] as const){
    const [u]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$2,$3) RETURNING id",[role+"@agenda.invalid",role,role==="cliente"?client.id:null]);
    actors[role]={id:u.id,name:role,email:role+"@agenda.invalid",role,client_id:role==="cliente"?client.id:null};
  }
  const [truck]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES('AGENDA-VOL','Camión agenda','camion') RETURNING id");
  await db.query(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,assigned_asset_id,scheduled_for,driver_id,created_by)
    SELECT gen_random_uuid(),$1,$2,'rerchar','traslado','Material','Faena','Patio','programada',$3,
      '2026-11-16T12:00:00Z'::timestamptz+(n*interval '1 second'),$4,$5 FROM generate_series(1,1001) n`,[client.id,site.id,truck.id,actors.conductor.id,actors.admin.id]);
  const [last]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,assigned_asset_id,scheduled_for,created_by)
    VALUES(gen_random_uuid(),$1,$2,'e_y_j','traslado','Último viaje','Faena','Patio','programada',$3,'2026-11-22T20:00:00Z',$4) RETURNING id`,[other.id,otherSite.id,truck.id,actors.admin.id]);
  await db.query(`INSERT INTO service_day_reports(service_id,day,asset_id,outcome,observation,recorded_by)
    SELECT id,(scheduled_for AT TIME ZONE 'America/Santiago')::date,$1,'incompleto','Seguimiento semanal',$2 FROM service_requests`,[truck.id,actors.admin.id]);
  await db.query(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,priority,created_by)
    SELECT gen_random_uuid(),$1,$2,'e_y_j','traslado','Pendiente','Faena','Patio','alta',$3 FROM generate_series(1,61)`,[other.id,otherSite.id,actors.admin.id]);
  const week=await weeklyFleet(actors.admin,"2026-11-16","2026-11-23","rerchar");
  assert.equal(week.trips.length,1002);assert.ok(week.trips.some(t=>t.id===last.id),"la ocupación de la otra empresa no desaparece al final de la semana");
  assert.equal(week.pendingTotal,0);
  const eyj=await weeklyFleet(actors.admin,"2026-11-16","2026-11-23","e_y_j");
  assert.equal(eyj.pending.length,60);assert.equal(eyj.pendingTotal,61);assert.equal(eyj.pendingPriorityTotal,61);
  const results=await listWeekResults(actors.admin,"2026-11-16","2026-11-23");assert.equal(results.length,1002);assert.ok(results.some(r=>r.service_id===last.id));
  for(const actor of [actors.cliente,actors.conductor])assert.equal((await listAgenda(actor,"2026-11-16","2026-11-23")).length,1001);
  assert.equal((await listAgenda(actors.cliente,"2026-11-16","2026-11-23","e_y_j")).length,0);
  assert.equal((await listAgenda(actors.admin,"2026-11-16","2026-11-23","e_y_j")).length,1);
  await assert.rejects(()=>listWeekResults(actors.conductor,"2026-11-16","2026-11-23"));
  await assert.rejects(()=>listWeekResults(actors.admin,"2026-02-31","2026-03-07"));
  await assert.rejects(()=>listAgenda(actors.admin,"2026-11-16","2026-12-23"));
});
