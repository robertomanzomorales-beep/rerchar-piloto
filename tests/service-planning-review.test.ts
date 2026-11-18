import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("la planificación exige verificaciones de los recursos actuales y conductor activo",async t=>{
  Object.assign(process.env,{DATABASE_URL:"",PGLITE_DATA_DIR:"memory://",VERCEL:""});
  const {db,transaction}=await import("../lib/db"),pilot=await import("../lib/pilot");
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [admin,first,second]=await db.query<Actor>(`INSERT INTO users(email,name,password_hash,role) VALUES
    ('admin@example.invalid','Admin','h','admin'),('first@example.invalid','Primero','h','conductor'),
    ('second@example.invalid','Segundo','h','conductor') RETURNING id,name,email,role,client_id`);
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente planificación') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const checked={vehicle_ok:true,documents_ok:true,containment_ok:true,ppe_ok:true,comment:"Inspección anterior completa"};
  const checks=(id:string)=>db.query<{comment:string;completed_by:string}>("SELECT * FROM service_checklists WHERE service_id=$1",[id]);
  let position=0;
  async function fixture(company:"rerchar"|"e_y_j"){
    const n=++position,service=await pilot.createService(admin,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,
      operating_company:company,service_type:"traslado",waste_type:"Material",origin:"Faena",destination:"Patio",priority:"normal",notes:""});
    const assets=await db.query<{id:string}>(`INSERT INTO assets(code,label,kind) VALUES($1,'Camión primero','camion'),($2,'Camión segundo','camion'),($3,'Rampla primera','rampa'),($4,'Rampla segunda','rampa') RETURNING id`,["P"+n+"A","P"+n+"B","P"+n+"R","P"+n+"S"]);
    const plan={asset_id:assets[0].id,ramp_asset_id:assets[2].id,driver_id:first.id,scheduled_for:`2027-02-${String(n*3).padStart(2,"0")}T08:00`};
    await pilot.assignService(admin,service,plan);await pilot.saveChecklist(admin,service,checked);
    return {service,plan,assets};
  }
  for(const company of ["rerchar","e_y_j"] as const)await t.test(company+": cambiar camión o conductor invalida el checklist y conserva trazabilidad",async()=>{
    const {service,plan,assets}=await fixture(company);
    await pilot.assignService(admin,service,plan);assert.equal((await checks(service)).length,1,"repetir la misma planificación conserva la inspección");
    await db.query("UPDATE assets SET available=false WHERE id=$1",[assets[1].id]);
    await assert.rejects(()=>pilot.assignService(admin,service,{...plan,asset_id:assets[1].id}),/disponible/);
    assert.equal((await checks(service)).length,1,"un rechazo no invalida ni escribe parcialmente");
    await db.query("UPDATE assets SET available=true WHERE id=$1",[assets[1].id]);
    await pilot.assignService(admin,service,{...plan,asset_id:assets[1].id,driver_id:second.id});
    assert.equal((await checks(service)).length,0,"el checklist del camión y conductor anteriores no habilita la ruta");
    const [event]=await db.query<{previous_value:Record<string,unknown>}>("SELECT previous_value FROM service_events WHERE service_id=$1 AND kind='checklist_invalidado'",[service]);
    assert.equal(event?.previous_value.comment,checked.comment);assert.equal(event?.previous_value.completed_by,admin.id);
    await assert.rejects(()=>pilot.startService(admin,service),/checklist/);
    await pilot.saveChecklist(admin,service,checked);await pilot.startService(admin,service);
    assert.equal((await pilot.getService(admin,service)).status,"en_ruta");
  });
  await t.test("cambiar rampla o fecha exige repetir el control",async()=>{
    const {service,plan,assets}=await fixture("rerchar");
    await pilot.assignService(admin,service,{...plan,ramp_asset_id:assets[3].id});assert.equal((await checks(service)).length,0);
    await pilot.saveChecklist(admin,service,checked);
    const next={...plan,ramp_asset_id:assets[3].id,scheduled_for:plan.scheduled_for.replace("08:00","12:30")};
    await pilot.assignService(admin,service,next);assert.equal((await checks(service)).length,0);
  });
  await t.test("un conductor propio desactivado después de programar no puede iniciar",async()=>{
    const {service}=await fixture("e_y_j");await db.query("UPDATE users SET active=false WHERE id=$1",[first.id]);
    await assert.rejects(()=>pilot.startService(admin,service),/conductor.*activo|conductor.*inactivo/i);
    await db.query("UPDATE users SET active=true WHERE id=$1",[first.id]);await pilot.startService(admin,service);
  });
  await t.test("un transportista tercero desactivado tampoco habilita la ruta",async()=>{
    await db.query("UPDATE users SET active=true WHERE id=$1",[first.id]);
    const {service,plan}=await fixture("rerchar");
    const [external]=await db.query<{id:string}>("INSERT INTO external_drivers(name,tax_id,company_name,created_by) VALUES('Tercero','12345678-5','Transporte de prueba',$1) RETURNING id",[admin.id]);
    await pilot.assignService(admin,service,{...plan,driver_id:"",external_driver_id:external.id});await pilot.saveChecklist(admin,service,checked);
    await db.query("UPDATE external_drivers SET active=false WHERE id=$1",[external.id]);
    await assert.rejects(()=>pilot.startService(admin,service),/conductor.*activo|conductor.*inactivo/i);
  });
});
