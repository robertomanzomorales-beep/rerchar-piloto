import assert from "node:assert/strict";
import test from "node:test";
import {buildGuideWorkbook,guideExportRow,guideHeaders,type GuideExportRecord} from "../lib/material-guide-export";

test("control mensual de guías conserva las 36 columnas y diferencias de la planilla",()=>{
  const record:GuideExportRecord={
    counterparty_name:"Comprador industrial",
    guide:{movement_detail:"VENTA DIRECTA",movement_type:"venta",movement_on:"2026-10-14",
      guide_number:"G-100",driver_name:"Ana Pérez",truck_plate:"ABCD-12",freight_cost_clp:"25000",
      freight_company:"Transportes",freight_invoice_number:"FT-1",freight_guide_reference:"G-100",
      freight_payment_required:"si",freight_invoice_status:"pendiente",notes:"Flete pendiente"},
    item:{material_name:"CHATARRA DE FIERRO MIXTO",origin_ticket:"TK-F",origin_kg:"900",stock_kg:"100",
      departure_ticket:"TK-S",destination_ticket:"TK-D",arrival_kg:"970",returned_kg:"20",
      destination_impurity_kg:"10",invoice_kg:"950",agreed_price_clp:"200",invoice_price_clp:"190",
      invoice_number:"FV-1",invoice_issued_on:"2026-10-15",invoice_status:"pendiente",
      payment_on:null,notes:"Revisar diferencia"},
  };
  const row=guideExportRow(record);
  assert.equal(guideHeaders.length,36);
  assert.equal(row.length,36);
  assert.equal(row[11],1000,"peso de salida I + J en L");
  assert.equal(row[15],-10,"diferencia N - (L - O) en P");
  assert.equal(row[19],10,"diferencia (N - R) - S en T");
  assert.equal(row[22],192000,"valor estimado U × (N - R) en W");
  assert.equal(row[23],180500,"valor facturado S × V en X");
  assert.equal(row[24],11500,"diferencia W - X en Y");
  assert.equal(row[33],"si","pago flete en AH");
  const book=buildGuideWorkbook([record],"2026-10");
  assert.equal(book.subarray(0,2).toString(),"PK");
});
