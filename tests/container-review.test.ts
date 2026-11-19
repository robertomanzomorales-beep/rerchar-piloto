import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";
import {containerContext,containerDraft,containerHref} from "../lib/container-form-state";

test("tolvas conserva borradores acotados y el contexto de navegación",()=>{
  const form=new FormData();form.set("note","Línea\r\n".repeat(90));form.set("container_id","x".repeat(200));form.set("photo_retry","on");form.set("omit_photo","on");form.set("password","no devolver");
  const draft=containerDraft("move",form);assert.equal(draft.note!.length,500);assert.ok(!draft.note!.includes("\r"));assert.equal(draft.container_id!.length,36);assert.equal(draft.photo_retry,"on");assert.equal(draft.omit_photo,"on");assert.ok(!("password"in draft));
  assert.deepEqual(containerContext({empresa:"otra",unidad:"https://example.invalid",pagina:"-1",pagina_movimientos:"10001",pagina_registros:"3"}),{pagina_registros:"3"});
  const href=containerHref({empresa:"e_y_j",pagina:"2",pagina_movimientos:"4"},"movimiento-unidad",{ok:"1"});assert.equal(href,"/contenedores?empresa=e_y_j&pagina=2&pagina_movimientos=4&ok=1#movimiento-unidad");
});

test("tolvas pagina historiales completos, conserva servicios antiguos y fotos sin cortes",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),containers=await import("../lib/containers");
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(resolve("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [actor,driver]=await db.query<Actor>("INSERT INTO users(email,name,password_hash,role) VALUES('containers-admin@example.invalid','Admin tolvas','h','admin'),('containers-driver@example.invalid','Conductor','h','conductor') RETURNING id,name,email,role,client_id");
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente de prueba') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena de prueba') RETURNING id",[client.id]);
  const units=await db.query<{id:string}>(`INSERT INTO containers(code,kind,capacity_m3,location_name,created_by,updated_at)
    SELECT 'TOL-'||lpad(n::text,3,'0'),'tolva',12,'Patio',$1,'2026-10-01' FROM generate_series(1,415) n RETURNING id`,[actor.id]);
  const services=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,priority,created_by,operating_company,status,driver_id,created_at)
    SELECT gen_random_uuid(),$1,$2,'retiro','Chatarra','Faena','Patio','normal',$3,CASE WHEN n%2=0 THEN 'rerchar' ELSE 'e_y_j' END,'programada',$4,now()-n*interval '1 day' FROM generate_series(1,161) n RETURNING id`,[client.id,site.id,actor.id,driver.id]);
  await db.query(`INSERT INTO container_movements(container_id,kind,next_status,next_location,note,actor_id,created_at)
    SELECT $1,'traslado','en_transito','Camión','Movimiento '||n,$2,'2026-10-01' FROM generate_series(1,317) n`,[units[0].id,actor.id]);
  await db.query(`INSERT INTO container_service_records(container_id,kind,record_date,kilometers,description,recorded_by,created_at)
    SELECT $1,'kilometraje','2026-10-01',12.5,'Traslado '||n,$2,'2026-10-01' FROM generate_series(1,317) n`,[units[0].id,actor.id]);
  await db.query("INSERT INTO container_service_records(container_id,kind,record_date,description,recorded_by) VALUES($1,'mantenimiento','2026-10-02','Unidad distinta',$2)",[units[1].id,actor.id]);
  await t.test("todos los registros son accesibles una sola vez con fechas empatadas",async()=>{
    const pages=await Promise.all([1,2,3,4].map(page=>containers.listContainers(actor,{unitId:units[0].id,movementPage:page,recordPage:page})));
    assert.equal(pages[0].containers.length,415);assert.equal(pages[0].services.length,161);assert.equal(pages[0].totalMovements,317);assert.equal(pages[0].totalRecords,317);
    for(const key of ["movements","records"] as const){assert.deepEqual(pages.map(x=>x[key].length),[100,100,100,17]);assert.equal(new Set(pages.flatMap(x=>x[key].map(r=>r.id))).size,317);assert.ok(pages.every(x=>x[key].every(r=>r.container_id===units[0].id)));}
    const clamp=await containers.listContainers(actor,{unitId:units[0].id,movementPage:999,recordPage:999});assert.equal(clamp.movementPage,4);assert.equal(clamp.recordPage,4);
    assert.equal((await containers.listContainers(actor,{unitId:units[2].id})).totalRecords,0);
    await assert.rejects(()=>containers.listContainers(actor,{unitId:"unidad inválida"}),containers.ContainerError);
  });
  await t.test("más de 60 instalaciones de una faena conservan su evidencia y permisos",async()=>{
    for(const unit of units.slice(2,67))await containers.moveContainer(actor,unit.id,{action:"instalar",site_id:site.id,service_id:services[160].id,waste_type:"Metal",note:"Instalación de prueba"});
    const photos=await containers.listServiceContainerPhotos(driver,services[160].id);assert.equal(photos.length,65);
    const bytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
    await containers.uploadServiceContainerPhoto(driver,services[160].id,units[2].id,new File([bytes],"foto.html",{type:"text/html"}));
    const movement=photos.find(x=>x.container_id===units[2].id)!;
    const photo=await containers.getContainerMovementPhoto(actor,movement.movement_id);assert.equal(photo?.filename,"foto.png");assert.equal(photo?.mime,"image/png");assert.deepEqual(Buffer.from(photo!.content),bytes);
    await assert.rejects(()=>containers.getContainerMovementPhoto(driver,movement.movement_id),containers.ContainerError);
    const list=await containers.listContainers(actor);assert.ok(list.services.find(x=>x.id===services[160].id)?.previous_container_ids.includes(units[2].id));
  });
  await assert.rejects(()=>containers.listContainers(driver),containers.ContainerError);
});
