import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("acreditaciones mantiene alertas vigentes e historial completo de propios y terceros",async t=>{
  Object.assign(process.env,{DATABASE_URL:"",PGLITE_DATA_DIR:"memory://",VERCEL:""});
  const {db,transaction}=await import("../lib/db"),personnel=await import("../lib/personnel");
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [admin]=await db.query<Actor>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin') RETURNING id,name,email,role,client_id");
  const fixtures:{company:string;client:string;site:string;driver:string;external:string;requirement:string}[]=[];
  for(const [index,company] of ["rerchar","e_y_j"].entries()){
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES($1) RETURNING id",["Cliente "+company]);
    const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
    const [driver]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES($1,'Conductor propio','h','conductor') RETURNING id",[company+"@example.invalid"]);
    await db.query("INSERT INTO worker_profiles(user_id,employer,updated_by) VALUES($1,$2,$3)",[driver.id,company,admin.id]);
    const external=await personnel.createExternalDriver(admin,{name:"Tercero "+company,tax_id:index?"11111111-1":"12345678-5",company_name:"Transporte prueba"});
    await db.query("INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,external_driver_id,created_by) VALUES(gen_random_uuid(),$1,$2,$3,'traslado','Material','Origen','Destino','programada',$4,$5)",[client.id,site.id,company,external,admin.id]);
    const requirement=await personnel.createRequirement(admin,{client_id:client.id,site_id:site.id,name:"Inducción de faena",kind:"curso",warning_days:30});
    fixtures.push({company,client:client.id,site:site.id,driver:driver.id,external,requirement});
    await t.test(company+": una renovación futura no oculta un documento vencido",async()=>{
      const old=[];const future=[];
      for(const [table,workerColumn,worker] of [["worker_credentials","user_id",driver.id],["external_driver_credentials","external_driver_id",external]]){
        const [expired]=await db.query<{id:string}>(`INSERT INTO ${table}(${workerColumn},requirement_id,reference,issued_on,expires_on,state,created_by,reviewed_by,reviewed_at)
          VALUES($1,$2,'Anterior',(now() AT TIME ZONE 'America/Santiago')::date-365,(now() AT TIME ZONE 'America/Santiago')::date-1,'verificada',$3,$3,now()) RETURNING id`,[worker,requirement,admin.id]);old.push(expired.id);
        const [renewal]=await db.query<{id:string}>(`INSERT INTO ${table}(${workerColumn},requirement_id,reference,issued_on,expires_on,state,created_by,reviewed_by,reviewed_at)
          VALUES($1,$2,'Renovación futura',(now() AT TIME ZONE 'America/Santiago')::date+1,(now() AT TIME ZONE 'America/Santiago')::date+365,'verificada',$3,$3,now()) RETURNING id`,[worker,requirement,admin.id]);future.push(renewal.id);
      }
      assert.deepEqual(new Set((await personnel.listCredentialAlerts(admin,company as "rerchar"|"e_y_j")).map(x=>x.id)),new Set(old));
      assert.equal((await personnel.findMissingRequirements(db,driver.id,client.id,site.id)).length,1);
      assert.equal((await personnel.findMissingExternalRequirements(db,external,client.id,site.id)).length,1);
      await db.query("UPDATE worker_credentials SET issued_on=(now() AT TIME ZONE 'America/Santiago')::date WHERE id=$1",[future[0]]);
      await db.query("UPDATE external_driver_credentials SET issued_on=(now() AT TIME ZONE 'America/Santiago')::date WHERE id=$1",[future[1]]);
      assert.equal((await personnel.listCredentialAlerts(admin,company as "rerchar"|"e_y_j")).length,0);
      assert.equal((await personnel.findMissingRequirements(db,driver.id,client.id,site.id)).length,0);
      assert.equal((await personnel.findMissingExternalRequirements(db,external,client.id,site.id)).length,0);
    });
  }
  await t.test("más de 400 documentos pendientes no esconden el respaldo verificado ni el resto del historial",async()=>{
    const f=fixtures[0];
    for(const [table,column,worker,total] of [["worker_credentials","user_id",f.driver,450],["external_driver_credentials","external_driver_id",f.external,430]] as const){
      await db.query(`INSERT INTO ${table}(${column},requirement_id,reference,issued_on,expires_on,created_by)
        SELECT $1,$2,'Pendiente '||n,(now() AT TIME ZONE 'America/Santiago')::date,(now() AT TIME ZONE 'America/Santiago')::date+365,$3 FROM generate_series(1,$4::integer) n`,[worker,f.requirement,admin.id,total]);
    }
    const all=await personnel.listPersonnel(admin);
    const [internal]=await db.query<{total:string}>("SELECT count(*)::text AS total FROM worker_credentials"),[external]=await db.query<{total:string}>("SELECT count(*)::text AS total FROM external_driver_credentials");
    assert.equal(all.credentials.length,Number(internal.total));assert.equal(all.externalCredentials.length,Number(external.total));
    assert.ok(all.credentials.some(x=>x.user_id===f.driver&&x.state==="verificada"));assert.ok(all.externalCredentials.some(x=>x.external_driver_id===f.external&&x.state==="verificada"));
    const repeated=await personnel.listPersonnel(admin);assert.deepEqual(repeated.credentials.map(x=>x.id),all.credentials.map(x=>x.id));
    await assert.rejects(()=>personnel.listPersonnel({...admin,role:"conductor"}),personnel.PersonnelError);
    await assert.rejects(()=>personnel.listPersonnel({...admin,role:"cliente"}),personnel.PersonnelError);
  });
});
