import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {PDFDocument} from "pdf-lib";
import {statementTotals,type Statement,type Operation,type Charge} from "../lib/payment-statements";
import {renderPaymentStatementPdf} from "../lib/payment-statement-pdf";

const statement:Statement={id:randomUUID(),client_id:randomUUID(),client_name:"ECHEVERRÍA IZQUIERDO MONTAJES INDUSTRIALES S.A.",
  client_tax_id:"96.870.780-9",client_address:"Rosario Norte 532 Piso 7, Las Condes, Santiago, Chile",
  client_contact:"ntoro@eimontajes.cl",issuer_contact:"ccarpio@rerchar.cl",contract_manager:"Eduardo Aramayo",
  number:"01",period_on:"2026-01-01",statement_type:"residuos",contract_reference:"Contrato 2026",notes:"",
  status:"borrador",created_at:"2026-01-20",receivable_invoice_id:null,service_invoice_id:null,invoice_variance_note:null,
  client_order_reference:null,client_order_on:null,client_order_exception:null};
function operation(index:number,disposal=false):Operation{return {id:randomUUID(),statement_id:statement.id,service_id:null,
  line_number:index,description:disposal?"Disposición final":"Servicio de transporte Residuo Industrial",
  operation_on:"2026-01-15",weight_kg:"13710",weighing_ticket:"17819",service_sheet:"2949",
  guide_number:"3669",sidrep:"SIDREP-001",rental_from:null,rental_to:null,is_disposal:disposal};}
function charge(index:number,pricing:Charge["pricing"],unit:string,quantity:string|null,uf:string|null):Charge{
  return {id:randomUUID(),statement_id:statement.id,line_number:index,
    description:pricing==="uf_ton"?"Valor disposición final por tonelada":pricing==="uf_unidad"?"Arriendo mensual excavadora":"Valor unitario servicio industrial",
    pricing,unit_value:unit,quantity,uf_value_clp:uf,uf_on:uf?"2026-01-30":null};
}

test("PDF EDP conserva formatos de residuos y arriendo, importes pendientes y varias páginas",async()=>{
  const residues=[operation(1),operation(2,true)];
  const charges=[charge(1,"clp_servicio","1250000","1",null),charge(2,"uf_ton","1.5",null,"39708.63")];
  const totals=statementTotals(residues,charges);
  assert.equal(totals.disposal_tons,13.71);
  assert.equal(totals.net_clp,1250000+Math.round(1.5*13.71*39708.63));
  const document=await PDFDocument.load(await renderPaymentStatementPdf(statement,residues,totals));
  assert.equal(document.getPageCount(),1);
  assert.ok(document.getPage(0).getSize().width>document.getPage(0).getSize().height);

  const rental:Statement={...statement,statement_type:"arriendo",period_on:"2026-08-01",status:"aprobado",
    client_name:"SOCIEDAD DE INVERSIONES JRC SPA",notes:"Arriendo según contrato."};
  const rentalOperations:Operation[]=[{...operation(1),description:"Arriendo excavadora Komatsu PC 210 LC10 MO",
    operation_on:null,weight_kg:null,rental_from:"2026-07-24",rental_to:"2026-08-23"}];
  const rentalCharges=[charge(1,"uf_unidad","180","1","40844")];
  const rentalTotals=statementTotals(rentalOperations,rentalCharges);
  assert.equal(rentalTotals.net_clp,7351920);
  const rentalPdf=await PDFDocument.load(await renderPaymentStatementPdf(rental,rentalOperations,rentalTotals));
  assert.equal(rentalPdf.getPageCount(),1);
  assert.ok(rentalPdf.getPage(0).getSize().height>rentalPdf.getPage(0).getSize().width);

  const incomplete=statementTotals([],rentalCharges.map(c=>({...c,pricing:"uf_ton" as const,quantity:null})));
  assert.equal(incomplete.total_clp,null);
  const draftPdf=await PDFDocument.load(await renderPaymentStatementPdf(statement,[],incomplete));
  assert.equal(draftPdf.getPageCount(),1);

  const manyOperations=Array.from({length:85},(_,index)=>({...operation(index+1,index%2===1),
    description:`Servicio con respaldo extenso ${index+1}: materiales industriales de la faena y su disposición final registrada.`}));
  const many=await PDFDocument.load(await renderPaymentStatementPdf({...statement,notes:"Revisar guías y tickets. ".repeat(38)},
    manyOperations,statementTotals(manyOperations,charges)));
  assert.ok(many.getPageCount()>3,"las filas se distribuyen entre páginas sin límite fijo");
  for(const page of many.getPages())assert.deepEqual(page.getSize(),{width:841.89,height:595.28});
});
