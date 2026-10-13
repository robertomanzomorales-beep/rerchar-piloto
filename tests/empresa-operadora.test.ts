import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

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
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente común') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena') RETURNING id",[client.id]);
  const [admin]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@demo.cl','Admin','hash','admin') RETURNING id");
  const actor:Actor={id:admin.id,name:"Admin",email:"admin@demo.cl",role:"admin",client_id:null};
  const quoteId=await quotes.createQuote(actor,{submission_key:randomUUID(),client_id:client.id,issuer:"e_y_j",title:"Transporte de residuos",issued_on:"2026-10-13",valid_until:"2026-11-13",line:{description:"Viaje",quantity:"1",unit:"viaje",unit_price_clp:"10000",taxable:true}});
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
});
