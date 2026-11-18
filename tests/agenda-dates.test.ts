import assert from "node:assert/strict";
import test from "node:test";
import {agendaPeriod,agendaIso,agendaAddDays} from "../lib/agenda-dates";

test("seleccionar mes y año abre su primera semana sin confundir el mes cuando empieza en la anterior",()=>{
  const period=agendaPeriod({mes:"05",anio:"2027"},"2026-11-18");
  assert.equal(period.reference,"2027-05-01");assert.equal(agendaIso(period.monday),"2027-04-26");
  assert.equal(agendaIso(period.days[6]),"2027-05-02");assert.equal(agendaIso(period.next),"2027-05-03");
  assert.equal(period.month,5);assert.equal(period.year,2027);
  const switchedCompany=agendaPeriod({inicio:period.reference},"2026-11-18");
  assert.equal(switchedCompany.month,5);assert.equal(agendaIso(switchedCompany.monday),"2027-04-26");
});
test("la navegación conserva semanas completas al cruzar año y febrero bisiesto",()=>{
  const january=agendaPeriod({mes:"01",anio:"2027"},"2026-11-18");
  assert.equal(agendaIso(january.monday),"2026-12-28");assert.equal(agendaIso(january.days[6]),"2027-01-03");
  assert.equal(agendaIso(agendaAddDays(january.monday,-7)),"2026-12-21");
  const leap=agendaPeriod({inicio:"2028-02-29"},"2026-11-18");
  assert.equal(agendaIso(leap.monday),"2028-02-28");assert.equal(agendaIso(leap.days[6]),"2028-03-05");
});
test("fechas imposibles o un mes inválido vuelven a una fecha válida y Hoy usa el día de Chile",()=>{
  const period=agendaPeriod({inicio:"2026-02-31",mes:"13",anio:"2027"},"2026-11-18");
  assert.equal(period.reference,"2026-11-18");assert.equal(agendaIso(period.monday),"2026-11-16");
  assert.equal(period.today,"2026-11-18");
  const old=agendaPeriod({inicio:"2024-06-12",mes:"02",anio:"error"},"2026-11-18");
  assert.equal(old.reference,"2024-06-12");assert.equal(old.month,6);assert.equal(old.year,2024);
});
