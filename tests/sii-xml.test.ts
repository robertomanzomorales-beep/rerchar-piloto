import test from "node:test";
import assert from "node:assert/strict";
import {parseSiiXml,decodeSiiXml,siiRut,SiiDocumentError} from "../lib/sii-xml";
import {dte,envelope,bytes,companyRut,thirdRut} from "./fixtures/sii-xml";

test("SII XML conserva folios, RUT, fechas, montos, exentas y referencias de notas",()=>{
  const docs=parseSiiXml(bytes(envelope(dte({folio:"9999999999"}),dte({type:34,folio:"2"}),dte({type:61,folio:"3"}))));
  assert.equal(docs[0].folio,"9999999999");assert.equal(docs[0].issuer_tax_id,companyRut);
  assert.equal(docs[0].receiver_tax_id,thirdRut);assert.equal(docs[0].total_clp,119000);assert.equal(docs[0].totals_match,true);
  assert.equal(docs[1].net_clp,0);assert.equal(docs[1].exempt_clp,100000);assert.equal(docs[1].vat_clp,0);
  assert.deepEqual(docs[2].references,[{document_type:"33",folio:"1"}]);
  assert.equal(docs[0].due_on,"2026-10-31");
  assert.equal(siiRut("1.234.567-4"),"1234567-4");
});
test("SII XML admite namespaces, UTF-8 e ISO-8859-1 sin cambiar el documento original",()=>{
  const utf=dte({name:"Áridos &amp; Metales"}),latin=utf.replace("UTF-8","ISO-8859-1");
  assert.equal(parseSiiXml(Buffer.from(latin,"latin1"))[0].issuer_name,"Áridos & Metales");
  const namespaced=utf.replace(/(<\/?)(DTE|Documento|Encabezado|IdDoc|TipoDTE|Folio|FchEmis|FchVenc|Emisor|Receptor|RUTEmisor|RUTRecep|RznSoc|RznSocRecep|Totales|MntNeto|IVA|MntTotal|Detalle|NroLinDet|NmbItem|MontoItem)/g,"$1sii:$2").replace('xmlns="','xmlns:sii="');
  assert.equal(parseSiiXml(bytes(namespaced))[0].payload_sha256,parseSiiXml(bytes(utf))[0].payload_sha256);
  assert.match(decodeSiiXml(Buffer.from(latin,"latin1")),/Áridos/);
});
test("SII XML rechaza documentos ambiguos, fechas, RUT, tipos y montos inválidos",()=>{
  for(const invalid of [dte({type:52}),dte({folio:"01"}),dte({folio:"10000000000"}),dte().replace("2026-10-01","2026-02-31"),
    dte({issuer:"12345678-9"}),dte({total:"1e5"}),dte().replace("<IVA>19000</IVA>","<IVA></IVA>"),
    dte().replace("<IdDoc>","<IdDoc><Folio>99</Folio>"),envelope(dte(),dte()),"<DTE><Documento></DTE>",
    dte()+"<Otro/>",dte()+dte({folio:"2"}).replace(/<\?xml[^>]*\?>/,"")])
    assert.throws(()=>parseSiiXml(bytes(invalid)),SiiDocumentError);
  assert.equal(parseSiiXml(bytes(dte({total:"120000"})))[0].totals_match,false,"no oculta diferencias ni otros impuestos");
});
test("SII XML limita tamaño, documentos y estructuras no admitidas",()=>{
  assert.throws(()=>parseSiiXml(Buffer.alloc(3*1024*1024+1)),SiiDocumentError);
  assert.throws(()=>parseSiiXml(bytes('<!DOCTYPE a [<!ENTITY a SYSTEM "file:///etc/passwd">]>'+dte())),SiiDocumentError);
  assert.throws(()=>parseSiiXml(bytes('<a>'.repeat(65)+'</a>'.repeat(65))),SiiDocumentError);
  assert.throws(()=>parseSiiXml(bytes(envelope(...Array.from({length:101},(_,i)=>dte({folio:String(i+1)}))))),SiiDocumentError);
  assert.throws(()=>decodeSiiXml(bytes(dte().replace('UTF-8','UTF-16'))),SiiDocumentError);
});
