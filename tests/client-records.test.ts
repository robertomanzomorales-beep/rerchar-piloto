import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";
import {clientContext,clientHref,retirementNet} from "../lib/client-records";
import {masterContext,masterDraft,matchesMaster} from "../lib/master-form-state";

test("búsqueda y contexto de clientes conservan filtros válidos y acotan borradores",()=>{
  assert.equal(matchesMaster("camion",["Camión de apoyo"]),true);assert.equal(matchesMaster("ZX-22",["Equipo","ZX-22"]),true);
  assert.deepEqual(masterContext({empresa:"e_y_j",q:"  Cliente  ",pagina_clientes:"3",pagina_centros:"-1"}),{empresa:"e_y_j",q:"Cliente",pagina_clientes:"3"});
  const form=new FormData();form.set("name","N".repeat(190));form.set("email","contacto@example.invalid");form.set("password","no devolver");
  const draft=masterDraft("client",form);assert.equal(draft.name!.length,180);assert.ok(!("password"in draft));
  assert.deepEqual(clientContext({empresa:"otra",buscar:"  50%  ",pagina:"0",pagina_archivos:"4"}),{buscar:"50%",pagina_archivos:"4"});
  assert.equal(clientHref({empresa:"e_y_j",buscar:"50%",pagina:"2"},"abc"),"/clientes/abc?empresa=e_y_j&buscar=50%25&pagina=2");
  assert.equal(retirementNet({gross_kg:null,tare_kg:"0"}),null);assert.equal(retirementNet({gross_kg:"5",tare_kg:"10"}),null);assert.equal(retirementNet({gross_kg:"10.50",tare_kg:"2.25"}),8.25);
});

