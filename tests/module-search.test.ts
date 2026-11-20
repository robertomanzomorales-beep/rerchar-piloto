import assert from "node:assert/strict";
import test from "node:test";
import {filterModuleDestinations} from "../lib/module-search";

const purchase={href:"/compras",text:"Órdenes de compra",group:"Recursos compartidos"};
const inventory={href:"/inventario",text:"Inventario",group:"Recursos compartidos"};
const profiles={href:"/fichas",text:"Fichas cliente / proveedor",group:"Abastecimiento"};
const guide={href:"/seguimiento-guias?empresa=rerchar",text:"Guías valorizadas",group:"Operación"};
const edp={href:"/estados-pago",text:"Estados de pago",group:"Cierre y control"};
const quotes=(company:string)=>({href:`/cotizaciones?empresa=${company}`,text:"Cotizaciones",group:"Comercial"});

test("los plurales de uso habitual encuentran compra, proveedor e inventario en ambas empresas",()=>{
  for(const company of ["rerchar","e_y_j"]){
    const destinations=[quotes(company),purchase,inventory,profiles];
    assert.deepEqual(filterModuleDestinations(destinations,"compras"),[purchase]);
    assert.deepEqual(filterModuleDestinations(destinations,"proveedores"),[profiles]);
    assert.deepEqual(filterModuleDestinations(destinations,"inventarios"),[inventory]);
    assert.deepEqual(filterModuleDestinations(destinations,"  ÓRDENES   de COMPRAS  "),[purchase]);
  }
});

test("se conservan tildes, consultas por palabras, fragmentos y grupos del buscador",()=>{
  const destinations=[purchase,inventory,guide,edp];
  assert.deepEqual(filterModuleDestinations(destinations,"orden de compra"),[purchase]);
  assert.deepEqual(filterModuleDestinations(destinations,"compra orden"),[purchase]);
  assert.deepEqual(filterModuleDestinations(destinations,"guia valorizada"),[guide]);
  assert.deepEqual(filterModuleDestinations(destinations,"estado de PÁGO"),[edp]);
  assert.deepEqual(filterModuleDestinations(destinations,"invent"),[inventory]);
  assert.deepEqual(filterModuleDestinations(destinations,"recursos compartidos"),[purchase,inventory]);
});

test("una consulta sólo devuelve los destinos recibidos para la empresa y el perfil",()=>{
  const operations=[purchase,inventory,guide],driver=[{href:"/agenda?empresa=rerchar",text:"Agenda",group:"Operación"}];
  assert.deepEqual(filterModuleDestinations(operations,"proveedores"),[]);
  assert.deepEqual(filterModuleDestinations(driver,"compras"),[]);
  assert.deepEqual(filterModuleDestinations([quotes("e_y_j"),edp],"guías"),[]);
  assert.deepEqual(filterModuleDestinations([quotes("rerchar"),guide],"estados de pago"),[]);
  assert.deepEqual(filterModuleDestinations(driver,"/fichas"),[]);
  const selected=quotes("e_y_j");
  assert.strictEqual(filterModuleDestinations([selected],"cotizacion")[0],selected);
  assert.equal(selected.href,"/cotizaciones?empresa=e_y_j");
});

test("la consulta vacía conserva orden, objetos y límite de doce sin modificar el catálogo",()=>{
  const destinations=Array.from({length:15},(_,i)=>({href:`/modulo-${i}`,text:`Módulo ${i}`,group:"Inicio"}));
  const before=JSON.stringify(destinations),result=filterModuleDestinations(destinations," \t ");
  assert.equal(result.length,12);
  assert.deepEqual(result,destinations.slice(0,12));
  assert.strictEqual(result[0],destinations[0]);
  assert.equal(JSON.stringify(destinations),before);
  assert.deepEqual(filterModuleDestinations(destinations,"inexistente"),[]);
});
