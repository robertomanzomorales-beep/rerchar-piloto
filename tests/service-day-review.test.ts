import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";
import {financeDay} from "../lib/finance-catalog-state";

test("los partes conservan historia, correcciones y alcance de la operación",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),parts=await import("../lib/service-day"),charges=await import("../lib/extra-charges");
  for(const name of (await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [client,otherClient]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente partes revisión'),('Otro cliente partes') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena revisión') RETURNING id",[client.id]);
  const users=await db.query<{id:string;role:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@parts.example.invalid','Admin partes','h','admin'),('ops@parts.example.invalid','Operaciones partes','h','operaciones'),('driver@parts.example.invalid','Conductor original','h','conductor'),('driver2@parts.example.invalid','Conductor nuevo','h','conductor') RETURNING id,role");
  const asActor=(user:{id:string;role:string}):Actor=>({...user,role:user.role as Actor['role'],name:"Revisión",email:"actor@parts.example.invalid",client_id:null});
  const admin=asActor(users[0]),ops=asActor(users[1]),driver=asActor(users[2]),otherDriver=asActor(users[3]),clientActor:Actor={...driver,role:"cliente",client_id:client.id},otherActor:Actor={...clientActor,client_id:otherClient.id};
  const [truck,newTruck]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES('CAM-PARTE-ORIG','Camión histórico','camion'),('CAM-PARTE-NEW','Camión nuevo','camion') RETURNING id");
  const services:Record<string,string>={};
  for(const company of ["rerchar","e_y_j"] as const){
    const [service]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,scheduled_for,assigned_asset_id,driver_id,created_by)
      VALUES(gen_random_uuid(),$1,$2,$3,'traslado','Material','Faena','Patio','programada','2020-01-01T15:00:00Z',$4,$5,$6) RETURNING id`,[client.id,site.id,company,truck.id,driver.id,ops.id]);services[company]=service.id;
    await db.query(`INSERT INTO service_day_reports(service_id,day,asset_id,driver_name,outcome,observation,recorded_by)
      SELECT $1,'2020-01-01'::date+n,$2,'Conductor histórico','incompleto','Antecedente original de terreno '||n,$3 FROM generate_series(0,216) n`,[service.id,truck.id,ops.id]);
  }
  const find=async(company:string,day:string)=>(await parts.listServiceDays(ops,services[company])).find(r=>financeDay(r.day)===day)!;
  const audits=async(service:string)=>(await db.query<{n:string}>("SELECT count(*)::text n FROM audit_events WHERE entity_type='service_request' AND entity_id=$1 AND action='day_result'",[service]))[0].n;
  await t.test("más de ciento veinte partes permanecen accesibles para los perfiles autorizados",async()=>{
    for(const company of ["rerchar","e_y_j"]){const rows=await parts.listServiceDays(ops,services[company]);assert.equal(rows.length,217);assert.equal(financeDay(rows.at(-1)!.day),"2020-01-01");assert.equal(new Set(rows.map(r=>financeDay(r.day))).size,217);assert.ok(rows.every(r=>r.revision&&r.asset_code==="CAM-PARTE-ORIG"&&r.recorder_name));}
    assert.equal((await parts.listServiceDays(driver,services.rerchar)).length,217);assert.equal((await parts.listServiceDays(clientActor,services.e_y_j)).length,217);await assert.rejects(()=>parts.listServiceDays(otherActor,services.rerchar),/no disponible/);await assert.rejects(()=>parts.listServiceDays(otherDriver,services.rerchar),/no disponible/);
  });
  await t.test("registrar otra vez la misma fecha requiere cargar antes su versión guardada",async()=>{
    const before=await find("rerchar","2020-01-01"),edit={day:"2020-01-01",outcome:"suspendido",observation:"Suspensión corregida y documentada",expected_revision:""};await assert.rejects(()=>parts.reportServiceDay(ops,services.rerchar,edit,"rerchar"),/Ya existe un parte/);
    assert.equal((await find("rerchar",edit.day)).observation,before.observation);await parts.reportServiceDay(ops,services.rerchar,{...edit,expected_revision:before.revision},"rerchar");assert.equal((await find("rerchar",edit.day)).outcome,"suspendido");assert.notEqual((await find("rerchar",edit.day)).revision,before.revision);
  });
  await t.test("un formulario anterior no reemplaza una corrección posterior",async()=>{
    const before=await find("e_y_j","2020-01-02"),first={day:"2020-01-02",outcome:"suspendido",observation:"Primera corrección documentada",expected_revision:before.revision};await parts.reportServiceDay(admin,services.e_y_j,first,"e_y_j");
    await assert.rejects(()=>parts.reportServiceDay(ops,services.e_y_j,{...first,outcome:"completado",observation:"Versión anterior del formulario"},"e_y_j"),/cambió después/);assert.equal((await find("e_y_j",first.day)).observation,first.observation);
    const count=await audits(services.e_y_j);await parts.reportServiceDay(admin,services.e_y_j,first,"e_y_j");assert.equal(await audits(services.e_y_j),count);
  });
  await t.test("los reintentos de un parte nuevo no duplican su historial de auditoría",async()=>{
    const input={day:"2020-09-01",outcome:"incompleto",observation:"Registro nuevo con respaldo de terreno",expected_revision:""},before=Number(await audits(services.rerchar));await parts.reportServiceDay(ops,services.rerchar,input,"rerchar");await parts.reportServiceDay(ops,services.rerchar,input,"rerchar");assert.equal(Number(await audits(services.rerchar)),before+1);assert.equal((await parts.listServiceDays(ops,services.rerchar)).filter(r=>financeDay(r.day)===input.day).length,1);
  });
  await t.test("corregir un parte conserva camión y conductor aunque el servicio se reprograme",async()=>{
    const before=await find("rerchar","2020-01-03");await db.query("UPDATE service_requests SET assigned_asset_id=$2,driver_id=$3,scheduled_for='2020-10-01T15:00:00Z' WHERE id=$1",[services.rerchar,newTruck.id,otherDriver.id]);
    await parts.reportServiceDay(ops,services.rerchar,{day:"2020-01-03",outcome:"suspendido",observation:"Corrección del antecedente histórico",expected_revision:before.revision},"rerchar");const after=await find("rerchar","2020-01-03");assert.equal(after.asset_id,truck.id);assert.equal(after.driver_name,"Conductor histórico");assert.equal(after.asset_code,"CAM-PARTE-ORIG");
    await assert.rejects(()=>parts.reportServiceDay(ops,services.rerchar,{day:"2020-09-02",outcome:"completado",observation:"",expected_revision:""},"rerchar"),/anterior/);
    await parts.reportServiceDay(ops,services.rerchar,{day:"2020-10-01",outcome:"completado",observation:"",expected_revision:""},"rerchar");const fresh=await find("rerchar","2020-10-01");assert.equal(fresh.asset_id,newTruck.id);assert.equal(fresh.driver_name,"Conductor nuevo");
  });
  await t.test("fecha, causa y empresa se comprueban antes de guardar",async()=>{
    const input={day:"2020-01-04",outcome:"suspendido",observation:"Causa documentada de suspensión",expected_revision:(await find("e_y_j","2020-01-04")).revision};await assert.rejects(()=>parts.reportServiceDay(ops,services.e_y_j,input,"rerchar"),/empresa del servicio cambió/);
    await assert.rejects(()=>parts.reportServiceDay(ops,services.e_y_j,{...input,day:"2099-01-01"},"e_y_j"),/futura/);await assert.rejects(()=>parts.reportServiceDay(ops,services.e_y_j,{...input,observation:""},"e_y_j"),/Explique/);assert.equal((await find("e_y_j",input.day)).outcome,"incompleto");
  });
  await t.test("resolver el último parte actualiza la alerta y conserva el respaldo del cargo previo",async()=>{
    const before=await find("e_y_j","2020-08-04"),{randomUUID}=await import("node:crypto"),charge=await charges.proposeExtraCharge(ops,services.e_y_j,{submission_key:randomUUID(),service_day:"2020-08-04",kind:"sobrestadia",reason:"Cargo respaldado en el parte original",amount_clp:"10",quote_reference:"",client_order_reference:""},"e_y_j");assert.equal((await parts.listOpenDayAlerts(ops,"e_y_j")).total,1);
    await parts.reportServiceDay(ops,services.e_y_j,{day:"2020-08-04",outcome:"completado",observation:"Trabajo completado tras revisión",expected_revision:before.revision},"e_y_j");assert.equal((await parts.listOpenDayAlerts(ops,"e_y_j")).total,0);assert.equal((await charges.getExtraCharge(admin,"e_y_j",charge))?.source_outcome,"incompleto");
    const week=await parts.listWeekResults(ops,"2020-08-03","2020-08-10");assert.ok(week.some(r=>r.service_id===services.e_y_j&&financeDay(r.day)==="2020-08-04"&&r.outcome==="completado"));
  });
  await t.test("un permiso revocado detiene el registro aunque el formulario siga abierto",async()=>{
    const input={day:"2020-11-01",outcome:"completado",observation:"",expected_revision:""};await db.query("UPDATE users SET role='conductor' WHERE id=$1",[ops.id]);await assert.rejects(()=>parts.reportServiceDay(ops,services.rerchar,input,"rerchar"),/acceso para registrar partes/);await db.query("UPDATE users SET active=false WHERE id=$1",[admin.id]);await assert.rejects(()=>parts.reportServiceDay(admin,services.rerchar,input,"rerchar"),/acceso para registrar partes/);
  });
});
