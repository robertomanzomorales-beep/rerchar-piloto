import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {destinationAvailability,destinationDay} from "../lib/destination-catalog";
import {destinationContext,destinationDraft,destinationHref} from "../lib/destination-form-state";

test("configuración de destino conserva campos, cero y varias categorías al fallar",()=>{
  const form=new FormData();for(const [key,value]of Object.entries({id:randomUUID(),name:"Destino de prueba",latitude:"0",longitude:"0",status:"habilitado",authorization_reference:"Resolución 123",authorization_valid_until:"2099-12-31",disposal_unit:"tonelada",disposal_price_clp:"0"}))form.set(key,value);
  form.append("accepted_categories","chatarra");form.append("accepted_categories","reciclable");const state=destinationDraft("update",form,"No guardado");assert.equal(state.values.disposal_price_clp,"0");assert.equal(state.values.latitude,"0");assert.equal(state.values.authorization_reference,"Resolución 123");assert.deepEqual(state.categories,["chatarra","reciclable"]);
  const create=destinationDraft("create",form,"Error");assert.deepEqual(create.categories,[]);assert.ok(!("authorization_reference" in create.values));assert.equal(create.values.name,"Destino de prueba");
});
test("un error de destino devuelve sólo el nombre del archivo y datos permitidos",()=>{
  const form=new FormData();form.set("authorization_document",new File(["CONTENIDO_PRIVADO_NO_SERIALIZAR"],"permiso de prueba.pdf",{type:"application/pdf"}));form.set("token","SECRETO_NO_SERIALIZAR");form.set("password","CLAVE_NO_SERIALIZAR");const state=destinationDraft("update",form,"Error");assert.equal(state.fileName,"permiso de prueba.pdf");assert.doesNotMatch(JSON.stringify(state),/CONTENIDO_PRIVADO|SECRETO|CLAVE|authorization_document/);
});
test("enlaces de destinos conservan empresa, formulario y selección con ruta local",()=>{
  const id=randomUUID(),saved=randomUUID();for(const empresa of ["rerchar","e_y_j"] as const){const url=new URL(destinationHref({empresa},"update",id,saved),"https://local.invalid");assert.equal(url.pathname,"/destinos");assert.equal(url.searchParams.get("empresa"),empresa);assert.equal(url.searchParams.get("destino"),id);assert.equal(url.searchParams.get("guardado"),saved);assert.equal(url.hash,"#destino-"+id);}
  assert.deepEqual(destinationContext({empresa:"https://example.invalid"}),{});assert.equal(destinationHref({},"create"),"/destinos?formulario=create#crear-destino");assert.ok(!destinationHref({},"update","../../../otra-ruta").includes("otra-ruta"));
});
test("estado visible distingue autorización vigente, vencida, pendiente y suspensión",()=>{
  assert.deepEqual(destinationAvailability({status:"habilitado",authorization_valid_until:"2026-11-19"},"2026-11-19"),{label:"Habilitado",tone:"ready"});assert.equal(destinationAvailability({status:"habilitado",authorization_valid_until:new Date("2026-11-18T00:00:00Z")},"2026-11-19").tone,"expired");assert.equal(destinationAvailability({status:"suspendido",authorization_valid_until:"2020-01-01"},"2026-11-19").tone,"suspended");assert.equal(destinationAvailability({status:"pendiente",authorization_valid_until:null},"2026-11-19").tone,"pending");assert.equal(destinationAvailability({status:"habilitado",authorization_valid_until:null},"2026-11-19").label,"Vigencia pendiente");assert.equal(destinationDay(new Date("2099-12-31T00:00:00Z")),"2099-12-31");assert.equal(destinationDay(null),"");
});
