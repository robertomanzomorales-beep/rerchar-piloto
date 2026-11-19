import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";
import {userContext,userFormContext,userFormFailure,userHref,userId} from "../lib/user-form-state";

test("formularios de usuarios conservan identificación y perfil, nunca contraseñas",()=>{
  const form=new FormData();for(const [key,value]of Object.entries({name:"Persona de prueba",email:"persona@example.invalid",role:"cliente",client_id:randomUUID(),id:randomUUID(),password:"NuncaDevolver_2026!",password_hash:"privado",token:"privado"}))form.set(key,value);
  assert.deepEqual(Object.keys(userFormFailure("create",form,"Error").values),["name","email","role","client_id"]);
  assert.deepEqual(Object.keys(userFormFailure("role",form,"Error").values),["id","role","client_id"]);
  for(const kind of ["create","role","password","active"] as const){const state=userFormFailure(kind,form,"Error");assert.doesNotMatch(JSON.stringify(state),/NuncaDevolver|password|privado|token/);assert.equal(state.error,"Error");}
});
test("contexto de usuarios admite sólo filtros válidos y enlaces locales",()=>{
  const context=userContext({buscar:"  Empresa %_  ",perfil:"cliente",estado:"activas",pagina:"3",redirect:"https://example.invalid",password:"privada"});
  assert.deepEqual(context,{buscar:"Empresa %_",perfil:"cliente",estado:"activas",pagina:3});
  const id=randomUUID(),saved=randomUUID(),href=userHref(context,{kind:"role",id,ok:true,saved});
  const parsed=new URL(href,"https://local.invalid");assert.equal(parsed.pathname,"/usuarios");assert.equal(parsed.searchParams.get("buscar"),"Empresa %_");assert.equal(parsed.hash,"#cuenta-"+id);assert.equal(parsed.searchParams.get("guardado"),saved);assert.doesNotMatch(href,/privada|redirect/);
  assert.deepEqual(userContext({perfil:"intruso",estado:"inventado",pagina:Infinity,buscar:["no"]}),{buscar:"",perfil:"",estado:"",pagina:1});assert.equal(userId("/salir"),"");
  const form=new FormData();form.set("buscar","  Buscar  ");form.set("pagina","4");assert.equal(userFormContext(form).pagina,4);assert.equal(userFormContext(form).buscar,"Buscar");
});
test("directorio completo de usuarios, filtros y administración vigente",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),users=await import("../lib/users");
  const sql=await readFile(resolve(process.cwd(),"db/001_piloto.sql"),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Empresa literal %_') RETURNING id");
  const [owner,other,driver,portal]=await db.query<{id:string;name:string;email:string;role:Actor["role"];client_id:string|null}>(`INSERT INTO users(name,email,password_hash,role,client_id) VALUES
    ('ZZZ Administración','owner@review.example.invalid','hash-privado','admin',NULL),('AAA Administración','second@review.example.invalid','hash-privado','admin',NULL),
    ('Conductor','driver@review.example.invalid','hash-privado','conductor',NULL),('Portal','portal@review.example.invalid','hash-privado','cliente',$1) RETURNING id,name,email,role,client_id`,[client.id]);
  await db.query(`INSERT INTO users(name,email,password_hash,role,active) SELECT 'Persona '||lpad(n::text,4,'0'),'persona'||n||'@review.example.invalid','hash-privado','operaciones',n<=400 FROM generate_series(1,417)n`);
  await db.query("UPDATE users SET locked_until=now()+interval '15 minutes',failed_attempts=5 WHERE email='persona1@review.example.invalid'");
  const actor:Actor={...owner},context=userContext({});
  await t.test("421 cuentas en cinco páginas sin omitir ni repetir y sin hashes",async()=>{
    const all=await users.listUsers(actor);assert.equal(all.length,421);assert.doesNotMatch(JSON.stringify(all),/password_hash|hash-privado/);
    const seen=new Set<string>();for(let page=1;page<=5;page++){const board=await users.listUserBoard(actor,{...context,pagina:page});assert.equal(board.total,421);assert.equal(board.pages,5);assert.equal(board.rows.length,page===5?21:100);for(const row of board.rows){assert.ok(!seen.has(row.id));seen.add(row.id);}}assert.equal(seen.size,421);
  });
  await t.test("resumen y administradores globales se conservan al filtrar",async()=>{
    const board=await users.listUserBoard(actor,userContext({perfil:"operaciones",estado:"suspendidas"}));assert.equal(board.total,17);assert.deepEqual(board.stats,{total:421,active:404,suspended:17,locked:1,active_admins:2});assert.ok(board.rows.every(row=>!row.active&&row.role==="operaciones"));
    assert.equal((await users.listUserBoard(actor,userContext({estado:"bloqueadas"}))).total,1);
  });
  await t.test("búsqueda literal por nombre, correo y empresa sin comodines accidentales",async()=>{
    assert.equal((await users.listUserBoard(actor,userContext({buscar:"%_"}))).total,1);
    assert.equal((await users.listUserBoard(actor,userContext({buscar:"PORTAL@review.example.invalid"}))).rows[0].id,portal.id);
    assert.equal((await users.listUserBoard(actor,userContext({buscar:"ZZZ"}))).rows[0].id,owner.id);
    assert.equal((await users.listUserBoard(actor,userContext({buscar:"inexistente"}))).total,0);
  });
  await t.test("cuenta seleccionada permanece accesible fuera de filtros o página",async()=>{
    const board=await users.listUserBoard(actor,userContext({estado:"suspendidas",pagina:999}),portal.id);assert.equal(board.page,1);assert.equal(board.selected?.id,portal.id);assert.equal(board.rows.length,17);
    const already=await users.listUserBoard(actor,userContext({perfil:"cliente"}),portal.id);assert.equal(already.selected,null);
    assert.equal((await users.listUserBoard(actor,userContext({perfil:"cliente"}),portal.id.toUpperCase())).selected,null);
    assert.equal((await users.listUserBoard(actor,context,"id-inválido")).selected,null);
  });
  await t.test("lectura administrativa exige rol y estado actuales",async()=>{
    await assert.rejects(()=>users.listUserBoard({...driver},context),users.UsersError);
    await db.query("UPDATE users SET active=false WHERE id=$1",[other.id]);await assert.rejects(()=>users.listUsers({...other}),users.UsersError);
    await db.query("UPDATE users SET role='operaciones' WHERE id=$1",[other.id]);await assert.rejects(()=>users.listUserBoard({...other},context),users.UsersError);
    assert.equal((await users.listUserBoard(actor,userContext({perfil:"cliente"}))).stats.active_admins,1);
  });
});
