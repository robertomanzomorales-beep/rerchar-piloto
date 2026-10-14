import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("programación semanal comparte flota entre empresas, admite varios viajes y bloquea días indisponibles",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const pilot=await import("../lib/pilot");
  const schedule=await import("../lib/fleet-schedule");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [manager,driver,secondDriver]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role)
    VALUES('planner@demo.cl','Planificador','h','operaciones'),('driver1@demo.cl','Uno','h','conductor'),('driver2@demo.cl','Dos','h','conductor') RETURNING id`);
  const actor:Actor={id:manager.id,name:"Planificador",email:"planner@demo.cl",role:"operaciones",client_id:null};
  const viewer:Actor={id:driver.id,name:"Uno",email:"driver1@demo.cl",role:"conductor",client_id:null};
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente Norte') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const truck=await pilot.createAsset(actor,{code:"CAM-S1",label:"Camión Norte",kind:"camion",plate:"JKLL-22"});
  const another=await pilot.createAsset(actor,{code:"CAM-S2",label:"Camión Sur",kind:"camion",plate:"MNPQ-01"});
  const service=async(company:"rerchar"|"e_y_j",priority:"normal"|"alta"="normal")=>pilot.createService(actor,{
    submission_key:randomUUID(),client_id:client.id,site_id:site.id,operating_company:company,
    service_type:"traslado",waste_type:"Chatarra",estimated_kg:"",origin:"Faena",destination:"Patio",priority,notes:"",
  });
  const first=await service("rerchar");const second=await service("e_y_j");const waiting=await service("e_y_j","alta");
  await pilot.assignService(actor,first,{asset_id:truck,driver_id:driver.id,scheduled_for:"2026-10-19T08:00"});
  await pilot.assignService(actor,second,{asset_id:truck,driver_id:secondDriver.id,scheduled_for:"2026-10-19T17:00"});
  await assert.rejects(()=>schedule.setFleetDay(viewer,{asset_id:truck,day:"2026-10-20",kind:"mantencion",detail:"Taller"}),schedule.FleetScheduleError);
  await assert.rejects(()=>schedule.setFleetDay(actor,{asset_id:truck,day:"2026-10-19",kind:"mantencion",detail:"Taller"}),/servicio activo/);
  await schedule.setFleetDay(actor,{asset_id:truck,day:"2026-10-19",kind:"nota",detail:"Dos turnos confirmados"});
  await schedule.setFleetDay(actor,{asset_id:another,day:"2026-10-20",kind:"mantencion",detail:"Revisión preventiva"});
  await assert.rejects(()=>pilot.assignService(actor,waiting,{asset_id:another,driver_id:driver.id,scheduled_for:"2026-10-20T10:00"}),/indisponibilidad/);
  const week=await schedule.weeklyFleet(actor,"2026-10-19","2026-10-26","rerchar");
  assert.equal(week.trips.length,2,"las asignaciones de la otra empresa siguen ocupando el camión");
  assert.equal(week.pending.length,0,"el filtro conserva la lista propia");
  assert.equal(week.notes.length,2);
  assert.equal((await schedule.weeklyFleet(actor,"2026-10-19","2026-10-26","e_y_j")).pending[0].id,waiting);
  await schedule.setFleetDay(actor,{asset_id:another,day:"2026-10-20",kind:"despejado",detail:""});
  await pilot.assignService(actor,waiting,{asset_id:another,driver_id:driver.id,scheduled_for:"2026-10-20T10:00"});
  assert.equal((await schedule.weeklyFleet(actor,"2026-10-19","2026-10-26")).trips.length,3);
  assert.equal((await db.query("SELECT id FROM audit_events WHERE action='fleet_day_updated'")).length,3);
});
