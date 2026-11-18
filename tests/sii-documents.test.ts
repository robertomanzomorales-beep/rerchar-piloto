import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {randomUUID} from "node:crypto";
import type {Actor} from "../lib/auth";
import {dte,envelope,bytes,companyRut,eyjRut,thirdRut,testRut} from "./fixtures/sii-xml";

test("bandeja SII separa empresas, conserva XML, revisa documentos y no duplica deudas",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const sii=await import("../lib/sii-documents");
  const {moduleReady}=await import("../lib/schema-readiness");
  const migrations=(await readdir(resolve(process.cwd(),"db"))).filter(x=>/^\d+.*\.sql$/.test(x)).sort();
  for(const name of migrations.filter(x=>x<'070')){
    const sql=await readFile(resolve(process.cwd(),"db",name),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  assert.equal(await moduleReady("sii_documents"),false,"no anuncia el módulo como activo antes de migrar");
  const sql=await readFile(resolve(process.cwd(),"db/070_documentos_sii.sql"),"utf8");
  await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  assert.equal(await moduleReady("sii_documents"),true);
  const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('sii@example.invalid','Revisión SII','h','admin') RETURNING id");
  const admin:Actor={id:user.id,name:"Revisión SII",email:"sii@example.invalid",role:"admin",client_id:null};
  const operator:Actor={...admin,role:"operaciones"};
  for(const role of ['operaciones','cliente','conductor'] as const){
    const denied:Actor={...admin,role};
    await assert.rejects(()=>sii.listSiiCompanySettings(denied),sii.SiiDocumentError);
    await assert.rejects(()=>sii.saveSiiCompanyTaxId(denied,'rerchar',companyRut),sii.SiiDocumentError);
    await assert.rejects(()=>sii.importSiiXml(denied,'rerchar',bytes(dte()),'x.xml'),sii.SiiDocumentError);
    await assert.rejects(()=>sii.listSiiDocuments(denied),sii.SiiDocumentError);
    await assert.rejects(()=>sii.getSiiOriginalXml(denied,randomUUID()),sii.SiiDocumentError);
  }
  await assert.rejects(()=>sii.importSiiXml(admin,'rerchar',bytes(dte()),'test.xml'),/Registre primero el RUT/);
  await sii.saveSiiCompanyTaxId(admin,'rerchar',companyRut);
  await assert.rejects(()=>sii.saveSiiCompanyTaxId(admin,'e_y_j',companyRut),/otra empresa/);
  await sii.saveSiiCompanyTaxId(admin,'e_y_j',eyjRut);
  assert.deepEqual(await sii.importSiiXml(admin,'rerchar',bytes(dte()),'factura.xml'),{inserted:1,duplicates:0});
  assert.deepEqual(await sii.importSiiXml(admin,'rerchar',bytes(dte()),'otro-nombre.xml'),{inserted:0,duplicates:1});
  assert.deepEqual(await sii.importSiiXml(admin,'rerchar',bytes(envelope(dte())),'envio.xml'),{inserted:0,duplicates:1},"el mismo DTE en otro envoltorio no se duplica");
  await assert.rejects(()=>sii.saveSiiCompanyTaxId(admin,'rerchar',testRut('70000003')),/tiene documentos/);
  const first=(await sii.listSiiDocuments(admin,{company:'rerchar'})).rows[0];
  const original=await sii.getSiiOriginalXml(admin,first.id);
  assert.deepEqual(Buffer.from(original.original_xml),bytes(dte()));assert.equal(original.original_filename,'factura.xml');
  assert.equal(first.review_status,'pendiente');assert.equal(Object.hasOwn(first,'original_xml'),false);
  await assert.rejects(()=>sii.importSiiXml(admin,'rerchar',bytes(dte({product:'Contenido cambiado'})),'cambiada.xml'),/otro contenido/);
  await assert.rejects(()=>sii.importSiiXml(admin,'e_y_j',bytes(dte()),'ajena.xml'),/no identifica/);
  await assert.rejects(()=>sii.importSiiXml(admin,'rerchar',bytes(envelope(dte({folio:'99'}),dte({product:'Alterado'}))),'fallido.xml'),/otro contenido/);
  assert.equal((await sii.listSiiDocuments(admin)).total,1,"el envío fallido revierte todos sus documentos");
  assert.equal((await db.query('SELECT id FROM sii_xml_sources')).length,1,"el rechazo tampoco deja un archivo huérfano");
  await sii.importSiiXml(admin,'rerchar',bytes(dte({issuer:thirdRut,receiver:companyRut})),'recibida.xml');
  await sii.importSiiXml(admin,'rerchar',bytes(dte({type:61})),'nota.xml');
  const intercompany=bytes(dte({folio:'40',receiver:eyjRut}));
  await sii.importSiiXml(admin,'rerchar',intercompany,'interempresa.xml');
  await sii.importSiiXml(admin,'e_y_j',intercompany,'interempresa.xml');
  assert.equal((await sii.listSiiDocuments(admin,{company:'rerchar',direction:'emitido'})).total,3);
  assert.equal((await sii.listSiiDocuments(admin,{company:'rerchar',direction:'recibido'})).total,1);
  assert.equal((await sii.listSiiDocuments(admin,{company:'e_y_j',direction:'recibido'})).total,1);
  await assert.rejects(()=>sii.reviewSiiDocument(operator,first.id,{status:'revisado'}),sii.SiiDocumentError);
  await sii.reviewSiiDocument(admin,first.id,{status:'revisado',note:'Cotejado con el original'});
  assert.equal((await sii.listSiiDocuments(admin,{review:'revisado'})).total,1);
  await assert.rejects(()=>sii.reviewSiiDocument(admin,first.id,{status:'pendiente'}),/por qué devuelve/);
  await sii.reviewSiiDocument(admin,first.id,{status:'pendiente',note:'Solicitar cotejo adicional'});
  const pending=(await sii.listSiiDocuments(admin,{company:'rerchar'})).rows.find(row=>row.id===first.id)!;
  assert.equal(pending.reviewed_name,null);assert.equal(pending.reviewed_at,null);
  await sii.importSiiXml(admin,'rerchar',bytes(dte({folio:'50',total:'120000'})),'otros-impuestos.xml');
  const mismatch=(await sii.listSiiDocuments(admin)).rows.find(row=>row.folio==='50')!;
  await assert.rejects(()=>sii.reviewSiiDocument(admin,mismatch.id,{status:'revisado'}),/diferencia de totales/);
  await sii.reviewSiiDocument(admin,mismatch.id,{status:'revisado',note:'Diferencia pendiente de cotejo tributario'});
  const repeated=bytes(dte({folio:'60'}));
  const concurrent=await Promise.all([sii.importSiiXml(admin,'rerchar',repeated,'simultaneo.xml'),sii.importSiiXml(admin,'rerchar',repeated,'simultaneo.xml')]);
  assert.equal(concurrent.reduce((sum,row)=>sum+row.inserted,0),1);
  assert.equal(concurrent.reduce((sum,row)=>sum+row.duplicates,0),1);
  const multi=bytes(envelope(dte({folio:'70'}),dte({folio:'71'})));
  await sii.importSiiXml(admin,'rerchar',multi,'envio-dos.xml');
  const [storage]=await db.query<{count:string}>('SELECT count(*)::text AS count FROM sii_xml_sources WHERE original_filename=$1',['envio-dos.xml']);
  assert.equal(storage.count,'1',"un envío se guarda una sola vez, no una vez por cada DTE");
  for(const range of [[200,300],[300,301]]){
    const docs=Array.from({length:range[1]-range[0]},(_,index)=>dte({issuer:eyjRut,folio:String(range[0]+index)}));
    await sii.importSiiXml(admin,'e_y_j',bytes(envelope(...docs)),'pagina.xml');
  }
  const page2=await sii.listSiiDocuments(admin,{company:'e_y_j',direction:'emitido',page:2});
  assert.equal(page2.total,101);assert.equal(page2.rows.length,1);assert.equal(page2.pages,2);
  assert.equal((await sii.listSiiDocuments(admin,{company:'e_y_j',direction:'emitido',page:999})).page,2);
  for(const table of ['supplier_invoices','service_invoices','extra_receivable_invoices','supplier_invoice_payments','invoice_payments'])
    assert.equal((await db.query(`SELECT id FROM ${table}`)).length,0,`${table} no cambia al importar ni revisar XML`);
  assert.ok((await db.query("SELECT id FROM audit_events WHERE entity_type='sii_document' AND action='review'")).length>=3);
});
