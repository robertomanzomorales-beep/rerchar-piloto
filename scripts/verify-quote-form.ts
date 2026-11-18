import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
const work=await mkdtemp(join(tmpdir(),"rerchar-quote-form-http-"));
Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
const {db,transaction}=await import("../lib/db");
let server:ChildProcess|undefined,logs="";
const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
function formFrom(body:string){
  const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes("quote-creation-form"));assert.ok(form);
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
  const actors=await db.query<{id:string;role:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin'),('driver@example.invalid','Conductor','h','conductor') RETURNING id,role");
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
  await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
  const outcomes=[];
  const cases=[{company:"rerchar",kind:"general",locked:true},{company:"rerchar",kind:"compra_material",locked:true},{company:"e_y_j",kind:"general",locked:true},{company:"e_y_j",kind:"general",locked:false}] as const;
  for(const [index,item] of cases.entries()){
    const path=`/cotizaciones/nueva?cliente=${client.id}${item.locked?`&empresa=${item.company}`:""}${item.kind==="compra_material"?"&tipo=compra":""}`;
    const post=(data:FormData,role="admin")=>request(path,role,{method:"POST",body:data,headers:{Origin:base}});
    const original=formFrom(await html(path));
    assert.equal(selected(original.form,"client_id"),client.id);
    const key=original.data.get("submission_key");
    const values={client_id:client.id,issuer:item.company,commercial_kind:item.kind,title:`Propuesta conservada ${index}`,
      company_intro:"Presentación editada <revisar> & confirmar",proposal_objective:"Objetivo comercial conservado para revisar.",
      notes:"Condiciones conservadas <revisar> & confirmar",issued_on:"2026-11-18",valid_until:"2026-11-17",vat_rate:"0",validity_custom:"true"};
    for(const [k,v] of Object.entries(values))original.data.set(k,v);
    let response=await post(original.data);assert.equal(response.status,200);
    let body=(await response.text()).replace(/<!--[\s\S]*?-->/g,"");
    assert.match(body,/No se pudo iniciar la cotización/);assert.match(body,/La vigencia no puede vencer antes de la fecha de emisión/);
    const failed=formFrom(body);
    assert.equal(inputValue(failed.form,"submission_key"),key);
    assert.equal(selected(failed.form,"client_id"),client.id);assert.equal(selected(failed.form,"vat_rate"),"0");
    assert.equal(item.locked?inputValue(failed.form,"issuer"):selected(failed.form,"issuer"),item.company);
    assert.equal(item.company==="e_y_j"?inputValue(failed.form,"commercial_kind"):selected(failed.form,"commercial_kind"),item.kind);
    for(const name of ["title","issued_on","valid_until","validity_custom"] as const)assert.equal(inputValue(failed.form,name),values[name],name);
    assert.match(failed.form,/Presentación editada &lt;revisar&gt; &amp; confirmar/);
    assert.match(failed.form,/Objetivo comercial conservado para revisar/);
    assert.match(failed.form,/Condiciones conservadas &lt;revisar&gt; &amp; confirmar/);
    assert.ok(!(await html(`/cotizaciones?empresa=${item.company}`)).includes(values.title),"el error no crea cotización");
    for(const [k,v] of Object.entries(values))failed.data.set(k,v);failed.data.set("valid_until","2026-12-18");
    response=await post(failed.data);assert.equal(response.status,303);const target=response.headers.get("location");assert.match(target||"",/^\/cotizaciones\/[0-9a-f-]+\?ok=1$/);
    const repeat=await post(failed.data);assert.equal(repeat.status,303);assert.equal(repeat.headers.get("location"),target);
    const detail=await html(target!);assert.ok(detail.includes(values.title));
    const denied=await post(failed.data,"conductor");assert.equal(denied.status,200);assert.match(await denied.text(),/Sólo operaciones puede preparar cotizaciones/);
    assert.equal((await post(failed.data,"")).status,303);
    if(item.locked)assert.match(await html(path),new RegExp(`href="/cotizaciones\\?empresa=${item.company}"`));
    outcomes.push({...item,errorKeepsAllFields:true,retryCreatesOnce:true,permissionChecked:true});
  }
  const result={ok:true,cases:outcomes,productionMutations:false,evidenceDirectory:work};
  await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
  if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}
  await writeFile(join(work,"server.log"),logs);
}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
