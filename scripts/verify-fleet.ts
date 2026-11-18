import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {db,transaction} from "../lib/db";
import * as maintenance from "../lib/continuity";
import type {Actor} from "../lib/auth";

async function main(){
  const root=process.cwd(),work=await mkdtemp(join(tmpdir(),"rerchar-fleet-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  for(const name of (await readdir(root+"/db")).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    const sql=await readFile(root+"/db/"+name,"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente revisión HTTP de flota') RETURNING id");
  const actors:Record<string,Actor>={},tokens:Record<string,string>={};
  for(const role of ["admin","operaciones","conductor","cliente"] as const){
    const [user]=await db.query<Actor>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'hash',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id,name,email,role,client_id",[role+"@fleet.example.test","Revisión "+role,role,client.id]);
    actors[role]=user;const token=randomBytes(32).toString("hex");tokens[role]=token;
    await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
  }
  const [asset,workshop]=await db.query<{id:string}>(`INSERT INTO assets(code,label,kind,reading_unit,available) VALUES
    ('HTTP-1','Camión con averías de revisión HTTP','camion','km',false),('HTTP-2','Equipo en mantenimiento HTTP','equipo','horas',true) RETURNING id`);
  const rows=await db.query<{id:string;description:string}>(`INSERT INTO fleet_incidents(asset_id,description,severity,reported_by,reported_at)
    SELECT $1,'Avería HTTP '||n,CASE WHEN n=123 THEN 'critica' ELSE 'baja' END,$2,now()-n*interval '1 day'
    FROM generate_series(1,123) n RETURNING id,description`,[asset.id,actors.admin.id]);
  const critical=rows.find(row=>row.description==="Avería HTTP 123")!;
  const orderInput={asset_id:asset.id,incident_id:critical.id,plan_id:"",kind:"correctiva",title:"Reparación HTTP",description:"",scheduled_for:"",blocks_asset:true};
  const order=await maintenance.createWorkOrder(actors.admin,orderInput);
  await maintenance.startWorkOrder(actors.admin,order);
  const independent=await maintenance.createWorkOrder(actors.admin,{...orderInput,asset_id:workshop.id,incident_id:""});
  await maintenance.startWorkOrder(actors.admin,independent);
  await (globalThis as any).__rercharDb.local.close();delete (globalThis as any).__rercharDb.local;
  const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));
  const address=portServer.address();assert.ok(address&&typeof address!=="string");
  const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
  const base="http://127.0.0.1:"+port;
  const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{cwd:root,env:{...process.env},detached:true,stdio:["ignore","pipe","pipe"]});
  let logs="";server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
  const request=(path:string,role="admin",options:RequestInit={})=>fetch(base+path,{redirect:"manual",...options,headers:{...options.headers,...(tokens[role]?{Cookie:"rerchar_session="+tokens[role]}:{})},signal:AbortSignal.timeout(60000)});
  const html=async(path:string,role="admin")=>{const r=await request(path,role);assert.equal(r.status,200);const body=(await r.text()).replace(/<!--[\s\S]*?-->/g,"");assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
  const formData=(body:string,contains:string)=>{const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(form=>form.includes(contains));assert.ok(form,contains);const data=new FormData();for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(name,input.match(/\bvalue="([^"]*)"/)?.[1]??"");}return data;};
  const post=(data:FormData,role="admin")=>request("/flota?pagina=2",role,{method:"POST",body:data,headers:{Origin:base}});
  const total=(body:string)=>Number(body.match(/<strong>(\d+)<\/strong><span>Averías abiertas<\/span>/)?.[1]);
  try{
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Inicio fallido: "+logs.slice(-1000))),25000);server.stdout.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);resolve();}});server.once("exit",code=>{clearTimeout(timer);reject(new Error("Next terminó "+code));});});
    let body=await html("/flota");assert.equal(total(body),123);assert.match(body,/En mantenimiento/);assert.ok(!body.includes("0 avería"));
    const articles=body.match(/<article\b[\s\S]*?<\/article>/g)||[];
    const first=articles[0];assert.ok(first);assert.match(first,/Avería HTTP 123/);assert.match(first,new RegExp('href="/mantenimiento/'+order+'"'));assert.ok(!first.includes('name="resolution"'));
    body=await html("/flota?pagina=2");assert.match(body,/Página 2 de 3/);assert.match(body,/pagina=3#averias/);
    let data=formData(body,'name="resolution"');data.set("resolution","no");let r=await post(data);assert.equal(r.status,303);
    let location=r.headers.get("location")!;assert.match(location,/^\/flota\?pagina=2&error=/);assert.match(await html(location),/Revise los campos obligatorios/);
    data=formData(await html("/flota?pagina=2"),'name="resolution"');data.set("resolution","Verificación local de reparación conforme");r=await post(data);assert.equal(r.status,303);assert.equal(r.headers.get("location"),"/flota?pagina=2&ok=1");assert.equal(total(await html("/flota")),122);
    data=formData(await html("/flota?pagina=2"),'name="description"');data.set("asset_id",asset.id);data.set("description","Nueva avería ficticia por HTTP");data.set("severity","alta");data.set("observed_on","");
    r=await post(data);assert.equal(r.status,303);assert.equal(r.headers.get("location"),"/flota?pagina=2&ok=1");assert.equal(total(await html("/flota")),123);
    const tampered=formData(await html("/flota?pagina=2"),'name="resolution"');tampered.set("resolution","No se debe guardar sin permiso");await post(tampered,"conductor");assert.equal(total(await html("/flota")),123);
    assert.equal(total(await html("/flota?pagina=3","operaciones")),123);
    assert.match(await html("/flota?pagina=999999"),/Página 3 de 3/);
    for(const role of ["conductor","cliente",""]){r=await request("/flota",role);if(r.status===200){const denied=await r.text();assert.match(denied,/NEXT_REDIRECT|http-equiv="refresh"/);assert.ok(!denied.includes("Avería HTTP"));assert.ok(!denied.includes('<h1>Flota y averías</h1>'));}else assert.ok(r.status>=300&&r.status<400);}
    console.log(JSON.stringify({ok:true,pages:3,incidents:123,criticalFirst:true,activeOrderLink:true,noBlockedResolveForm:true,maintenanceWithoutIncident:true,actionReturnsKeepPage:true,permissionChecks:true,productionMutations:false,evidenceDirectory:work}));
  }finally{try{process.kill(-server.pid!,"SIGTERM");}catch{}await writeFile(work+"/server.log",logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
