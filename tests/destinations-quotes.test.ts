import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("destinos de Carol bloquean entrega inválida y conservan cotizaciones anteriores",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const quotes=await import("../lib/quotes");
  const destinations=await import("../lib/destinations");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(file=>/^\d+.*\.sql$/.test(file)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name,email) VALUES ('Cliente destino','contacto@cliente.cl') RETURNING id");
  const [admin]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES ('destinos@demo.cl','Admin','hash','admin') RETURNING id");
  const [customer]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES ('cliente-destino@demo.cl','Cliente','hash','cliente',$1) RETURNING id",[client.id]);
  const owner:Actor={id:admin.id,name:"Admin",email:"destinos@demo.cl",role:"admin",client_id:null};
  const viewer:Actor={id:customer.id,name:"Cliente",email:"cliente-destino@demo.cl",role:"cliente",client_id:client.id};
  const master=await destinations.listQuoteDestinations(owner);
  assert.equal(master.length,7);
  assert.ok(master.every(d=>d.status==="pendiente"&&d.accepted_categories.length===0));
  await assert.rejects(()=>destinations.listQuoteDestinations(viewer),destinations.DestinationError);
  const custom=await destinations.createQuoteDestination(owner,{name:"Nueva planta de prueba",facility_type:"otro",address:"Ruta 1",
    commune:"Calama",latitude:"-22.456000",longitude:"-68.924000",location_url:"https://maps.google.com/?q=-22.456,-68.924"});
  assert.equal((await destinations.listQuoteDestinations(owner)).find(d=>d.id===custom)?.status,"pendiente");
  await assert.rejects(()=>destinations.createQuoteDestination(viewer,{name:"Otra planta",facility_type:"otro",address:"",commune:"",
    latitude:"",longitude:"",location_url:""}),destinations.DestinationError);
  const seed=master.find(d=>d.name==="Planta RERCHAR Calama")!;

  const quoteId=await quotes.createQuote(owner,{submission_key:randomUUID(),client_id:client.id,issuer:"rerchar",title:"Retiro de reciclables",
    issued_on:"2026-10-14",valid_until:"2099-12-31",line:{description:"Retiro de material",principal:"retiro",segment:"retiro_reciclable",
    waste_category:"reciclable",destination_id:seed.id,quantity:"1",unit:"viaje",unit_price_clp:"10000"}});
  const initial=await quotes.getQuote(owner,quoteId);
  assert.equal(initial.lines[0].destination_name,"Planta RERCHAR Calama");
  assert.equal(initial.lines[0].destination_required,true);
  assert.ok((await quotes.quoteDeliveryIssues(initial.quote,initial.lines)).some(issue=>issue.includes("no está habilitado")));
  const delivery={channel:"presencial",recipient:"",reference:"Entrega presencial registrada en oficina"};
  await assert.rejects(()=>quotes.recordManualQuoteDelivery(owner,quoteId,delivery),quotes.QuoteError);
  const base={name:seed.name,facility_type:"planta",address:"Patio Calama",commune:"Calama",latitude:"",longitude:"",location_url:"",
    status:"habilitado",authorization_reference:"Resolución interna R-2026",authorization_valid_until:"2099-12-31",
    disposal_unit:"tonelada",disposal_price_clp:"0"};
  await assert.rejects(()=>destinations.updateQuoteDestination(owner,seed.id,{...base,accepted_categories:["reciclable"]}),destinations.DestinationError,
    "sin respaldo no puede habilitarse");
  const permit=new File([Buffer.from("%PDF-1.4\nPrueba de autorización")],"permiso.pdf",{type:"application/pdf"});
  await destinations.updateQuoteDestination(owner,seed.id,{...base,accepted_categories:["chatarra"]},permit);
  assert.ok((await quotes.quoteDeliveryIssues(initial.quote,initial.lines)).some(issue=>issue.includes("no admite")));
  await destinations.updateQuoteDestination(owner,seed.id,{...base,accepted_categories:["reciclable"],authorization_valid_until:"2099-12-30"});
  assert.ok((await quotes.quoteDeliveryIssues(initial.quote,initial.lines)).some(issue=>issue.includes("no cubre la vigencia")));
  await destinations.updateQuoteDestination(owner,seed.id,{...base,accepted_categories:["reciclable"]});
  assert.deepEqual(await quotes.quoteDeliveryIssues(initial.quote,initial.lines),[]);
  await quotes.recordManualQuoteDelivery(owner,quoteId,delivery);
  assert.equal((await quotes.getQuote(viewer,quoteId)).quote.status,"enviada");
  assert.equal((await destinations.getQuoteDestinationSupport(owner,seed.id))?.name,"permiso.pdf");
  assert.equal(await destinations.getQuoteDestinationSupport(viewer,seed.id),null);
  await destinations.updateQuoteDestination(owner,seed.id,{...base,name:"Planta RERCHAR Calama validada",status:"suspendido",accepted_categories:["reciclable"]});
  assert.equal((await quotes.getQuote(viewer,quoteId)).lines[0].destination_name,"Planta RERCHAR Calama","la cotización emitida conserva el nombre cotizado");

  const historicId=await quotes.createQuote(owner,{submission_key:randomUUID(),client_id:client.id,issuer:"rerchar",title:"Servicio antiguo",
    issued_on:"2026-10-14",valid_until:"2099-12-31",line:{description:"Retiro anterior",principal:"retiro",segment:"retiro_chatarra",
    quantity:"1",unit:"viaje",unit_price_clp:"1000"}});
  await db.query("UPDATE client_quote_lines SET destination_required=false WHERE quote_id=$1",[historicId]);
  const historic=await quotes.getQuote(owner,historicId);
  assert.deepEqual(await quotes.quoteDeliveryIssues(historic.quote,historic.lines),[],"los conceptos anteriores no reciben restricciones nuevas");
  await quotes.recordManualQuoteDelivery(owner,historicId,delivery);
  assert.equal((await quotes.getQuote(owner,historicId)).quote.status,"enviada");
});
