import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("compra de Carol conserva materiales, observaciones e IVA confirmado hasta el ingreso",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const quotes=await import("../lib/quotes");
  const pilot=await import("../lib/pilot");
  const materials=await import("../lib/materials");
  const {moduleReady}=await import("../lib/schema-readiness");
  const {renderQuotePdf}=await import("../lib/quote-pdf");
  assert.equal(await moduleReady("cotizaciones"),false,"una instalación sin migrar no abre el formulario incompleto");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(file=>/^\d+.*\.sql$/.test(file)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(value=>value.trim()).filter(Boolean))await tx.query(statement);});
    if(name.startsWith("030_"))assert.equal(await moduleReady("cotizaciones"),false,"se requiere también el esquema de compra");
  }
  assert.equal(await moduleReady("cotizaciones"),true);
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name,email) VALUES('Proveedor de metales','cliente@example.cl') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena norte') RETURNING id",[client.id]);
  const [admin,customer]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role,client_id)
    VALUES('admin@example.cl','Admin','h','admin',null),('cliente@example.cl','Cliente','h','cliente',$1) RETURNING id`,[client.id]);
  const actor:Actor={id:admin.id,name:"Admin",email:"admin@example.cl",role:"admin",client_id:null};
  const viewer:Actor={id:customer.id,name:"Cliente",email:"cliente@example.cl",role:"cliente",client_id:client.id};
  const catalog=await db.query<{id:string;name:string}>("SELECT id,name FROM material_catalog WHERE name IN ('CHATARRA DE FIERRO MIXTO','CHATARRA DE ALUMINIO','BATERIAS') ORDER BY name");
  const iron=catalog.find(item=>item.name==="CHATARRA DE FIERRO MIXTO")!;
  const aluminum=catalog.find(item=>item.name==="CHATARRA DE ALUMINIO")!;
  const battery=catalog.find(item=>item.name==="BATERIAS")!;
  assert.ok(iron&&aluminum&&battery);
  const input={submission_key:randomUUID(),client_id:client.id,issuer:"rerchar",title:"Compra de metales por kilo",
    notes:"Pesaje en patio y pago según acuerdo comercial",issued_on:"2026-10-14",valid_until:"2026-11-14",vat_rate:"0.19",
    line:{description:"El texto no reemplaza al maestro",material_id:iron.id,line_note:"Separar impurezas",principal:"compra",segment:"compra_metal",
      quantity:"1250.500",unit:"kg",unit_price_clp:"270",taxable:true}};
  await assert.rejects(()=>quotes.createQuote(actor,{...input,line:{...input.line,material_id:""}}),quotes.QuoteError);
  const quoteId=await quotes.createQuote(actor,input);
  assert.equal(await quotes.createQuote(actor,input),quoteId,"la misma clave no crea otra propuesta");
  await quotes.addQuoteLine(actor,quoteId,{description:"Segundo material",material_id:aluminum.id,line_note:"Sin pintura",
    principal:"compra",segment:"compra_metal",quantity:"350",unit:"kg",unit_price_clp:"900",taxable:true});
  let detail=await quotes.getQuote(actor,quoteId);
  assert.deepEqual(detail.lines.map(line=>[line.material_id,line.description,line.line_note]),[
    [iron.id,iron.name,"Separar impurezas"],[aluminum.id,aluminum.name,"Sin pintura"]]);
  assert.equal(detail.quote.tax_review_status,"pendiente");
  assert.equal(detail.totals.vat,0,"el borrador no supone el tratamiento tributario");
  assert.equal((await quotes.quoteDeliveryIssues(detail.quote,detail.lines)).length,0,"la revisión tributaria no impide validar el flujo documentado");
  await assert.rejects(()=>quotes.confirmPurchaseTax(viewer,quoteId,{treatment:"sin_iva",reference:"Revisión comercial registrada el 14/10"}),quotes.QuoteError);
  await quotes.confirmPurchaseTax(actor,quoteId,{treatment:"con_iva",reference:"Revisión comercial registrada el 14/10"});
  detail=await quotes.getQuote(actor,quoteId);
  assert.equal(detail.totals.vat,Math.round(detail.totals.net*0.19));
  await quotes.confirmPurchaseTax(actor,quoteId,{treatment:"sin_iva",reference:"Equipo comercial rectificó el 14/10"});
  detail=await quotes.getQuote(actor,quoteId);
  assert.equal(detail.totals.vat,0);
  assert.equal((await quotes.quoteDeliveryIssues(detail.quote,detail.lines)).length,0);
  assert.ok((await renderQuotePdf(detail.quote,detail.lines)).length>7000);
  await quotes.recordManualQuoteDelivery(actor,quoteId,{channel:"correo",recipient:"cliente@example.cl",reference:"Entregado según correo 14/10"});
  await quotes.recordQuoteDecision(actor,quoteId,"aceptada");
  const serviceInput={submission_key:randomUUID(),client_id:client.id,site_id:site.id,quote_id:quoteId,operating_company:"rerchar",
    request_category:"compra",service_type:"compra",waste_type:"Ajustado manualmente",estimated_kg:"",origin:"Faena norte",destination:"Patio RERCHAR",
    priority:"normal",notes:"Retiro programado"};
  await assert.rejects(()=>pilot.createService(viewer,{...serviceInput,operating_company:"e_y_j"}),pilot.PilotError);
  const serviceId=await pilot.createService(actor,serviceInput);
  assert.equal(await pilot.createService(actor,serviceInput),serviceId);
  await assert.rejects(()=>pilot.createService(actor,{...serviceInput,submission_key:randomUUID()}),pilot.PilotError,"una propuesta no duplica la solicitud");
  const rows=await db.query<{material_id:string;material_name:string;quantity_kg:string;unit_price_clp:string;line_note:string|null}>(
    "SELECT material_id,material_name,quantity_kg,unit_price_clp,line_note FROM service_request_materials WHERE service_id=$1 ORDER BY position",[serviceId]);
  assert.deepEqual(rows.map(row=>[row.material_id,row.material_name,row.quantity_kg,row.unit_price_clp,row.line_note]),[
    [iron.id,iron.name,"1250.500","270.00","Separar impurezas"],[aluminum.id,aluminum.name,"350.000","900.00","Sin pintura"]]);
  const receipt={client_id:client.id,service_id:serviceId,kind:"ingreso",receipt_mode:"programada",movement_on:"2026-10-15",
    site_name:"Patio RERCHAR",weighing_ticket:"PESA-1",rerchar_kg:"1200",net_basis:"rerchar",material_id:battery.id};
  await assert.rejects(()=>materials.createMaterialReceipt(actor,receipt),materials.MaterialError,"no aceptar un material ajeno a la solicitud");
  const receiptId=await materials.createMaterialReceipt(actor,{...receipt,material_id:iron.id});
  const stored=await materials.getMaterialReceipt(actor,receiptId);
  assert.equal(stored.material_id,iron.id);
  assert.equal(stored.service_id,serviceId);

  for(const issuer of ["rerchar","e_y_j"] as const){
    const purchaseId=await quotes.createQuote(actor,{...input,submission_key:randomUUID(),issuer,vat_rate:"",title:`Compra ${issuer}`,
      line:{...input.line,description:iron.name}});
    const purchase=await quotes.getQuote(actor,purchaseId);
    assert.equal(purchase.quote.issuer,issuer);
    assert.equal(Number(purchase.quote.vat_rate),0);
    assert.equal(purchase.lines[0].description,iron.name);
    assert.ok((await renderQuotePdf(purchase.quote,purchase.lines)).length>7000);
    assert.equal((await quotes.quoteDeliveryIssues(purchase.quote,purchase.lines)).length,0);
    await quotes.recordManualQuoteDelivery(actor,purchaseId,{channel:"correo",recipient:"cliente@example.cl",reference:"Entrega manual del piloto según planilla"});
    assert.equal((await quotes.getQuote(actor,purchaseId)).quote.status,"enviada");

    const generalId=await quotes.createQuote(actor,{...input,submission_key:randomUUID(),issuer,vat_rate:"0.19",title:`Servicio ${issuer}`,
      line:{description:"Arriendo de equipo",material_id:"",line_note:"Incluye operador",principal:"arriendo",segment:"arriendo_equipo",quantity:"2",unit:"día",unit_price_clp:"150000",taxable:true}});
    const general=await quotes.getQuote(actor,generalId);
    assert.equal(general.quote.issuer,issuer);
    assert.equal(general.quote.commercial_kind,"general");
    assert.equal(general.lines[0].description,"Arriendo de equipo");

    const request=await pilot.createService(actor,{...serviceInput,submission_key:randomUUID(),quote_id:"",operating_company:issuer,
      material_id:iron.id,waste_type:iron.name,estimated_kg:""});
    const [material]=await db.query<{quantity_kg:string|null;material_name:string}>(
      "SELECT quantity_kg,material_name FROM service_request_materials WHERE service_id=$1",[request]);
    assert.equal(material.quantity_kg,null,"la compra nueva espera el pesaje real");
    assert.equal(material.material_name,iron.name);
    const [service]=await db.query<{estimated_kg:string|null;waste_type:string}>(
      "SELECT estimated_kg,waste_type FROM service_requests WHERE id=$1",[request]);
    assert.equal(service.estimated_kg,null);
    assert.equal(service.waste_type,iron.name);
  }
});
