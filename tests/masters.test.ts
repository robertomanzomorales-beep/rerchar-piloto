import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("corrección de maestros conserva vínculos y registra los cambios",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const {updateClient,updateSite,updateAsset,MastersError}=await import("../lib/masters");
  for(const name of ["001_piloto.sql","002_flota_y_despacho.sql","003_abastecimiento.sql","004_mantenimiento_combustible.sql","005_contenedores.sql","006_acreditacion.sql","007_finanzas.sql","008_trazabilidad_ambiental.sql","009_certificados.sql","010_evidencia_persistente.sql","011_operacion_real_2026.sql"]){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [operator]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role) VALUES ('ops@demo.cl','Operaciones','hash','operaciones') RETURNING id");
  const [client]=await db.query<{id:string}>("INSERT INTO clients (name,tax_id) VALUES ('Cliente antiguo','123') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites (client_id,name,address) VALUES ($1,'Faena antigua','Calama') RETURNING id",[client.id]);
  const [asset]=await db.query<{id:string}>("INSERT INTO assets (code,label,kind,plate) VALUES ('CAM-01','Camión antiguo','camion','ABC123') RETURNING id");
  const [portal]=await db.query<{id:string}>("INSERT INTO users (email,name,password_hash,role,client_id) VALUES ('portal@demo.cl','Portal','hash','cliente',$1) RETURNING id",[client.id]);
  const [service]=await db.query<{id:string}>(`INSERT INTO service_requests
    (submission_key,client_id,site_id,service_type,waste_type,origin,destination,created_by,assigned_asset_id)
    VALUES ($1,$2,$3,'retiro','Metal','Origen','Destino',$4,$5) RETURNING id`,
    [randomUUID(),client.id,site.id,operator.id,asset.id]);
  const actor:Actor={id:operator.id,name:"Operaciones",email:"ops@demo.cl",role:"operaciones",client_id:null};
  const outside:Actor={id:portal.id,name:"Portal",email:"portal@demo.cl",role:"cliente",client_id:client.id};
  await assert.rejects(()=>updateClient(outside,client.id,{name:"Otra razón social",tax_id:"",contact_name:""}),MastersError);
  await updateClient(actor,client.id,{name:"Cliente corregido",tax_id:"456",contact_name:"Contacto nuevo"});
  await updateSite(actor,site.id,{name:"Faena corregida",address:"Puerto Seco"});
  await updateAsset(actor,asset.id,{label:"Camión corregido",plate:"xy-987"});
  await updateAsset(actor,asset.id,{label:"Camión corregido",plate:"XY-987"});
  const [record]=await db.query<{client_id:string;site_id:string;assigned_asset_id:string;client_name:string;site_name:string;asset_label:string;code:string;kind:string;plate:string}>(`
    SELECT s.client_id,s.site_id,s.assigned_asset_id,c.name AS client_name,cs.name AS site_name,
      a.label AS asset_label,a.code,a.kind,a.plate
    FROM service_requests s JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
    JOIN assets a ON a.id=s.assigned_asset_id WHERE s.id=$1`,[service.id]);
  assert.deepEqual([record.client_id,record.site_id,record.assigned_asset_id],[client.id,site.id,asset.id]);
  assert.deepEqual([record.client_name,record.site_name,record.asset_label,record.code,record.kind,record.plate],
    ["Cliente corregido","Faena corregida","Camión corregido","CAM-01","camion","XY-987"]);
  assert.equal((await db.query<{client_id:string}>("SELECT client_id FROM users WHERE id=$1",[portal.id]))[0].client_id,client.id);
  const history=await db.query<{entity_type:string;previous_value:{name?:string;label?:string};next_value:{name?:string;label?:string}}>(
    "SELECT entity_type,previous_value,next_value FROM audit_events WHERE action='update' ORDER BY created_at,id");
  assert.equal(history.length,3);
  assert.deepEqual(new Set(history.map(entry=>entry.entity_type)),new Set(["client","client_site","asset"]));
  assert.ok(history.some(entry=>entry.previous_value.name==="Cliente antiguo"&&entry.next_value.name==="Cliente corregido"));
  await db.query("UPDATE users SET role='conductor' WHERE id=$1",[operator.id]);
  await assert.rejects(()=>updateSite(actor,site.id,{name:"Cambio indebido",address:""}),MastersError);
  assert.equal((await db.query<{name:string}>("SELECT name FROM client_sites WHERE id=$1",[site.id]))[0].name,"Faena corregida");
});
