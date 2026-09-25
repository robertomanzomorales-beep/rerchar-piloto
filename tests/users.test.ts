import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("usuarios, empresa del portal, cierre de sesiones y permisos administrativos",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const {createUser,PilotError,listServices}=await import("../lib/pilot");
  const users=await import("../lib/users");
  const {verifyPassword}=await import("../lib/password");
  for(const name of ["001_piloto.sql","002_flota_y_despacho.sql","003_abastecimiento.sql","004_mantenimiento_combustible.sql","005_contenedores.sql","006_acreditacion.sql","007_finanzas.sql","008_trazabilidad_ambiental.sql","009_certificados.sql"]){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [companyA,companyB]=await db.query<{id:string}>("INSERT INTO clients (name) VALUES ('Empresa A'),('Empresa B') RETURNING id");
  const [siteA]=await db.query<{id:string}>("INSERT INTO client_sites (client_id,name) VALUES ($1,'Faena A') RETURNING id",[companyA.id]);
  const [siteB]=await db.query<{id:string}>("INSERT INTO client_sites (client_id,name) VALUES ($1,'Faena B') RETURNING id",[companyB.id]);
  const [firstAdmin,secondAdmin,operator,driver]=await db.query<{id:string}>(`INSERT INTO users (email,name,password_hash,role) VALUES
    ('admin1@demo.cl','Admin 1','hash','admin'),('admin2@demo.cl','Admin 2','hash','admin'),
    ('ops@demo.cl','Operaciones','hash','operaciones'),('conductor@demo.cl','Conductor','hash','conductor') RETURNING id`);
  const admin:Actor={id:firstAdmin.id,name:"Admin 1",email:"admin1@demo.cl",role:"admin",client_id:null};
  const otherAdmin:Actor={id:secondAdmin.id,name:"Admin 2",email:"admin2@demo.cl",role:"admin",client_id:null};
  const ops:Actor={id:operator.id,name:"Operaciones",email:"ops@demo.cl",role:"operaciones",client_id:null};
  await assert.rejects(()=>createUser(ops,{name:"Intruso",email:"intruso@demo.cl",password:"clave-larga-2026",role:"admin",client_id:""}),PilotError);
  await assert.rejects(()=>createUser(admin,{name:"Portal",email:"portal@demo.cl",password:"clave-larga-2026",role:"cliente",client_id:""}),PilotError);
  const portalId=await createUser(admin,{name:"Portal",email:"portal@demo.cl",password:"clave-larga-2026",role:"cliente",client_id:companyA.id});
  assert.equal((await users.listUsers(admin)).length,5);
  await assert.rejects(()=>users.listUsers(ops),users.UsersError);
  const [serviceA]=await db.query<{id:string}>(`INSERT INTO service_requests
    (submission_key,client_id,site_id,service_type,waste_type,origin,destination,created_by)
    VALUES ($1,$2,$3,'retiro','Metal','Origen A','Destino A',$4) RETURNING id`,[randomUUID(),companyA.id,siteA.id,admin.id]);
  const [serviceB]=await db.query<{id:string}>(`INSERT INTO service_requests
    (submission_key,client_id,site_id,service_type,waste_type,origin,destination,created_by)
    VALUES ($1,$2,$3,'retiro','Metal','Origen B','Destino B',$4) RETURNING id`,[randomUUID(),companyB.id,siteB.id,admin.id]);
  await db.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ('session-portal',$1,now()+interval '1 hour')",[portalId]);
  const oldPortal:Actor={id:portalId,name:"Portal",email:"portal@demo.cl",role:"cliente",client_id:companyA.id};
  assert.deepEqual((await listServices(oldPortal)).map(s=>s.id),[serviceA.id]);
  await users.changeUserRole(admin,portalId,{role:"cliente",client_id:companyB.id});
  const [account]=await db.query<{role:"cliente";client_id:string}>("SELECT role,client_id FROM users WHERE id=$1",[portalId]);
  assert.deepEqual((await listServices({...oldPortal,client_id:account.client_id})).map(s=>s.id),[serviceB.id]);
  assert.equal((await db.query("SELECT token_hash FROM sessions WHERE user_id=$1",[portalId])).length,0);
  await assert.rejects(()=>users.changeUserRole(ops,portalId,{role:"admin",client_id:""}),users.UsersError);
  await assert.rejects(()=>users.changeUserRole(admin,portalId,{role:"cliente",client_id:""}),users.UsersError);
  await assert.rejects(()=>users.changeUserRole(admin,admin.id,{role:"operaciones",client_id:""}),users.UsersError);
  await db.query("UPDATE service_requests SET status='programada',driver_id=$2 WHERE id=$1",[serviceA.id,driver.id]);
  await assert.rejects(()=>users.changeUserRole(admin,driver.id,{role:"operaciones",client_id:""}),users.UsersError);
  await db.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ('second-session',$1,now()+interval '1 hour')",[portalId]);
  await users.setUserActive(admin,portalId,"false");
  assert.equal((await db.query("SELECT token_hash FROM sessions WHERE user_id=$1",[portalId])).length,0);
  assert.equal((await users.listUsers(admin)).find(user=>user.id===portalId)?.active,false);
  await users.setUserActive(admin,portalId,"true");
  assert.equal((await users.listUsers(admin)).find(user=>user.id===portalId)?.active,true);
  await db.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ('reset-session',$1,now()+interval '1 hour')",[portalId]);
  assert.equal(await users.resetUserPassword(admin,portalId,"otra-clave-larga-2026"),false);
  const [changed]=await db.query<{password_hash:string}>("SELECT password_hash FROM users WHERE id=$1",[portalId]);
  assert.equal(await verifyPassword("otra-clave-larga-2026",changed.password_hash),true);
  assert.equal((await db.query("SELECT token_hash FROM sessions WHERE user_id=$1",[portalId])).length,0);
  await users.setUserActive(admin,otherAdmin.id,"false");
  await assert.rejects(()=>users.setUserActive(otherAdmin,portalId,"false"),users.UsersError);
  await assert.rejects(()=>users.setUserActive(admin,admin.id,"false"),users.UsersError);
  const audits=await db.query<{previous_value:object|null;next_value:object}>("SELECT previous_value,next_value FROM audit_events WHERE entity_type='user' AND entity_id=$1",[portalId]);
  assert.equal(audits.length,5);
  assert.doesNotMatch(JSON.stringify(audits),/otra-clave-larga-2026|password_hash/);
});
