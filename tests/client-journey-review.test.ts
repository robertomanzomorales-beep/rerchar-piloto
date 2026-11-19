import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("la consulta del cliente reconoce el folio visible y conserva el alcance en todo el historial",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),{listServices}=await import("../lib/pilot"),{serviceFolio}=await import("../lib/companies");
  for(const name of (await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});}
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente recorrido 2026'),('Otro cliente recorrido') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena propia') RETURNING id",[client.id]),[otherSite]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena ajena') RETURNING id",[other.id]);
  const users=await db.query<{id:string;role:Actor['role'];client_id:string|null}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES('admin@journey.example.invalid','Admin','h','admin',NULL),('driver@journey.example.invalid','Conductor','h','conductor',NULL),('client@journey.example.invalid','Cliente','h','cliente',$1),('other@journey.example.invalid','Ajeno','h','cliente',$2) RETURNING id,role,client_id",[client.id,other.id]),[admin,driver,portal,foreign]=users.map(u=>({...u,name:"Revisión",email:"test@example.invalid"}));
  const own:Record<string,{id:string;folio:string;operating_company:"rerchar"|"e_y_j"|null}[]>={};
  for(const company of ["rerchar","e_y_j"] as const)own[company]=await db.query<{id:string;folio:string;operating_company:typeof company}>("INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,driver_id,created_by,created_at) SELECT gen_random_uuid(),$1,$2,$3,'retiro','Material recorrido '||n,'Faena','Patio','programada',$4,$5,'2026-11-01' FROM generate_series(1,217) n RETURNING id,folio,operating_company",[client.id,site.id,company,driver.id,admin.id]);
  const [unclassified]=await db.query<{id:string;folio:string;operating_company:null}>("INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by) VALUES(gen_random_uuid(),$1,$2,NULL,'retiro','Sin clasificar','Faena','Patio',$3) RETURNING id,folio,operating_company",[client.id,site.id,admin.id]);
  const [privateService]=await db.query<{id:string;folio:string;operating_company:"rerchar"}>("INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by) VALUES(gen_random_uuid(),$1,$2,'rerchar','retiro','Material ajeno','Faena','Patio',$3) RETURNING id,folio,operating_company",[other.id,otherSite.id,admin.id]);
  await db.query("UPDATE service_requests SET waste_type=$2 WHERE id=$1",[own.rerchar[1].id,serviceFolio(own.rerchar[0])]);
  await t.test("el número y el folio de ambas empresas encuentran el mismo servicio",async()=>{
    for(const company of ["rerchar","e_y_j"]){const expected=own[company][0];for(const query of [String(expected.folio),String(expected.folio).padStart(5,"0"),serviceFolio(expected)," "+serviceFolio(expected).toLowerCase()+" "])assert.deepEqual((await listServices(portal,query)).map(s=>s.id),[expected.id]);}
    assert.deepEqual((await listServices(portal,serviceFolio(unclassified))).map(s=>s.id),[unclassified.id]);
  });
  await t.test("un prefijo no identifica la empresa contraria ni un nombre de material parecido",async()=>{
    const rer=own.rerchar[0];assert.equal((await listServices(portal,"EYJ-"+String(rer.folio).padStart(5,"0"))).length,0);assert.equal((await listServices(portal,serviceFolio(rer),"","e_y_j")).length,0);assert.deepEqual((await listServices(portal,serviceFolio(rer))).map(s=>s.id),[rer.id]);
  });
  await t.test("conocer el folio no amplía el acceso de cliente o conductor",async()=>{
    assert.equal((await listServices(portal,serviceFolio(privateService))).length,0);assert.equal((await listServices(foreign,serviceFolio(own.rerchar[0]))).length,0);assert.equal((await listServices(driver,serviceFolio(privateService))).length,0);assert.equal((await listServices(driver,serviceFolio(own.e_y_j[0])))[0].id,own.e_y_j[0].id);assert.equal((await listServices(admin,serviceFolio(privateService)))[0].id,privateService.id);
  });
  await t.test("las páginas recorren más de doscientos servicios por empresa sin repetirlos",async()=>{
    for(const company of ["rerchar","e_y_j"]){const seen:string[]=[];for(let offset=0;offset<217;offset+=50)seen.push(...(await listServices(portal,"Material recorrido","",company,"",50,"","",offset)).map(s=>s.id));const expected=own[company].filter((_,index)=>company!=="rerchar"||index!==1);assert.equal(seen.length,expected.length);assert.equal(new Set(seen).size,expected.length);assert.deepEqual(new Set(seen),new Set(expected.map(s=>s.id)));}
  });
  await t.test("la búsqueda mantiene texto, filtros y ausencia de registros archivados",async()=>{
    assert.equal((await listServices(portal,"Cliente recorrido 2026","","e_y_j")).length,100);assert.equal((await listServices(portal,"Material recorrido 217","programada","rerchar"))[0].id,own.rerchar[216].id);assert.equal((await listServices(portal,"Material recorrido","completada","rerchar")).length,0);await db.query("UPDATE service_requests SET deleted_at=now() WHERE id=$1",[own.e_y_j[216].id]);assert.equal((await listServices(portal,serviceFolio(own.e_y_j[216]))).length,0);
    for(const query of ["RER-99999999999999999999","EYJ-99999999999999999999999999","RER-no-es-folio","sin coincidencias"])assert.equal((await listServices(portal,query)).length,0);
  });
});
