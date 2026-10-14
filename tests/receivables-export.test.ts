import assert from "node:assert/strict";
import test from "node:test";
import {filterReceivables,parseReceivableFilter,receivablesCsv} from "../lib/receivable-export";
import type {Receivable} from "../lib/receivables";

const invoice=(id:string,due_on:string,total_clp:string,paid_clp:string,client_name="Cliente"):Receivable=>({
  id,source:"servicio",service_id:null,statement_id:null,edp_count:"0",extra_count:"0",
  invoice_number:`F-${id}`,client_name,issued_on:"2026-10-01",due_on,total_clp,paid_clp,
});

test("filtros de cobranza respetan el día de Chile y el límite inclusivo de siete días",()=>{
  const today="2026-10-14";
  const rows=[invoice("vencida","2026-10-13","1000.00","100.00"),
    invoice("hoy","2026-10-14","1000.00","0"),invoice("siete","2026-10-21","1000.00","0"),
    invoice("ocho","2026-10-22","1000.00","0"),invoice("pagada","2026-10-01","1000.00","1000.00")];
  const names=(filter:ReturnType<typeof parseReceivableFilter>)=>filterReceivables(rows,filter,today).map(row=>row.id);
  assert.deepEqual(names("vencidas"),["vencida"]);
  assert.deepEqual(names("proximas"),["hoy","siete"]);
  assert.deepEqual(names("pagadas"),["pagada"]);
  assert.deepEqual(names("pendientes"),["vencida","hoy","siete","ocho"]);
  assert.equal(parseReceivableFilter("inesperado"),"pendientes");
});

test("CSV de cada empresa conserva saldo y protege textos al abrir una planilla",()=>{
  const row=invoice("1","2026-10-12","1234.50","234.25",'=SUM(1;1)\n"Cliente"');
  row.edp_count="2";
  const rerchar=receivablesCsv([row],"rerchar","2026-10-14");
  assert.match(rerchar,/^\uFEFF"Empresa";/);
  assert.match(rerchar,/"RERCHAR";"F-1";"'=SUM\(1;1\)\n""Cliente"""/);
  assert.match(rerchar,/"2026-10-12";"2";"Vencida";"1234,50";"234,25";"1000,25";"2";"0"\r\n$/);
  assert.match(receivablesCsv([row],"e_y_j","2026-10-14"),/"E y J";"F-1"/);
});
