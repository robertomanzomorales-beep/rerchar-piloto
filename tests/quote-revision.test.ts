import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("una propuesta entregada se corrige conservando folio, PDFs originales y aceptación protegida",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const quotes=await import("../lib/quotes");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(file=>/^\d+.*\.sql$/.test(file)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(value=>value.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name,email) VALUES('Cliente industrial','compras@example.cl') RETURNING id");
  const [admin,customer]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role,client_id)
    VALUES('admin@example.cl','Admin','h','admin',null),('compras@example.cl','Compras','h','cliente',$1) RETURNING id`,[client.id]);
  const staff:Actor={id:admin.id,name:"Admin",email:"admin@example.cl",role:"admin",client_id:null};
  const viewer:Actor={id:customer.id,name:"Compras",email:"compras@example.cl",role:"cliente",client_id:client.id};
  const quoteId=await quotes.createQuote(staff,{submission_key:randomUUID(),client_id:client.id,issuer:"rerchar",
    title:"Arriendo de equipo industrial",issued_on:"2026-11-15",valid_until:"2026-12-15",vat_rate:"0.19",
    company_intro:"RERCHAR desarrolla soluciones para la gestión industrial.",
    proposal_objective:"Arriendo de equipo industrial para la operación indicada.",
    line:{description:"Arriendo equipo de apoyo",principal:"arriendo",segment:"arriendo_equipo",quantity:"2",unit:"día",unit_price_clp:"150000",taxable:true}});
  const initial=await quotes.getQuote(staff,quoteId);
  assert.deepEqual(await quotes.quoteDeliveryIssues(initial.quote,initial.lines),[]);
  await quotes.recordManualQuoteDelivery(staff,quoteId,{channel:"correo",recipient:"compras@example.cl",reference:"Enviado desde el correo comercial"});
  const first=await quotes.getQuote(staff,quoteId);
  assert.equal(first.quote.issued_version,1);
  const [original]=await db.query<{pdf:Uint8Array;sha256:string}>("SELECT pdf,sha256 FROM client_quote_pdf_snapshots WHERE quote_id=$1",[quoteId]);
  await db.query(`INSERT INTO quote_response_tokens(quote_id,token_hash,recipient,issued_by,expires_at)
    VALUES($1,$2,'compras@example.cl',$3,now()+interval '7 days')`,[quoteId,"a".repeat(64),staff.id]);
  await assert.rejects(()=>quotes.reopenQuoteRevision(viewer,quoteId,"Corregir cantidades de la propuesta"),quotes.QuoteError);
  await quotes.reopenQuoteRevision(staff,quoteId,"Ajustar cantidad según solicitud comercial");
  const draft=await quotes.getQuote(staff,quoteId);
  assert.equal(draft.quote.status,"borrador");
  assert.equal(draft.quote.issued_version,1);
  assert.equal(draft.quote.display_folio,first.quote.display_folio);
  assert.equal((await db.query("SELECT quote_id FROM quote_response_tokens WHERE quote_id=$1",[quoteId])).length,0);
  assert.equal((await db.query("SELECT quote_id FROM client_quote_pdf_snapshots WHERE quote_id=$1",[quoteId])).length,0);
  const [archived]=await db.query<{version:number;pdf:Uint8Array;sha256:string}>(
    "SELECT version,pdf,sha256 FROM client_quote_issued_versions WHERE quote_id=$1",[quoteId]);
  assert.equal(archived.version,1);
  assert.equal(archived.sha256,original.sha256);
  assert.deepEqual(Buffer.from(archived.pdf),Buffer.from(original.pdf));
  await assert.rejects(()=>quotes.getQuote(viewer,quoteId),quotes.QuoteError,"el borrador corregido no se muestra al cliente");
  await quotes.updateQuoteLine(staff,quoteId,draft.lines[0].id,{description:"Arriendo equipo de apoyo actualizado",
    principal:"arriendo",segment:"arriendo_equipo",quantity:"3",unit:"día",unit_price_clp:"150000",taxable:true});
  await quotes.recordManualQuoteDelivery(staff,quoteId,{channel:"correo",recipient:"compras@example.cl",reference:"Nueva versión enviada al cliente"});
  const second=await quotes.getQuote(staff,quoteId);
  assert.equal(second.quote.issued_version,2);
  assert.equal(second.quote.display_folio,first.quote.display_folio);
  assert.equal(second.totals.total,535500);
  const [current]=await db.query<{sha256:string}>("SELECT sha256 FROM client_quote_pdf_snapshots WHERE quote_id=$1",[quoteId]);
  assert.notEqual(current.sha256,original.sha256);
  await quotes.recordQuoteDecision(viewer,quoteId,"aceptada");
  await assert.rejects(()=>quotes.reopenQuoteRevision(staff,quoteId,"Una nueva corrección tras aceptación"),quotes.QuoteError);
  assert.equal((await db.query("SELECT version FROM client_quote_issued_versions WHERE quote_id=$1",[quoteId])).length,1);

  const planning=await import("../lib/quote-planning");
  const routeId=await quotes.createQuote(staff,{submission_key:randomUUID(),client_id:client.id,issuer:"rerchar",
    title:"Transporte de material industrial",issued_on:"2026-11-15",valid_until:"2026-12-15",vat_rate:"0.19",
    company_intro:"RERCHAR desarrolla soluciones para la gestión industrial.",
    proposal_objective:"Transportar el material industrial entre los puntos indicados.",
    line:{description:"Viaje de camión",principal:"transporte",segment:"transporte_batea",quantity:"2",unit:"viaje",unit_price_clp:"150000",taxable:true}});
  const places={origin:"Planta RERCHAR Calama",pickup:"Faena del cliente Calama",destination:"Patio de destino Calama",return_to:"Planta RERCHAR Calama"};
  const routeInput={...places,pickup_km:"10",destination_km:"15",return_km:"10",reviewed_for_truck:true,
    correction_reason:"Ruta confirmada con operaciones"};
  const costing={trips:"2",asset_id:"",equipment:"Camión batea",capacity:"10",capacity_unit:"tonelada",km_per_liter:"2",
    fuel_price_clp:"1000",equipment_cost_clp:"10000",tolls_clp:"2000",driver_hours:"3",driver_hour_clp:"5000",
    support_hours:"2",support_hour_clp:"2000",per_diem_clp:"3000",loading_clp:"1000",disposal_quantity:"0",
    disposal_unit:"tonelada",disposal_unit_clp:"0",stay_clp:"500",other_clp:"500",contingency_pct:"10",margin_pct:"20"};
  await planning.saveQuoteRoute(staff,routeId,routeInput);
  await planning.saveQuoteCosting(staff,routeId,costing);
  let routed=await quotes.getQuote(staff,routeId);
  assert.deepEqual(await quotes.quoteDeliveryIssues(routed.quote,routed.lines),[]);
  await quotes.recordManualQuoteDelivery(staff,routeId,{channel:"presencial",recipient:"",reference:"Entrega firmada al cliente"});
  await quotes.reopenQuoteRevision(staff,routeId,"Cambiar cantidad y revisar recorrido");
  routed=await quotes.getQuote(staff,routeId);
  await quotes.updateQuoteLine(staff,routeId,routed.lines[0].id,{description:"Viajes de camión corregidos",principal:"transporte",
    segment:"transporte_batea",quantity:"3",unit:"viaje",unit_price_clp:"150000",taxable:true});
  routed=await quotes.getQuote(staff,routeId);
  assert.ok((await quotes.quoteDeliveryIssues(routed.quote,routed.lines)).some(issue=>issue.includes("circuito")));
  await assert.rejects(()=>quotes.recordManualQuoteDelivery(staff,routeId,{channel:"presencial",recipient:"",reference:"Entrega prematura"}),quotes.QuoteError);
  await planning.saveQuoteRoute(staff,routeId,{...routeInput,destination_km:"18"});
  routed=await quotes.getQuote(staff,routeId);
  assert.ok((await quotes.quoteDeliveryIssues(routed.quote,routed.lines)).some(issue=>issue.includes("costos")));
  await assert.rejects(()=>planning.applySuggestedQuotePrice(staff,routeId),planning.QuotePlanningError);
  await planning.saveQuoteCosting(staff,routeId,{...costing,trips:"3"});
  routed=await quotes.getQuote(staff,routeId);
  assert.deepEqual(await quotes.quoteDeliveryIssues(routed.quote,routed.lines),[]);
  await quotes.recordManualQuoteDelivery(staff,routeId,{channel:"presencial",recipient:"",reference:"Versión revisada entregada"});
  assert.equal((await quotes.getQuote(staff,routeId)).quote.issued_version,2);
});
