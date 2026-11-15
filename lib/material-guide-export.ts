import {buildOperationalWorkbook,type Cell} from "./material-export";
import {materialGuideTotals,type MaterialGuide,type MaterialGuideItem} from "./material-guides";

// A:AJ de «CONTROL GUIA RERCHAR CHILE AÑO 2026», una fila por material.
export const guideHeaders=[
  "VENTA DIRECTA SITIO O EMPRESAS / COMPRA","FECHA","N° GUIA","CONDUCTOR","PATENTE CAMIÓN",
  "EMPRESA","MATERIAL","N° TICKET DE FAENA","PESO DE LLEGADA (DESDE FAENA)",
  "PESO COMPLEMENTARIO (DESDE STOCK)","N° TICKET DE SALIDA","PESO DE SALIDA",
  "N° TICKET DE LLEGADA","PESO DE LLEGADA","PESO IMPUREZAS (ROMANA RERCHAR) (MATERIAL DEVUELTO)",
  "DIFERENCIA PESO SALIDA/LLEGADA","OBSERVACIONES","IMPUREZA AZA","PESO FACTURA",
  "DIFERENCIA PESO TICKET/FACTURA","PRECIO ACORDADO","PRECIO FACTURA",
  "VALOR TOTAL ESTIMATIVO","TOTAL FACT. REVISAR DEPOSITO","DIFER. TOT","N° FACTURA",
  "FECHA DE EMISION FACTURA","ESTADO FACT","FECHA DE PAGO","FLETES","EMPRESA TRANSP",
  "N° FACTURA EMPRESA TRANSP.","N° REFERENCIA GUIA","¿CORRESPONDE PAGO? (SI/NO)",
  "ESTADO FACT TRANSP","OBSERVACIÓN",
];

type Guide=Pick<MaterialGuide,"movement_detail"|"movement_type"|"movement_on"|"guide_number"|"driver_name"|
  "truck_plate"|"freight_cost_clp"|"freight_company"|"freight_invoice_number"|"freight_guide_reference"|
  "freight_payment_required"|"freight_invoice_status"|"notes">;
type Item=Pick<MaterialGuideItem,"material_name"|"origin_ticket"|"origin_kg"|"stock_kg"|"departure_ticket"|
  "destination_ticket"|"arrival_kg"|"returned_kg"|"destination_impurity_kg"|"invoice_kg"|
  "agreed_price_clp"|"invoice_price_clp"|"invoice_number"|"invoice_issued_on"|"invoice_status"|
  "payment_on"|"notes">;
export type GuideExportRecord={guide:Guide;item:Item;counterparty_name:string};
const number=(value:string|null)=>value==null?null:Number(value);
const date=(value:Date|string|null)=>value?new Date(`${String(value instanceof Date?value.toISOString():value).slice(0,10)}T00:00:00Z`):null;

export function guideExportRow({guide:g,item:i,counterparty_name}:GuideExportRecord):Cell[]{
  const totals=materialGuideTotals(i);
  return [g.movement_detail||g.movement_type.toUpperCase(),date(g.movement_on),g.guide_number,g.driver_name,
    g.truck_plate,counterparty_name,i.material_name,i.origin_ticket,number(i.origin_kg),number(i.stock_kg),
    i.departure_ticket,totals.departure_kg,i.destination_ticket,number(i.arrival_kg),number(i.returned_kg),
    totals.destination_difference_kg,i.notes,number(i.destination_impurity_kg),number(i.invoice_kg),
    totals.invoice_difference_kg,number(i.agreed_price_clp),number(i.invoice_price_clp),
    totals.estimated_clp,totals.billed_clp,totals.value_difference_clp,i.invoice_number,date(i.invoice_issued_on),
    i.invoice_status,date(i.payment_on),number(g.freight_cost_clp),g.freight_company,g.freight_invoice_number,
    g.freight_guide_reference,g.freight_payment_required,g.freight_invoice_status,g.notes];
}

export function buildGuideWorkbook(records:GuideExportRecord[],month:string):Buffer{
  return buildOperationalWorkbook(guideHeaders,records.map(guideExportRow),month,"CONTROL DE GUÍAS RERCHAR",1);
}
