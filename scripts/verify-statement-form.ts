import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
const work=await mkdtemp(join(tmpdir(),"rerchar-statement-http-"));
Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
const {db,transaction}=await import("../lib/db");
let server:ChildProcess|undefined,logs="";
const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
function formFrom(body:string){
  const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes("statement-creation-form"));assert.ok(form);
  const data=new FormData();
  for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||""));}
  return {form,data};
}
function inputValue(form:string,name:string){const input=(form.match(/<input\b[^>]*>/g)||[]).find(x=>x.includes(`name="${name}"`));assert.ok(input,name);return decode(input.match(/\bvalue="([^"]*)"/)?.[1]||"");}
function selected(form:string,name:string){const select=form.match(new RegExp('<select[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))?.[1];assert.ok(select,name);return select.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1]||"";}

try{
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(join("db",name),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente revisión EDP') RETURNING id");
  const actors=await db.query<{id:string;role:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin'),('ops@example.invalid','Operaciones','h','operaciones') RETURNING id,role");
  const tokens:Record<string,string>={};
  for(const actor of actors){const token=randomBytes(32).toString("hex");tokens[actor.role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);}
  await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();
  delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
  const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));
  const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
  const base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
  server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
  const request=(path:string,role="admin",options:RequestInit={})=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
  const html=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);return (await r.text()).replace(/<!--[\s\S]*?-->/g,"");};
  const cycle=randomUUID(),path=`/estados-pago/nuevo?cliente=${client.id}&periodo=2026-11-12&formato=arriendo&ciclo=${cycle}`;
  const post=(data:FormData,role="admin")=>request(path,role,{method:"POST",body:data,headers:{Origin:base}});
  await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
  const original=formFrom(await html(path));
  assert.equal(selected(original.form,"client_id"),client.id);assert.equal(selected(original.form,"statement_type"),"arriendo");
  const key=original.data.get("submission_key");
  const values={client_id:client.id,statement_type:"arriendo",number:"HTTP-01",period_on:"2026-11-12",client_name:"Razón social conservada",client_tax_id:"12.345.678-9",client_address:"Dirección conservada 123",client_contact:"contacto@example.invalid",issuer_contact:"emisor@example.invalid",contract_manager:"Administrador conservado",contract_reference:"CONTRATO-HTTP",notes:"Observaciones <revisar> & confirmar",cycle_id:cycle};
  for(const [k,v] of Object.entries(values))original.data.set(k,v);
  let response=await post(original.data);assert.equal(response.status,200);
  let body=(await response.text()).replace(/<!--[\s\S]*?-->/g,"");
  assert.match(body,/No se pudo crear el estado de pago/);assert.match(body,/El período del calendario no existe/);
  const failed=formFrom(body);
  assert.equal(inputValue(failed.form,"submission_key"),key);
  for(const [name,value] of Object.entries(values)){
    if(name==="client_id"||name==="statement_type")assert.equal(selected(failed.form,name),value);
    else if(name==="notes")assert.match(failed.form,/Observaciones &lt;revisar&gt; &amp; confirmar/);
    else assert.equal(inputValue(failed.form,name),value,name);
  }
  assert.ok(!(await html("/estados-pago")).includes("HTTP-01"),"el fallo no crea un borrador");
  for(const [k,v] of Object.entries(values))failed.data.set(k,v);failed.data.set("cycle_id","");
  response=await post(failed.data);assert.equal(response.status,303);const target=response.headers.get("location");assert.match(target||"",/^\/estados-pago\/[0-9a-f-]+\?ok=1$/);
  const repeat=await post(failed.data);assert.equal(repeat.status,303);assert.equal(repeat.headers.get("location"),target,"el reintento conserva la clave y no duplica el EDP");
  const duplicate=formFrom(await html("/estados-pago/nuevo"));for(const [k,v] of Object.entries(values))duplicate.data.set(k,v);duplicate.data.set("cycle_id","");
  response=await post(duplicate.data);assert.equal(response.status,200);body=await response.text();assert.match(body,/ya existe para este cliente y período/);assert.equal(inputValue(formFrom(body).form,"number"),values.number);
  const denied=await post(duplicate.data,"operaciones");assert.equal(denied.status,200);assert.match(await denied.text(),/Sólo administración puede modificar estados de pago/);
  assert.equal((await post(duplicate.data,"")).status,303);
  for(const company of ["rerchar","e_y_j"]){
    const finance=await html(`/finanzas?empresa=${company}`);assert.match(finance,new RegExp(`href="/cobranzas\\?empresa=${company}"`));
    const contract=(finance.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes('name="code"'));assert.ok(contract);
    assert.equal(selected(contract,"operating_company"),company);assert.match(contract,/<select[^>]*name="site_id"[^>]*disabled/);
  }
  const result={ok:true,errorKeepsAllFields:true,errorCreatesNoDraft:true,retryCreatesOnce:true,duplicateKeepsFields:true,roleRestriction:true,companyLinks:true,productionMutations:false,evidenceDirectory:work};
  await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
  if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}
  await writeFile(join(work,"server.log"),logs);
}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
