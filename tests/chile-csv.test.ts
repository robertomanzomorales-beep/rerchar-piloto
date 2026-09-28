import assert from "node:assert/strict";
import test from "node:test";
import {chileCsvDateTime,chileCsvDay} from "../lib/chile-csv";

test("el CSV usa fecha y hora de Chile, incluso al cambiar de día y horario de invierno",()=>{
  assert.equal(chileCsvDateTime("2026-09-28T14:50:48.851Z"),"2026-09-28 11:50");
  assert.equal(chileCsvDateTime("2026-06-28T14:50:48.851Z"),"2026-06-28 10:50");
  assert.equal(chileCsvDateTime("2026-09-29T02:30:00.000Z"),"2026-09-28 23:30");
  assert.equal(chileCsvDateTime(null),"");
  assert.equal(chileCsvDay(new Date("2026-09-29T02:30:00.000Z")),"2026-09-28");
});
