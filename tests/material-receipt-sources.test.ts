import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("ingresos propone referencias del servicio RERCHAR y distingue tickets de origen y destino",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const {listReceiptSourceServices}=await import("../lib/material-receipt-sources");
  for(const file of (await readdir(resolve(process.cwd(),"db"))).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${file}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(value=>value.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente de compra') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena norte') RETURNING id",[client.id]);
  const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('ops@ejemplo.cl','Operaciones','h','operaciones') RETURNING id");
  const owner:Actor={id:user.id,name:"Operaciones",email:"ops@ejemplo.cl",role:"operaciones",client_id:null};
  const [rerchar]=await db.query<{id:string}>(`INSERT INTO service_requests
    (submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,guide_number,created_by)
    VALUES($1,$2,$3,'rerchar','compra','Cobre','Faena norte','Patio RERCHAR','GT-77',$4) RETURNING id`,
    [randomUUID(),client.id,site.id,user.id]);
  await db.query(`INSERT INTO service_requests
    (submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by)
    VALUES($1,$2,$3,'e_y_j','traslado','Residuo','Faena norte','Destino',$4)`,[randomUUID(),client.id,site.id,user.id]);
  await db.query(`INSERT INTO service_guide_controls
    (service_id,guide_number,line_number,movement_date,movement_type,origin_ticket,destination_ticket,origin_kg,arrival_kg,recorded_by)
    VALUES ($1,'GT-77',1,'2026-11-10','compra','OR-1','DEST-1',100,98,$2),
           ($1,'GT-77',2,'2026-11-10','compra','OR-1','DEST-1',50,49,$2),
           ($1,'GT-78',1,'2026-11-11','compra','OR-2','DEST-2',80,78,$2)`,[rerchar.id,user.id]);
  const rows=await listReceiptSourceServices(owner);
  assert.equal(rows.length,1,"no se mezclan referencias de E y J");
  assert.equal(rows[0].service_guide,"GT-77");
  assert.deepEqual(rows[0].control_guides,["GT-77","GT-78"]);
  assert.deepEqual(rows[0].origin_tickets,["OR-1","OR-2"]);
  assert.deepEqual(rows[0].destination_tickets,["DEST-1","DEST-2"]);
  await assert.rejects(()=>listReceiptSourceServices({...owner,role:"cliente",client_id:client.id}),/Sin acceso/);
});
