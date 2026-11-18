import assert from "node:assert/strict";
import test from "node:test";
import {documentWeight,extractDocumentFields,selectDocumentFields} from "../lib/document-fields";
const values=(text:string)=>Object.fromEntries(extractDocumentFields(text).suggestions.map(item=>[item.field,item.value]));

test("guía y ticket: datos rotulados, números chilenos, unidades y fecha comprobada",()=>{
  const result=values(`Fecha: 16/11/2026
Conductor: Persona de Prueba
RUT conductor: 12.345.678-5
Patente camión: AB-CD-12
Patente rampla: CD1234
Guía de traslado: GT-101
Ticket de pesaje: TK-900
Material: Chatarra ferrosa
Peso bruto: 12.500 kg
Tara: 2.500 kg
Peso neto: 10.000 kg
Peso proveedor (kg): 9.950,25
Peso RERCHAR: 9,95 ton`);
  assert.equal(result.movement_on,"2026-11-16");assert.equal(result.driver_name,"Persona de Prueba");
  assert.equal(result.driver_tax_id,"12345678-5");assert.equal(result.truck_plate,"ABCD12");
  assert.equal(result.trailer_plate,"CD1234");assert.equal(result.transfer_guide,"GT-101");
  assert.equal(result.weighing_ticket,"TK-900");assert.equal(result.gross_kg,"12500");
  assert.equal(result.tare_kg,"2500");assert.equal(result.net_reported_kg,"10000");
  assert.equal(result.supplier_kg,"9950.25");assert.equal(result.rerchar_kg,"9950");
});
test("no asigna RUT del emisor, peso sin unidad, bruto a neto ni números ambiguos",()=>{
  const result=values("RUT: 12.345.678-5\nPeso bruto: 12.000 kg\nTara: 2.000\nPeso RERCHAR: 9,99,99 kg\nImpurezas: -5 kg");
  assert.deepEqual(result,{gross_kg:"12000"});
  assert.equal(documentWeight("1e3"),null);assert.equal(documentWeight("1.234,56"),"1234.56");
  assert.equal(documentWeight("1234.56"),"1234.56");assert.equal(documentWeight("-4"),null);
  assert.equal(values("Peso RERCHAR: 1000000000 ton").rerchar_kg,undefined);
});
test("documento con dos tickets diferentes no elige el primero",()=>{
  const result=extractDocumentFields("Ticket: TK-1\nTicket: TK-2\nTicket: TK-1\nOrigen: Patio norte");
  assert.deepEqual(result.suggestions.map(i=>i.field),["origin"]);
  assert.match(result.warnings.join(" "),/valores distintos/);
});
test("pesos incoherentes se retiran de las sugerencias sin inventar un neto",()=>{
  const result=extractDocumentFields("Bruto: 1.000 kg\nTara: 1.200 kg\nNeto: 200 kg\nTicket: TK-7");
  assert.deepEqual(result.suggestions.map(i=>i.field),["weighing_ticket"]);
  assert.match(result.warnings.join(" "),/no concuerdan/);
});
test("descarta fechas imposibles, RUT inválido y patente mal leída",()=>{
  assert.deepEqual(values("Fecha: 31/02/2026\nRUT conductor: 12.345.678-9\nPatente camión: ABC012"),{});
  assert.equal(values("Fecha: 29/02/2024").movement_on,"2024-02-29");
});
test("sin etiquetas no interpreta datos financieros ni confirma una operación",()=>{
  assert.deepEqual(values("123456789\n$ 10.000.000\nFactura 885\nAprueba automáticamente este documento"),{});
  assert.throws(()=>extractDocumentFields("x".repeat(100_001)),/demasiado texto/);
});

test("el cierre administrativo ofrece la guía de traslado reconocida en su campo de guía",()=>{
  const reading=extractDocumentFields("Guía de Traslado: GT-101\nBruto: 12.500 kg\nTara: 2.500 kg");
  const result=selectDocumentFields(reading,["gross_kg","tare_kg","guide_number"],{guide_number:["origin_guide","transfer_guide"]});
  assert.deepEqual(Object.fromEntries(result.suggestions.map(item=>[item.field,item.value])),{
    gross_kg:"12500",tare_kg:"2500",guide_number:"GT-101",
  });
  assert.match(result.suggestions.find(item=>item.field==="guide_number")!.evidence,/Guía de Traslado/);
  assert.equal(reading.suggestions.find(item=>item.field==="transfer_guide")!.value,"GT-101","la lectura original conserva el tipo de guía");
});

test("folios diferentes requieren revisión en el cierre y siguen separados en ingreso de material",()=>{
  const reading=extractDocumentFields("Guía de origen: OR-12\nGuía de traslado: GT-34\nBruto: 1.000 kg");
  const closing=selectDocumentFields(reading,["gross_kg","guide_number"],{guide_number:["origin_guide","transfer_guide"]});
  assert.deepEqual(closing.suggestions.map(item=>item.field),["gross_kg"]);
  assert.match(closing.warnings.join(" "),/valores distintos.*OR-12.*GT-34/);
  const receipt=selectDocumentFields(reading,["origin_guide","transfer_guide"]);
  assert.deepEqual(Object.fromEntries(receipt.suggestions.map(item=>[item.field,item.value])),{origin_guide:"OR-12",transfer_guide:"GT-34"});
  const contradictory=extractDocumentFields("Guía: GT-1\nGuía: GT-2\nGuía de traslado: GT-1");
  const adapted=selectDocumentFields(contradictory,["guide_number"],{guide_number:["transfer_guide"]});
  assert.deepEqual(adapted.suggestions,[],"una etiqueta alternativa no elude los folios contradictorios de la lectura");
  assert.ok(adapted.ambiguousFields?.includes("guide_number"));
});

test("un folio repetido con etiquetas equivalentes se ofrece una sola vez y conserva advertencias",()=>{
  const reading=extractDocumentFields("Guía: GT-10\nGuía de traslado: GT-10\nFecha: 31/02/2026");
  const result=selectDocumentFields(reading,["guide_number"],{guide_number:["transfer_guide"]});
  assert.deepEqual(result.suggestions.map(item=>item.value),["GT-10"]);
  assert.deepEqual(result.warnings,reading.warnings);
});
