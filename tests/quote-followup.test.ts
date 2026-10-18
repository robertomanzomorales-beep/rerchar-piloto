import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("E y J cotiza disposición, cliente responde y OC/respaldo siguen el mismo folio",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const quotes=await import("../lib/quotes");
  const followup=await import("../lib/quote-followup");
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
  await db.query("UPDATE client_quotes SET status='enviada' WHERE id=$1",[quoteId]);
  await assert.rejects(()=>quotes.recordQuoteDecision(stranger,quoteId,"aceptada"),quotes.QuoteError);
  await quotes.recordQuoteDecision(viewer,quoteId,"aceptada");
  await followup.recordQuoteClientOrder(staff,quoteId,{reference:"OC-325",received_on:"2026-10-19"});
  await assert.rejects(()=>followup.recordQuoteClientOrder(viewer,quoteId,{reference:"OC-326",received_on:"2026-10-19"}),followup.QuoteFollowupError);
  const bytes=Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
  const docId=await followup.uploadQuoteDocument(staff,quoteId,"orden_compra",new File([bytes],"oc-cliente.pdf",{type:"application/pdf"}));
  assert.equal((await followup.getQuoteDocument(viewer,docId))?.filename,"oc-cliente.pdf");
  assert.equal(await followup.getQuoteDocument(stranger,docId),null);
  const record=await followup.getQuoteFollowup(staff,quoteId);
  assert.equal(record.quote.client_order_reference,"OC-325");
  assert.equal(record.documents.length,1);
  assert.equal(record.services.length,0);
  assert.deepEqual(quotes.quoteCcAddresses("jefe@example.cl; jefe@example.cl, cliente@example.cl"),["jefe@example.cl","cliente@example.cl"]);
  assert.throws(()=>quotes.quoteCcAddresses("malo\r\nBcc:otro@example.cl"),quotes.QuoteError);
});
