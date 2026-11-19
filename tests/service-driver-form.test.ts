import assert from "node:assert/strict";
import test from "node:test";
import {serviceDriverDraft,serviceDriverHref} from "../lib/service-driver-state";

test("el registro de conductor conserva identificación y nunca devuelve la contraseña",()=>{
  const form=new FormData();form.set("name","Nombre & prueba\r\nApellido");form.set("email","prueba@example.invalid");form.set("password","CLAVE-QUE-NO-SE-DEVUELVE");form.set("tax_id","12.345.678-5");form.set("company_name","Transportista de prueba");form.set("phone","123");
  const account=serviceDriverDraft("account",form),external=serviceDriverDraft("external",form);
  assert.deepEqual(account,{name:"Nombre & prueba\nApellido",email:"prueba@example.invalid"});assert.equal(external.tax_id,"12.345.678-5");assert.equal(external.company_name,"Transportista de prueba");assert.equal(external.phone,"123");assert.ok(!("email" in external));assert.ok(!JSON.stringify([account,external]).includes("CLAVE-QUE-NO-SE-DEVUELVE"));
  form.set("name","n".repeat(200));form.set("email","e".repeat(300));assert.equal(serviceDriverDraft("account",form).name?.length,120);assert.equal(serviceDriverDraft("account",form).email?.length,254);
});
test("el retorno del registro conserva los historiales y sólo transporta referencias válidas",()=>{
  const id="b1221f3b-3df2-4772-b98b-865fd0528342",created="247d96be-c4d5-40a9-a00f-5f56e104fb9f",context={pagina_historial:"11",pagina_documentos:"4",pagina_partes:"3",pagina_cargos:"2",parte:"2026-11-19"};
  for(const kind of ["account","external"] as const){const failure=new URL(serviceDriverHref(id,kind,context),"https://review.example.invalid");for(const [key,value]of Object.entries(context))assert.equal(failure.searchParams.get(key),value);assert.equal(failure.searchParams.get("formulario"),"driver_"+kind);assert.equal(failure.hash,kind==="account"?"#conductor-cuenta":"#conductor-tercero");
    const success=new URL(serviceDriverHref(id,kind,context,created),failure);assert.equal(success.searchParams.get("conductor_creado"),kind+":"+created);assert.equal(success.searchParams.get("ok"),"1");assert.equal(success.hash,"#planificacion");assert.equal(success.searchParams.get("formulario"),"driver_"+kind);
    assert.equal(new URL(serviceDriverHref(id,kind,context,"dato inválido"),failure).searchParams.has("conductor_creado"),false);
  }
  assert.equal(serviceDriverHref("../../otro","account"),"/solicitudes");
});
