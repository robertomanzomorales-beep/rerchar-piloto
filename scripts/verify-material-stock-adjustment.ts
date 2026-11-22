import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-stock-adjustment-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  console.log(JSON.stringify({phase:"start",evidenceDirectory:work}));
  const {db,transaction}=await import("../lib/db");let server:ChildProcess|undefined,logs="";
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\r\n?/g,"\n");
  function formFrom(body:string){
    const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(f=>f.includes('data-material-stock-form="adjustment"'));assert.ok(form,"formulario de ajuste de material");const data=new FormData();
    for(const tag of form.match(/<input\b[^>]*>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(tag.match(/\bvalue="([^"]*)"/)?.[1]??""));}
    for(const tag of form.match(/<select\b[\s\S]*?<\/select>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name){const options=tag.match(/<option\b[^>]*>/g)||[],selected=options.find(x=>x.includes('selected=""'))??options[0];data.set(name,decode(selected?.match(/\bvalue="([^"]*)"/)?.[1]??""));}}
    for(const tag of form.match(/<textarea\b[\s\S]*?<\/textarea>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(name,decode(tag.slice(tag.indexOf(">")+1,tag.indexOf("</textarea>"))));}
    return {form,data,target:decode(form.match(/\baction="([^"]*)"/)?.[1]??"")};
  }
  const fill=(data:FormData,values:Record<string,string>)=>{for(const [key,value]of Object.entries(values))data.set(key,value);};
  function retained(body:string,values:Record<string,string>){const form=formFrom(body);for(const [key,value]of Object.entries(values))assert.equal(form.data.get(key),value,key);assert.match(body,/Los datos ingresados se conservan/);assert.match(body,/<details\b[^>]*id="ajuste-material"[^>]*open=""/);assert.doesNotMatch(body,/NO_DEVOLVER_PASSWORD|NO_DEVOLVER_ARCHIVO/);return form;}
  async function stop(){if(!server?.pid)return;const running=server;server=undefined;await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Next no terminó")),10000);running.once("close",()=>{clearTimeout(timer);resolve();});try{process.kill(-running.pid!,"SIGTERM");}catch{clearTimeout(timer);resolve();}});}
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente sintético stock') RETURNING id");
    const tokens:Record<string,string>={},actors:Record<string,{id:string}>={};
    for(const role of ["admin","operaciones","cliente","conductor"]){const [actor]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id",[role+"@stock.example.invalid","Revisión "+role,role,client.id]);actors[role]=actor;const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);}
    const [material,other,unavailable]=await db.query<{id:string}>("INSERT INTO material_catalog(name,active) VALUES('Material HTTP de saldo',true),('Material HTTP sin movimientos',true),('Material HTTP inactivo',false) RETURNING id");
    const stock=await import("../lib/material-stock"),actor={...actors.admin,role:"admin" as const,name:"Admin HTTP",email:"admin@stock.example.invalid",client_id:null};
    await stock.recordMaterialStockAdjustment(actor,{material_id:material.id,kind:"saldo_inicial",quantity_kg:"10.50",occurred_on:"2026-11-01",reference:"ACTA-SEED",reason:"Conteo físico sintético confirmado"});
    await db.query("INSERT INTO material_stock_movements(material_id,kind,delta_kg,occurred_on,reference,reason,recorded_by) SELECT $1,'ajuste_entrada',0.01,'2026-11-01','ACTA-SEED-'||n,'Movimiento sintético de contexto',$2 FROM generate_series(1,101) n",[material.id,actor.id]);
    await db.query("UPDATE material_stock_balances SET quantity_kg=11.51 WHERE material_id=$1",[material.id]);
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",c=>{clearTimeout(timer);j(new Error("Next terminó "+c));});});
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(new URL(path,base),{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(120000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,{},role);assert.equal(r.status,200);const body=clean(await r.text());assert.doesNotMatch(body,/NEXT_HTTP_ERROR_FALLBACK;500/);return body;};
    const post=(form:ReturnType<typeof formFrom>,role="admin")=>request(form.target,{method:"POST",body:form.data,headers:{Origin:base}},role);
    const path=`/materiales-stock?material=${material.id}&pagina=2`;
    const values={material_id:material.id,kind:"ajuste_salida",quantity_kg:"100",occurred_on:"2026-11-20",reference:"ACTA <revisar> & confirmar",reason:"Diferencia física revisada\ncon respaldo <control> & conteo"};
    let form=formFrom(await html(path));fill(form.data,values);form.data.set("password","NO_DEVOLVER_PASSWORD");form.data.set("file",new File(["NO_DEVOLVER_ARCHIVO"],"privado.txt"));
    let r=await post(form);assert.equal(r.status,200);let body=clean(await r.text());assert.match(body,/Stock insuficiente/);assert.match(body,/Página 2 de 2/);form=retained(body,values);
    const errorTarget=new URL(form.target,base);assert.equal(errorTarget.searchParams.get("material"),material.id);assert.equal(errorTarget.searchParams.get("pagina"),"2");assert.equal(errorTarget.hash,"#ajuste-material");
    form.data.set("quantity_kg","0.50");r=await post(form);assert.equal(r.status,303);let target=new URL(r.headers.get("location")!,base);assert.equal(target.pathname,"/materiales-stock");assert.equal(target.searchParams.get("material"),material.id);assert.equal(target.searchParams.get("pagina"),"1");assert.equal(target.hash,"#movimientos-material");body=await html(target.pathname+target.search);assert.match(body,/11,01 kg/);form=formFrom(body);for(const key of ["quantity_kg","reference","reason"])assert.equal(form.data.get(key),"",key+" se limpia después del guardado");
    for(const example of [{values:{...values,kind:"saldo_inicial",quantity_kg:"1"},error:/ya tiene movimientos/},{values:{...values,quantity_kg:"1.001"},error:/Revise material/},{values:{...values,material_id:unavailable.id,quantity_kg:"1"},error:/ya no está activo/}]){
      form=formFrom(await html(path));fill(form.data,example.values);r=await post(form);assert.equal(r.status,200);body=clean(await r.text());assert.match(body,example.error);form=retained(body,example.values);assert.match(body,/11,01 kg/);
      if(example.values.material_id===unavailable.id){assert.match(form.form,/Selección anterior no disponible/);assert.match(form.form,/<button[^>]*disabled=""/);}
    }
    form=formFrom(await html(`/materiales-stock?material=${other.id}`));const initial={material_id:other.id,kind:"saldo_inicial",quantity_kg:"3.25",occurred_on:"2026-11-20",reference:"ACTA-NUEVO",reason:"Saldo físico inicial con respaldo sintético"};fill(form.data,initial);r=await post(form);assert.equal(r.status,303);target=new URL(r.headers.get("location")!,base);assert.equal(target.searchParams.get("material"),other.id);assert.match(await html(target.pathname+target.search),/3,25 kg/);r=await post(form);assert.equal(r.status,200);retained(clean(await r.text()),initial);
    form=formFrom(await html(path));const reference=[...form.data.keys()].find(key=>key.startsWith("$ACTION_REF_"));assert.ok(reference);const metadata=JSON.parse(String(form.data.get(`$ACTION_${reference.slice("$ACTION_REF_".length)}:0`)));assert.equal(typeof metadata.id,"string");
    const codec=createRequire(import.meta.url)("next/dist/compiled/react-server-dom-webpack/client.node") as {encodeReply:(args:unknown[])=>Promise<FormData|string>};
    const rpcData=new FormData();fill(rpcData,{...values,stock_material:material.id,stock_pagina:"2",quantity_kg:"1000"});
    r=await request(path,{method:"POST",body:await codec.encodeReply([{error:"",values:{}},rpcData]),headers:{Origin:base,Accept:"text/x-component","Next-Action":metadata.id}});assert.equal(r.status,200);assert.match(r.headers.get("content-type")??"",/text\/x-component/);assert.equal(r.headers.get("x-action-redirect"),null);const rejectedRpc=await r.text();assert.match(rejectedRpc,/Stock insuficiente/);assert.match(rejectedRpc,/1000/);assert.match(rejectedRpc,/ACTA/);
    fill(rpcData,{kind:"ajuste_entrada",quantity_kg:"0.25",reference:"ACTA-RPC",reason:"Ajuste sintético por la acción del cliente"});r=await request(path,{method:"POST",body:await codec.encodeReply([{error:"",values:{}},rpcData]),headers:{Origin:base,Accept:"text/x-component","Next-Action":metadata.id}});assert.ok(r.status===200||r.status===303);const rpcTarget=r.headers.get("x-action-redirect")?.split(";")[0]??r.headers.get("location");assert.ok(rpcTarget);target=new URL(rpcTarget,base);assert.equal(target.pathname,"/materiales-stock");assert.equal(target.searchParams.get("material"),material.id);assert.equal(target.hash,"#movimientos-material");await r.text();assert.match(await html(target.pathname+target.search),/11,26 kg/);
    const deniedForm=formFrom(await html(path));fill(deniedForm.data,{...values,kind:"ajuste_entrada",quantity_kg:"2",reference:"ACTA-NO-AUTORIZADA"});
    assert.ok(!(await html(path,"operaciones")).includes('data-material-stock-form="adjustment"'));
    for(const role of ["operaciones","cliente","conductor"]){r=await post(deniedForm,role);body=await r.text();assert.ok(r.status===303||r.status===200&&(body.includes("NEXT_REDIRECT")||body.includes("Stock de materiales")));if(role!=="operaciones"){r=await request(path,{},role);body=await r.text();assert.ok(r.status===303||body.includes("NEXT_REDIRECT"));assert.doesNotMatch(body,/data-stock-movement/);}}
    r=await post(deniedForm,"");assert.equal(r.status,303);assert.match(r.headers.get("location")??"",/^\/ingresar/);
    await stop();
    const {PGlite}=await import("@electric-sql/pglite"),finalDb=new PGlite(join(work,"db"));
    let finalBalances;
    try{
      finalBalances=(await finalDb.query<{material_id:string;balance:string;ledger:string;movements:number}>("SELECT b.material_id,b.quantity_kg::text balance,sum(m.delta_kg)::text ledger,count(m.id)::int movements FROM material_stock_balances b JOIN material_stock_movements m ON m.material_id=b.material_id WHERE b.material_id=ANY($1::uuid[]) GROUP BY b.material_id,b.quantity_kg ORDER BY b.material_id",[[material.id,other.id]])).rows;
      const primary=finalBalances.find(x=>x.material_id===material.id)!,secondary=finalBalances.find(x=>x.material_id===other.id)!;
      assert.equal(primary.balance,"11.26");assert.equal(primary.ledger,"11.26");assert.equal(primary.movements,104);assert.equal(secondary.balance,"3.25");assert.equal(secondary.ledger,"3.25");assert.equal(secondary.movements,1);
      assert.equal((await finalDb.query<{total:number}>("SELECT count(*)::int total FROM material_stock_movements WHERE reference='ACTA-NO-AUTORIZADA' OR material_id=$1",[unavailable.id])).rows[0].total,0);
    }finally{await finalDb.close();}
    const result={ok:true,rejectedFieldsRetained:true,filterAndPageRetained:true,progressiveDetailsOpen:true,correctionSaved:true,initialBalanceRepeatRejected:true,precisionRejected:true,unavailableMaterialRetained:true,nativeAndRpcVerified:true,rolesRestricted:true,finalBalances,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{await stop();await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