test("carpeta y maestros conservan todos los registros y la separación entre clientes",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),records=await import("../lib/client-records"),masters=await import("../lib/masters"),pilot=await import("../lib/pilot");
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(resolve("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [actor]=await db.query<Actor>("INSERT INTO users(email,name,password_hash,role) VALUES('client-admin@example.invalid','Admin','h','admin') RETURNING id,name,email,role,client_id");
  const clients=await db.query<{id:string}>("INSERT INTO clients(name,tax_id,contact_name) SELECT 'Cliente '||lpad(n::text,3,'0'),'RUT-'||n,'Contacto de prueba' FROM generate_series(1,315) n RETURNING id");
  const [literal]=await db.query<{id:string}>("INSERT INTO clients(name,contact_name) VALUES('Cliente 50%_literal','Contacto') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena de prueba') RETURNING id",[clients[0].id]);
  const [portal]=await db.query<Actor>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES('client-portal@example.invalid','Portal','h','cliente',$1) RETURNING id,name,email,role,client_id",[clients[0].id]);
  const [driver]=await db.query<Actor>("INSERT INTO users(email,name,password_hash,role) VALUES('client-driver@example.invalid','Conductor','h','conductor') RETURNING id,name,email,role,client_id");
  const services=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,created_by,operating_company,status,gross_kg,tare_kg,closed_at,created_at)
    SELECT gen_random_uuid(),$1,$2,'retiro','Metal','Faena','Patio',$3,'rerchar','completada',10.5,2.25,'2026-10-01','2026-10-01' FROM generate_series(1,517) n RETURNING id`,[clients[0].id,site.id,actor.id]);
  await db.query("UPDATE service_requests SET gross_kg=NULL,tare_kg=NULL WHERE id=$1",[services[516].id]);
  await db.query("UPDATE service_requests SET closed_at=NULL WHERE id=$1",[services[515].id]);
  await db.query(`INSERT INTO service_evidence(service_id,description,document_kind,created_by,created_at)
    SELECT $1,'Archivo '||n,'otro',$2,'2026-10-01' FROM generate_series(1,421) n`,[services[0].id,actor.id]);
  await db.query(`INSERT INTO client_quotes(submission_key,client_id,issuer,client_name,title,issued_on,valid_until,status,created_by,created_at)
    SELECT gen_random_uuid(),$1,'rerchar','Cliente de prueba','Cotización '||n,'2026-10-01','2026-11-01',CASE WHEN n<=200 THEN 'enviada' ELSE 'borrador' END,$2,'2026-10-01' FROM generate_series(1,217) n`,[clients[0].id,actor.id]);
  await db.query(`INSERT INTO material_receipts(client_id,kind,movement_on,site_name,weighing_ticket,material_name,net_basis,rerchar_kg,recorded_by,created_at)
    SELECT $1,'ingreso','2026-10-01','Faena de prueba','T-'||n,'Metal','rerchar',12,$2,'2026-10-01' FROM generate_series(1,213) n`,[clients[0].id,actor.id]);
  for(const s of services.slice(0,205))await db.query("INSERT INTO service_certificates(service_id,version,code,snapshot,issued_by,issued_at) VALUES($1,1,replace(gen_random_uuid()::text,'-','')||repeat('a',16),'{}',$2,'2026-10-01')",[s.id,actor.id]);
  const finance=await import("../lib/finance");
  const contractId=await finance.createContract(actor,{client_id:clients[0].id,site_id:site.id,operating_company:"rerchar",code:"CLIENT-TEST",starts_on:"2026-01-01",ends_on:"",notes:""});
  const tariffId=await finance.createTariff(actor,{contract_id:contractId,service_type:"retiro",waste_type:"",unit:"servicio",unit_price_clp:"100",valid_from:"2026-01-01",valid_until:""});
  await db.query(`INSERT INTO service_valuations(service_id,tariff_id,quantity,unit_price_clp,total_clp,created_by) SELECT id,$3,1,100,100,$2 FROM service_requests WHERE client_id=$1`,[clients[0].id,actor.id,tariffId]);
  await db.query(`INSERT INTO service_invoices(valuation_id,invoice_number,issued_on,due_on,total_clp,created_by)
    SELECT id,'F-'||row_number() OVER(ORDER BY id),'2026-10-01','2026-11-01',100,$2 FROM service_valuations WHERE service_id=ANY($1::uuid[])`,[services.slice(0,207).map(x=>x.id),actor.id]);
  await t.test("el directorio permite recorrer todas las fichas y buscar caracteres literales",async()=>{
    const all=await Promise.all([1,2,3,4].map(page=>records.listClientDirectory(actor,"",page)));
    assert.deepEqual(all.map(x=>x.clients.length),[100,100,100,16]);assert.equal(new Set(all.flatMap(x=>x.clients.map(c=>c.id))).size,316);
    assert.deepEqual((await records.listClientDirectory(actor,"50%_")).clients.map(x=>x.id),[literal.id]);
    assert.equal((await records.listClientDirectory(actor,"no existe")).total,0);assert.equal((await records.listClientDirectory(actor,"",999)).page,4);
  });
  await t.test("seis historiales mantienen orden estable y totales completos",async()=>{
    const pages=await Promise.all([1,2,3,4,5,6].map(page=>records.listClientDossier(actor,clients[0].id,Object.fromEntries(records.dossierPageKeys.map(key=>[key,String(page)])))));
    const first=pages[0];assert.deepEqual(first.totals,{pagina_servicios:517,pagina_cotizaciones:217,pagina_certificados:205,pagina_facturas:207,pagina_ingresos:213,pagina_archivos:421});
    for(const [key,rows]of [["pagina_servicios","services"],["pagina_cotizaciones","quotes"],["pagina_certificados","certificates"],["pagina_facturas","invoices"],["pagina_ingresos","receipts"],["pagina_archivos","documents"]] as const){
      const distinctPages=pages.slice(0,Math.ceil(first.totals[key]/100));const ids=distinctPages.flatMap(x=>x[rows].map(r=>r.id));assert.equal(ids.length,first.totals[key]);assert.equal(new Set(ids).size,first.totals[key]);
    }
    assert.equal((await records.listClientDossier(portal,clients[0].id)).totals.pagina_cotizaciones,200,"el portal no expone borradores");
    await assert.rejects(()=>records.listClientDossier(portal,clients[1].id),records.ClientRecordsError);
    await assert.rejects(()=>records.listClientDossier(driver,clients[0].id),records.ClientRecordsError);
  });
  await t.test("el resumen imprimible supera quinientos retiros y distingue pesos pendientes",async()=>{
    const result=await records.listClientRetirements(portal,clients[0].id,"rerchar");assert.equal(result.services.length,517);assert.equal(result.unweighed,1);assert.equal(result.total,516*8.25);assert.ok(result.services.every(s=>s.closed_at));
    assert.equal((await records.listClientRetirements(actor,clients[0].id,"e_y_j")).services.length,0);
    await assert.rejects(()=>records.listClientRetirements(portal,clients[1].id,"rerchar"),records.ClientRecordsError);
  });
  await t.test("los maestros excluyen faenas archivadas y verifican el perfil actual antes de crear",async()=>{
    const [archived]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena archivada') RETURNING id",[clients[1].id]);
    await db.query("UPDATE clients SET deleted_at=now() WHERE id=$1",[clients[1].id]);
    assert.ok(!(await masters.listMasters(actor)).sites.some(x=>x.id===archived.id));
    await assert.rejects(()=>masters.updateSite(actor,archived.id,{name:"Cambio",address:""}),masters.MastersError);
    await assert.rejects(()=>pilot.createSite(actor,{client_id:clients[1].id,name:"Nueva faena",address:""}));
    await db.query("UPDATE users SET active=false WHERE id=$1",[actor.id]);
    await assert.rejects(()=>pilot.createClient(actor,{name:"Cliente bloqueado",contact_name:"Contacto",tax_id:"",email:"",address:""}),masters.MastersError);
    await assert.rejects(()=>pilot.createAsset(actor,{code:"NO-CREAR",label:"Bloqueado",plate:"",kind:"equipo"}),masters.MastersError);
  });
});
