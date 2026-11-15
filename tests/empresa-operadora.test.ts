import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";
import {companyForPath} from "../lib/companies";

test("las rutas propias no cambian de empresa por un parámetro ajeno",()=>{
  assert.equal(companyForPath("/control-guias","e_y_j"),"rerchar");
  assert.equal(companyForPath("/certificados","e_y_j"),"rerchar");
  assert.equal(companyForPath("/estados-pago/calendario","rerchar"),"e_y_j");
  assert.equal(companyForPath("/cotizaciones","e_y_j"),"e_y_j");
  assert.equal(companyForPath("/",null),null);
});

test("RERCHAR y E y J mantienen servicios, cotizaciones y facturas en su empresa",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const pilot=await import("../lib/pilot");
  const quotes=await import("../lib/quotes");
  const invoices=await import("../lib/supplier-invoices");
  const {serviceFolio}=await import("../lib/companies");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const rentalSql=await readFile(resolve(process.cwd(),"db/027_solicitudes_arriendo.sql"),"utf8");
  await transaction(async tx=>{for(const part of rentalSql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente común') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const [admin]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@demo.cl','Admin','hash','admin') RETURNING id");
  const actor:Actor={id:admin.id,name:"Admin",email:"admin@demo.cl",role:"admin",client_id:null};
  const quoteId=await quotes.createQuote(actor,{submission_key:randomUUID(),client_id:client.id,issuer:"e_y_j",title:"Transporte de residuos",issued_on:"2026-10-13",valid_until:"2026-11-13",line:{description:"Viaje",principal:"transporte",segment:"transporte_batea",quantity:"1",unit:"viaje",unit_price_clp:"10000",taxable:true}});
  await db.query("UPDATE client_quotes SET status='aceptada' WHERE id=$1",[quoteId]);
  const input={submission_key:randomUUID(),client_id:client.id,site_id:site.id,quote_id:quoteId,
    operating_company:"e_y_j",service_type:"traslado",waste_type:"Metal",origin:"Faena",destination:"Planta",priority:"normal",notes:""};
  await assert.rejects(()=>pilot.createService(actor,{...input,operating_company:"rerchar"}),pilot.PilotError);
  const eyjId=await pilot.createService(actor,input);
  assert.equal(await pilot.createService(actor,input),eyjId,"un reintento no duplica la solicitud");
  assert.equal((await pilot.getService(actor,eyjId)).quote_id,quoteId);
  assert.match(serviceFolio(await pilot.getService(actor,eyjId)),/^EYJ-/);
  const rercharId=await pilot.createService(actor,{...input,submission_key:randomUUID(),quote_id:"",operating_company:"rerchar"});
  assert.equal((await pilot.listServices(actor,"","","e_y_j")).length,1);
  assert.equal((await pilot.listServices(actor,"","","rerchar")).length,1);
  assert.equal((await pilot.reportServices(actor,pilot.normalizeReportFilters({company:"e_y_j"}))).length,1);
  const invoice={issuer:"rerchar",supplier_tax_id:"76.123.456-7",supplier_name:"Proveedor",invoice_number:"F-1",
    issued_on:"2026-10-13",description:"Costo de operación",total_clp:"11900"};
  await assert.rejects(()=>invoices.createSupplierInvoice(actor,{...invoice,service_id:eyjId}),invoices.SupplierInvoiceError);
  await invoices.createSupplierInvoice(actor,{...invoice,service_id:rercharId});
  const [old]=await db.query<{id:string;folio:string;operating_company:null}>(`INSERT INTO service_requests
    (submission_key,client_id,site_id,service_type,waste_type,origin,destination,created_by)
    VALUES($1,$2,$3,'retiro','Material','Faena','Patio',$4) RETURNING id,folio,operating_company`,[randomUUID(),client.id,site.id,actor.id]);
  assert.match(serviceFolio(old),/^PIL-/);
  await pilot.classifyServiceCompany(actor,old.id,"rerchar");
  assert.equal((await pilot.getService(actor,old.id)).operating_company,"rerchar");
  await assert.rejects(()=>pilot.classifyServiceCompany(actor,old.id,"e_y_j"),pilot.PilotError);
  assert.equal((await pilot.listServices(actor,"","","pendiente")).length,0);

  const finance=await import("../lib/finance");
  const calendar=await import("../lib/payment-calendar");
  const rentalInput={...input,quote_id:"",submission_key:randomUUID(),service_type:"arriendo",
    request_category:"servicios",waste_type:"Excavadora con garra",estimated_kg:"",
    rental_from:"2026-10-01",rental_to:"2026-10-05"};
  await assert.rejects(()=>pilot.createService(actor,{...rentalInput,rental_to:"2026-09-30"}),pilot.PilotError);
  await assert.rejects(()=>pilot.createService(actor,{...rentalInput,request_category:"compra"}),pilot.PilotError);
  await assert.rejects(()=>pilot.createService(actor,{...rentalInput,estimated_kg:"20"}),pilot.PilotError);
  const rentalId=await pilot.createService(actor,rentalInput);
  await assert.rejects(()=>pilot.createService(actor,{...rentalInput,service_type:"traslado",rental_from:"",rental_to:""}),pilot.PilotError,
    "la misma clave no debe cambiar de subtipo silenciosamente");
  assert.equal((await pilot.getService(actor,rentalId)).request_category,"servicios");
  assert.equal((await pilot.listServices(actor,"","","e_y_j","arriendo")).length,1);
  assert.equal((await pilot.listServices(actor,"","","rerchar","arriendo")).length,0);
  assert.equal((await pilot.listServices(actor,"","","e_y_j","traslado")).length,1);
  const equipment=await pilot.createAsset(actor,{code:"EQ-01",label:"Excavadora",kind:"equipo",plate:""});
  await assert.rejects(()=>pilot.completeRental(actor,rentalId),pilot.PilotError);
  await pilot.scheduleRental(actor,rentalId,{asset_id:equipment});
  assert.equal((await pilot.getService(actor,rentalId)).status,"programada");
  const overlapping=await pilot.createService(actor,{...rentalInput,submission_key:randomUUID(),rental_from:"2026-10-03",rental_to:"2026-10-07"});
  await assert.rejects(()=>pilot.scheduleRental(actor,overlapping,{asset_id:equipment}),pilot.PilotError);
  await assert.rejects(()=>pilot.completeRental(actor,rentalId),/respaldo/);
  await db.query("INSERT INTO service_evidence(service_id,description,storage_key,created_by) VALUES($1,'Hoja de arriendo','respaldo.pdf',$2)",[rentalId,actor.id]);
  await pilot.completeRental(actor,rentalId);
  const closed=await pilot.getService(actor,rentalId);
  assert.equal(closed.status,"completada");
  assert.equal(closed.gross_kg,null,"el arriendo no fabrica un pesaje");
  assert.ok((await pilot.listServices(actor,"","abiertas","e_y_j")).some(service=>service.id===eyjId));
  assert.ok(!(await pilot.listServices(actor,"","abiertas","e_y_j")).some(service=>service.id===rentalId),
    "el indicador de abiertos no incluye los arriendos cerrados");
  const [{closed_at:originalClosedAt}]=await db.query<{closed_at:Date}>("SELECT closed_at FROM service_requests WHERE id=$1",[rentalId]);
  await db.query("UPDATE service_requests SET closed_at='2026-11-01T02:59:00Z' WHERE id=$1",[rentalId]);
  assert.deepEqual((await pilot.listServices(actor,"","completada","e_y_j","",100,"2026-10")).map(service=>service.id),[rentalId],
    "el cierre antes de medianoche en Chile pertenece a octubre");
  assert.equal((await pilot.listServices(actor,"","completada","e_y_j","",100,"2026-11")).length,0);
  await db.query("UPDATE service_requests SET closed_at='2026-11-01T03:01:00Z' WHERE id=$1",[rentalId]);
  assert.deepEqual((await pilot.listServices(actor,"","completada","e_y_j","",100,"2026-11")).map(service=>service.id),[rentalId],
    "el cierre después de medianoche en Chile pertenece a noviembre");
  assert.equal((await pilot.listServices(actor,"","completada","e_y_j","",100,"2026-10")).length,0);
  await db.query("UPDATE service_requests SET closed_at=$2 WHERE id=$1",[rentalId,originalClosedAt]);
  await assert.rejects(()=>pilot.completeRental(actor,rentalId),pilot.PilotError);
  await assert.rejects(()=>pilot.finishService(actor,rentalId,{gross_kg:"100",tare_kg:"0"}),pilot.PilotError);

  const contract=await finance.createContract(actor,{client_id:client.id,site_id:site.id,operating_company:"e_y_j",
    code:"ARR-01",starts_on:"2026-09-01",ends_on:"",notes:""});
  await assert.rejects(()=>finance.createTariff(actor,{contract_id:contract,service_type:"traslado",waste_type:"",
    unit:"dia",unit_price_clp:"50000",valid_from:"2026-09-01",valid_until:""}),finance.FinanceError);
  const tariff=await finance.createTariff(actor,{contract_id:contract,service_type:"arriendo",waste_type:"",
    unit:"dia",unit_price_clp:"50000",valid_from:"2026-09-01",valid_until:""});
  await finance.valueService(actor,rentalId,{tariff_id:tariff,client_order_reference:""});
  const [valued]=await db.query<{quantity:string;total_clp:string}>("SELECT quantity::text,total_clp::text FROM service_valuations WHERE service_id=$1",[rentalId]);
  assert.equal(valued.quantity,"5.00");
  assert.equal(valued.total_clp,"250000.00");
  const baseCycle={client_id:client.id,period_from:"2026-10-01",period_to:"2026-10-31",
    cutoff_on:"2026-11-01",send_on:"2026-11-03",contact_email:"cliente@demo.cl",notes:""};
  const rentalCycle=await calendar.createBillingCycle(actor,{...baseCycle,statement_type:"arriendo"});
  const residualCycle=await calendar.createBillingCycle(actor,{...baseCycle,statement_type:"residuos"});
  assert.equal((await calendar.getBillingCycle(actor,rentalCycle)).services.find(s=>s.id===rentalId)?.total_clp,"250000.00");
  assert.equal((await calendar.getBillingCycle(actor,residualCycle)).services.length,0,"el EDP de residuos no lista arriendos");
  const spanning=await pilot.createService(actor,{...rentalInput,submission_key:randomUUID(),rental_from:"2026-10-29",rental_to:"2026-11-05"});
  await pilot.scheduleRental(actor,spanning,{asset_id:""});
  await db.query("INSERT INTO service_evidence(service_id,description,storage_key,created_by) VALUES($1,'Acta de arriendo','acta.pdf',$2)",[spanning,actor.id]);
  await pilot.completeRental(actor,spanning);
  await finance.valueService(actor,spanning,{tariff_id:tariff,client_order_reference:""});
  const partialCycle=await calendar.createBillingCycle(actor,{...baseCycle,statement_type:"arriendo",
    period_from:"2026-11-01",period_to:"2026-11-10",cutoff_on:"2026-11-11",send_on:"2026-11-12"});
  const partial=(await calendar.getBillingCycle(actor,partialCycle)).services[0];
  assert.equal(partial.partial_period,true);
  assert.equal(partial.total_clp,null,"el calendario no suma el arriendo entero en un período parcial");

  const criticalRercharId=await pilot.createService(actor,{...input,submission_key:randomUUID(),quote_id:"",operating_company:"rerchar",priority:"critica"});
  const criticalEyjId=await pilot.createService(actor,{...input,submission_key:randomUUID(),quote_id:"",operating_company:"e_y_j",priority:"critica"});
  assert.deepEqual((await pilot.listServices(actor,"","abiertas","e_y_j","",100,"","critica")).map(row=>row.id),[criticalEyjId],
    "la alerta crítica de E y J no muestra RERCHAR ni servicios normales");
  await db.query("UPDATE service_requests SET status='completada',closed_at=now() WHERE id=$1",[criticalEyjId]);
  assert.equal((await pilot.listServices(actor,"","abiertas","e_y_j","",100,"","critica")).length,0,
    "la alerta crítica se despeja al cerrar el servicio");
  await db.query(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,priority,created_by)
    SELECT gen_random_uuid(),$1,$2,'rerchar','retiro','Material','Faena','Patio','critica',$3
    FROM generate_series(1,100)`,[client.id,site.id,actor.id]);
  const first=await pilot.listServices(actor,"","abiertas","rerchar","",51,"","critica",0);
  const second=await pilot.listServices(actor,"","abiertas","rerchar","",51,"","critica",50);
  const third=await pilot.listServices(actor,"","abiertas","rerchar","",51,"","critica",100);
  assert.equal(first.length,51,"la primera página detecta que hay más resultados");
  assert.equal(second.length,51,"la segunda página sigue mostrando servicios críticos");
  assert.equal(third.length,1,"el último folio no desaparece por el límite de cien registros");
  assert.equal(new Set([...first.slice(0,50),...second.slice(0,50),...third].map(row=>row.id)).size,101);
  assert.ok(third.some(row=>row.id===criticalRercharId));
});
