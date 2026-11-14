import assert from "node:assert/strict";
import test from "node:test";
import {requestKindFromQuote,requestTypesFromQuote} from "../lib/request-kind";

test("una cotización aceptada abre la solicitud del proceso cotizado",()=>{
  assert.deepEqual(requestKindFromQuote("compra_material",["compra"]),{category:"compra",serviceType:"compra"});
  assert.deepEqual(requestKindFromQuote("general",["arriendo","arriendo"]),{category:"servicios",serviceType:"arriendo"});
  assert.deepEqual(requestKindFromQuote("general",["retiro"]),{category:"retiro",serviceType:"retiro"});
  assert.deepEqual(requestKindFromQuote("general",["transporte"]),{category:"servicios",serviceType:"traslado"});
  assert.deepEqual(requestKindFromQuote("general",["arriendo","transporte"]),{category:"servicios",serviceType:"traslado"});
  assert.deepEqual(requestTypesFromQuote("general",["arriendo","retiro"]),["arriendo","retiro"]);
  assert.deepEqual(requestKindFromQuote("general",["arriendo","retiro"]),{category:"servicios",serviceType:"arriendo"});
});
