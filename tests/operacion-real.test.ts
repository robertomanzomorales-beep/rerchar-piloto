import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import {PDFDocument} from "pdf-lib";
import type {Actor} from "../lib/auth";

test("cotización del cliente, PDF y guía de tres pesos respetan totales y permisos",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const quotes=await import("../lib/quotes");
  const guides=await import("../lib/guides");
  const {renderQuotePdf}=await import("../lib/quote-pdf");
  for(const name of ["001_piloto.sql","002_flota_y_despacho.sql","003_abastecimiento.sql","004_mantenimiento_combustible.sql","005_contenedores.sql","006_acreditacion.sql","007_finanzas.sql","008_trazabilidad_ambiental.sql","009_certificados.sql","010_evidencia_persistente.sql","011_operacion_real_2026.sql"]){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [clientA,clientB]=await db.query<{id:string}>("INSERT INTO clients(name,tax_id,email,address) VALUES ('Cliente A','12.345.678-9','compras@cliente.cl','Santiago'),('Cliente B',null,null,null) RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES ($1,'Faena A') RETURNING id",[clientA.id]);
  const [admin]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES ('admin@demo.cl','Admin','hash','admin') RETURNING id");
  const [customer,outsider]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES ('cliente@demo.cl','Cliente','hash','cliente',$1),('otro@demo.cl','Otro','hash','cliente',$2) RETURNING id",[clientA.id,clientB.id]);
  const owner:Actor={id:admin.id,name:"Admin",email:"admin@demo.cl",role:"admin",client_id:null};
  const viewer:Actor={id:customer.id,name:"Cliente",email:"cliente@demo.cl",role:"cliente",client_id:clientA.id};
  const stranger:Actor={id:outsider.id,name:"Otro",email:"otro@demo.cl",role:"cliente",client_id:clientB.id};
  const quoteId=await quotes.createQuote(owner,{submission_key:randomUUID(),client_id:clientA.id,issuer:"rerchar",title:"Retiro de material",issued_on:"2026-09-25",valid_until:"2026-10-25",vat_rate:"0.19",line:{description:"Transporte",quantity:"2",unit:"viaje",unit_price_clp:"10000",taxable:true}});
  await quotes.addQuoteLine(owner,quoteId,{description:"Material exento",quantity:"1",unit:"unidad",unit_price_clp:"5000",taxable:false});
  const {quote,lines,totals}=await quotes.getQuote(owner,quoteId);
  assert.equal(quote.client_name,"Cliente A");assert.equal(quote.client_tax_id,"12.345.678-9");
  assert.deepEqual(totals,{net:25000,vat:3800,total:28800,lines:[20000,5000]});
  const pdf=await renderQuotePdf(quote,lines);
  assert.equal((await PDFDocument.load(pdf)).getPageCount(),1);
  assert.ok(pdf.length>7000);
  assert.equal((await quotes.listQuotes(viewer)).length,0,"el borrador no se muestra al cliente");
  await assert.rejects(()=>quotes.getQuote(stranger,quoteId),quotes.QuoteError);
  await assert.rejects(()=>quotes.addQuoteLine(viewer,quoteId,{description:"Otro",quantity:"1",unit:"kg",unit_price_clp:"10",taxable:true}),quotes.QuoteError);
  await db.query("UPDATE client_quotes SET status='enviando' WHERE id=$1",[quoteId]);
  assert.equal((await quotes.listQuotes(viewer)).length,0,"un envío sin confirmar permanece oculto");
  await assert.rejects(()=>quotes.resolveQuoteSending(viewer,quoteId,"enviada","Revisé el correo de salida"),quotes.QuoteError);
  await quotes.resolveQuoteSending(owner,quoteId,"borrador","No figuraba en la bandeja de salida");
  assert.equal((await quotes.getQuote(owner,quoteId)).quote.status,"borrador");

  const [service]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,created_by)
    VALUES ($1,$2,$3,'retiro','Chatarra','Faena','Receptor',$4) RETURNING id`,[randomUUID(),clientA.id,site.id,owner.id]);
  const input={guide_number:"GD-19",movement_date:"2026-09-25",movement_type:"venta",origin_ticket:"T-1",destination_ticket:"T-2",return_ticket:"T-3",origin_kg:"25990",complementary_kg:"720",arrival_kg:"25610",returned_impurities_kg:"620",return_weight_kg:"640",destination_impurities_kg:"100",invoice_kg:"25500",invoice_number:"F-45",valued_guide_number:"GV-12",notes:"Control de tres pesajes"};
  await assert.rejects(()=>guides.saveGuideControl(viewer,service.id,input),guides.GuideError);
  await guides.saveGuideControl(owner,service.id,input);
  const [guide]=await guides.listGuideControls(viewer,service.id);
  assert.equal(guide.return_weight_kg,"640.00");
  assert.deepEqual(guides.guideDifferences(guide),{departure_kg:26710,difference_kg:-480,invoice_difference_kg:10});
  await assert.rejects(()=>guides.listGuideControls(stranger,service.id),guides.GuideError);
});
