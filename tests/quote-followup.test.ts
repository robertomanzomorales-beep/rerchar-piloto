import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createHash} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("E y J cotiza disposición, cliente responde y OC/respaldo siguen el mismo folio",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const quotes=await import("../lib/quotes");
  const followup=await import("../lib/quote-followup");
  const finance=await import("../lib/finance");
  const edpLinks=await import("../lib/edp-invoice-links");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(file=>/^\d+.*\.sql$/.test(file)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(value=>value.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name,email) VALUES('Cliente E y J','cliente@example.cl'),('Otro','otro@example.cl') RETURNING id");
  const [admin,customer,foreign]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role,client_id)
    VALUES('admin@demo.cl','Admin','h','admin',null),('cliente@example.cl','Cliente','h','cliente',$1),('otro@example.cl','Otro','h','cliente',$2) RETURNING id`,[client.id,other.id]);
  const staff:Actor={id:admin.id,name:"Admin",email:"admin@demo.cl",role:"admin",client_id:null};
  const viewer:Actor={id:customer.id,name:"Cliente",email:"cliente@example.cl",role:"cliente",client_id:client.id};
  const stranger:Actor={id:foreign.id,name:"Otro",email:"otro@example.cl",role:"cliente",client_id:other.id};
  const quoteId=await quotes.createQuote(staff,{submission_key:randomUUID(),client_id:client.id,issuer:"e_y_j",title:"Retiro y disposición final",
    issued_on:"2026-10-18",valid_until:"2026-10-28",line:{description:"Disposición final de residuos industriales",principal:"disposicion",
      segment:"disposicion_final",waste_category:"industrial_no_peligroso",quantity:"1",unit:"tonelada",unit_price_clp:"0"}});
  let detail=await quotes.getQuote(staff,quoteId);
  assert.ok((await quotes.quoteDeliveryIssues(detail.quote,detail.lines)).some(issue=>issue.includes("precio")));
  await quotes.setQuoteUfRate(staff,quoteId,{rate:"40000",on:"2026-10-18"});
  await quotes.updateQuoteLine(staff,quoteId,detail.lines[0].id,{description:detail.lines[0].description,principal:"disposicion",segment:"disposicion_final",
    waste_category:"industrial_no_peligroso",quantity:"1",unit:"tonelada",unit_price_clp:"2.5000",currency:"UF"});
  detail=await quotes.getQuote(staff,quoteId);
  assert.equal(detail.lines[0].unit_price_uf,"2.5000");
  assert.equal(detail.totals.net,100000);
  await quotes.setQuoteUfRate(staff,quoteId,{rate:"41000",on:"2026-10-19"});
  detail=await quotes.getQuote(staff,quoteId);
  assert.equal(detail.totals.net,102500,"la equivalencia CLP se recalcula sin alterar 2,5 UF pactadas");
  assert.ok((await quotes.quoteDeliveryIssues(detail.quote,detail.lines)).some(issue=>issue.includes("destino")));
  await quotes.addQuoteLine(staff,quoteId,{description:"Arriendo de equipo de apoyo",principal:"arriendo",segment:"arriendo_equipo",
    quantity:"1",unit:"día",unit_price_clp:"100000"});
  await db.query("UPDATE client_quotes SET status='enviada' WHERE id=$1",[quoteId]);
  await assert.rejects(()=>quotes.recordQuoteDecision(stranger,quoteId,"aceptada"),quotes.QuoteError);
  await quotes.recordQuoteDecision(viewer,quoteId,"aceptada");
  await followup.recordQuoteClientOrder(staff,quoteId,{reference:"OC-325",received_on:"2026-10-19"});
  await assert.rejects(()=>followup.recordQuoteClientOrder(viewer,quoteId,{reference:"OC-326",received_on:"2026-10-19"}),followup.QuoteFollowupError);
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena piloto') RETURNING id",[client.id]);
  const pilot=await import("../lib/pilot");
  const guides=await import("../lib/guides");
  await assert.rejects(()=>pilot.createService(staff,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,
    quote_id:quoteId,operating_company:"e_y_j",request_category:"venta",service_type:"venta",waste_type:"Material",
    estimated_kg:"",origin:"Bodega Calama",destination:"Faena piloto",priority:"normal",notes:""}),/tipo de solicitud no corresponde|clase de solicitud debe coincidir/);
  const service=await pilot.createService(staff,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,
    quote_id:quoteId,operating_company:"e_y_j",request_category:"servicios",service_type:"arriendo",waste_type:"Equipo industrial",
    estimated_kg:"",origin:"Bodega Calama",destination:"Faena piloto",rental_from:"2026-10-20",rental_to:"2026-10-21",
    priority:"normal",notes:"Cotización puntual"});
  await assert.rejects(()=>guides.saveGuideControl(staff,service,{guide_number:"G-ARR-1",movement_date:"2026-10-20",movement_type:"servicio",origin_kg:"100"}),/arriendo.*sin guía ni pesaje/);
  await assert.rejects(()=>pilot.scheduleRental(staff,service,{asset_id:""}),/Adjunte el respaldo de la OC/);
  const bytes=Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
  const docId=await followup.uploadQuoteDocument(staff,quoteId,"orden_compra",new File([bytes],"oc-cliente.pdf",{type:"application/pdf"}));
  assert.equal((await followup.getQuoteDocument(viewer,docId))?.filename,"oc-cliente.pdf");
  assert.equal(await followup.getQuoteDocument(stranger,docId),null);
  const [edp]=await db.query<{id:string}>(`INSERT INTO payment_statements
    (submission_key,client_id,number,period_on,statement_type,client_name,client_tax_id,client_address,client_contact,status,created_by)
    VALUES ($1,$2,'EDP-10','2026-10-31','arriendo','Cliente E y J','12.345.678-9','Calama','Contacto','aprobado',$3) RETURNING id`,
    [randomUUID(),client.id,staff.id]);
  await db.query(`INSERT INTO payment_statement_operations(statement_id,service_id,line_number,description,recorded_by)
    VALUES ($1,$2,1,'Arriendo respaldado',$3)`,[edp.id,service,staff.id]);
  const [externalInvoice]=await db.query<{id:string}>(`INSERT INTO extra_receivable_invoices
    (issuer,client_id,invoice_number,issued_on,due_on,total_clp,created_by)
    VALUES ('e_y_j',$1,'EYJ-EDP-10','2026-11-01','2026-11-30',100000,$2) RETURNING id`,[client.id,staff.id]);
  await db.query("UPDATE payment_statements SET receivable_invoice_id=$2 WHERE id=$1",[edp.id,externalInvoice.id]);
  const record=await followup.getQuoteFollowup(staff,quoteId);
  assert.equal(record.quote.client_order_reference,"OC-325");
  assert.equal(record.documents.length,1);
  assert.equal(record.services.length,1);
  assert.deepEqual(record.statements.map(item=>[item.service_id,item.id,item.invoice_id,item.invoice_number]),
    [[service,edp.id,externalInvoice.id,"EYJ-EDP-10"]],"el expediente sigue la factura externa del EDP sin atribuir su total a cada servicio");
  assert.equal((await followup.getQuoteFollowup(viewer,quoteId)).statements.length,1);
  assert.deepEqual((await edpLinks.listEdpServiceInvoices([service])).map(i=>[i.service_id,i.statement_id,i.invoice_number]),
    [[service,edp.id,"EYJ-EDP-10"]]);
  assert.deepEqual((await edpLinks.listClientEdpInvoices(viewer,client.id)).map(i=>[i.id,i.invoice_number,i.statement_numbers]),
    [[externalInvoice.id,"EYJ-EDP-10",["EDP-10"]]]);
  assert.deepEqual(await edpLinks.listClientEdpInvoices(stranger,client.id),[],"un cliente no ve facturas de otro");
  await db.query("UPDATE payment_statements SET status='observado' WHERE id=$1",[edp.id]);
  assert.equal((await followup.getQuoteFollowup(viewer,quoteId)).statements.length,0,"el portal no expone EDP internos u observados");
  assert.deepEqual(await edpLinks.listClientEdpInvoices(viewer,client.id),[],"el portal no expone folios de EDP observado");
  assert.equal((await followup.getQuoteFollowup(staff,quoteId)).statements.length,1);
  await db.query("UPDATE payment_statements SET status='aprobado' WHERE id=$1",[edp.id]);
  await pilot.scheduleRental(staff,service,{asset_id:""});
  await db.query("UPDATE service_requests SET status='completada',closed_at=now() WHERE id=$1",[service]);
  const financePage=await finance.listFinance(staff,"e_y_j");
  assert.ok(financePage.edpInvoices.some(i=>i.service_id===service&&i.invoice_number==="EYJ-EDP-10"),
    "Finanzas muestra la factura del EDP en el servicio cerrado");
  assert.equal(financePage.services.find(i=>i.id===service)?.invoice_id,null,
    "el folio consolidado no se atribuye como factura individual");
  const [secondEdp]=await db.query<{id:string}>(`INSERT INTO payment_statements
    (submission_key,client_id,number,period_on,statement_type,client_name,client_tax_id,client_address,client_contact,status,created_by)
    VALUES ($1,$2,'EDP-11','2026-11-30','residuos','Cliente E y J','12.345.678-9','Calama','Contacto','aprobado',$3) RETURNING id`,
    [randomUUID(),client.id,staff.id]);
  await db.query(`INSERT INTO payment_statement_operations(statement_id,service_id,line_number,description,is_disposal,recorded_by)
    VALUES ($1,$2,1,'Segunda línea del servicio',true,$3)`,[secondEdp.id,service,staff.id]);
  const [secondInvoice]=await db.query<{id:string}>(`INSERT INTO extra_receivable_invoices
    (issuer,client_id,invoice_number,issued_on,due_on,total_clp,created_by)
    VALUES ('e_y_j',$1,'EYJ-EDP-11','2026-12-01','2026-12-30',200000,$2) RETURNING id`,[client.id,staff.id]);
  await db.query("UPDATE payment_statements SET receivable_invoice_id=$2 WHERE id=$1",[secondEdp.id,secondInvoice.id]);
  await db.query(`INSERT INTO extra_receivable_payments(submission_key,invoice_id,amount_clp,paid_on,reference,created_by)
    VALUES ($1,$2,25000,'2026-11-15','ABONO-EDP-10',$3)`,[randomUUID(),externalInvoice.id,staff.id]);
  assert.deepEqual((await edpLinks.listEdpServiceInvoices([service])).map(i=>i.invoice_number).sort(),
    ["EYJ-EDP-10","EYJ-EDP-11"],"Finanzas conserva ambos EDP sin duplicar el importe en cada servicio");
  assert.equal((await finance.getFinancialService(staff,service)).edpInvoices.length,2);
  const fullFollowup=await followup.getQuoteFollowup(staff,quoteId);
  assert.deepEqual(fullFollowup.statements.map(i=>i.invoice_number).sort(),["EYJ-EDP-10","EYJ-EDP-11"],
    "la carpeta de la cotización conserva ambas facturas EDP del servicio");
  assert.equal(Number(fullFollowup.statements.find(i=>i.invoice_id===externalInvoice.id)?.paid_clp),25000);
  assert.equal(Number(fullFollowup.statements.find(i=>i.invoice_id===externalInvoice.id)?.invoice_total_clp),100000);
  assert.equal((await followup.getQuoteFollowup(viewer,quoteId)).statements.length,2);
  await assert.rejects(()=>followup.recordQuoteOrderException(staff,quoteId,"Acuerdo con cliente sin OC"),/Existe una OC adjunta/);
  const exceptionQuoteId=await quotes.createQuote(staff,{submission_key:randomUUID(),client_id:client.id,issuer:"e_y_j",title:"Arriendo puntual sin OC",
    issued_on:"2026-10-18",valid_until:"2026-10-28",line:{description:"Arriendo de equipo",principal:"arriendo",segment:"arriendo_equipo",
      quantity:"1",unit:"día",unit_price_clp:"100000"}});
  await db.query("UPDATE client_quotes SET status='aceptada' WHERE id=$1",[exceptionQuoteId]);
  await assert.rejects(()=>pilot.createService(staff,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,
    quote_id:exceptionQuoteId,operating_company:"e_y_j",request_category:"servicios",service_type:"traslado",waste_type:"Equipo",
    estimated_kg:"",origin:"Bodega Calama",destination:"Faena piloto",priority:"normal",notes:""}),/tipo de solicitud no corresponde/);
  const exceptionService=await pilot.createService(staff,{submission_key:randomUUID(),client_id:client.id,site_id:site.id,
    quote_id:exceptionQuoteId,operating_company:"e_y_j",request_category:"servicios",service_type:"arriendo",waste_type:"Equipo industrial",
    estimated_kg:"",origin:"Bodega Calama",destination:"Faena piloto",rental_from:"2026-10-20",rental_to:"2026-10-21",
    priority:"normal",notes:"Sin OC por acuerdo comercial"});
  await assert.rejects(()=>pilot.scheduleRental(staff,exceptionService,{asset_id:""}),/registre la OC o una excepción/);
  await assert.rejects(()=>followup.recordQuoteOrderException(viewer,exceptionQuoteId,"Acuerdo con cliente sin OC"),followup.QuoteFollowupError);
  await followup.recordQuoteOrderException(staff,exceptionQuoteId,"Acuerdo comercial confirmado: cliente no emite OC para este arriendo.");
  assert.match((await followup.getQuoteFollowup(staff,exceptionQuoteId)).quote.client_order_exception??"",/cliente no emite OC/);
  await pilot.scheduleRental(staff,exceptionService,{asset_id:""});
  await followup.recordQuoteClientOrder(staff,exceptionQuoteId,{reference:"OC-TARDIA-1",received_on:"2026-10-20"});
  assert.equal((await followup.getQuoteFollowup(staff,exceptionQuoteId)).quote.client_order_exception,null);
  const [anotherQuote]=await db.query<{id:string}>("UPDATE client_quotes SET status='enviada' WHERE id=$1 RETURNING id",[quoteId]);
  const token="a".repeat(64);
  await db.query(`INSERT INTO quote_response_tokens(quote_id,token_hash,recipient,issued_by,expires_at)
    VALUES($1,$2,'cliente@example.cl',$3,now()+interval '1 day')`,[anotherQuote.id,createHash("sha256").update(token).digest("hex"),staff.id]);
  assert.equal((await quotes.getEmailQuoteResponse(token))?.quote_id,quoteId);
  assert.equal((await quotes.respondToQuoteEmail(token,"rechazada")).ackSent,false);
  await assert.rejects(()=>quotes.respondToQuoteEmail(token,"aceptada"),/ya se utilizó/);
  assert.deepEqual(quotes.quoteCcAddresses("jefe@example.cl; jefe@example.cl, cliente@example.cl"),["jefe@example.cl","cliente@example.cl"]);
  assert.throws(()=>quotes.quoteCcAddresses("malo\r\nBcc:otro@example.cl"),quotes.QuoteError);
});
