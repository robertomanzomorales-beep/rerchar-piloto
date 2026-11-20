import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-purchase-form-http-"));
  console.log(JSON.stringify({phase:"start",evidenceDirectory:work}));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");
  let server:ChildProcess|undefined,logs="";
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\r\n?/g,"\n");
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  function formFrom(body:string){
    const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes('name="title"')&&x.includes('name="submission_key"'));
    assert.ok(form,"formulario de creación de compra");const data=new FormData();
    for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||""));}
    return {form,data};
  }
  function field(form:string,name:string){
    const select=form.match(new RegExp('<select[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))?.[1];
    if(select!==undefined)return decode(select.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1]||"");
    const textarea=form.match(new RegExp('<textarea[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</textarea>'))?.[1];
    if(textarea!==undefined)return decode(textarea);
    const input=(form.match(/<input\b[^>]*>/g)||[]).find(x=>x.includes(`name="${name}"`));assert.ok(input,name);
    return decode(input.match(/\bvalue="([^"]*)"/)?.[1]||"");
  }
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(statement);});
    }
    const actors=await db.query<{id:string;role:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin'),('ops@example.invalid','Operaciones','h','operaciones'),('driver@example.invalid','Conductor','h','conductor') RETURNING id,role");
    const tokens:Record<string,string>={};
    for(const actor of actors){const token=randomBytes(32).toString("hex");tokens[actor.role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);}
    const {createStockItem}=await import("../lib/supply");
    const admin={id:actors.find(a=>a.role==="admin")!.id,role:"admin" as const,name:"Admin",email:"admin@example.invalid",client_id:null};
    const item=await createStockItem(admin,{code:"FORM-ART",name:"Artículo de revisión de formulario",unit:"kg",minimum_qty:"0"});
    await db.query("INSERT INTO purchase_requests(submission_key,title,category,priority,requested_by) SELECT gen_random_uuid(),'Compra de contexto '||n,'insumos','normal',$1 FROM generate_series(1,105) n",[admin.id]);
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();
    delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
    const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
    server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,role="admin",options:RequestInit={})=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,role);assert.equal(r.status,200);return clean(await r.text());};
    const path="/compras?estado=solicitada&pagina=2";
    const post=(data:FormData,role="admin")=>request(path,role,{method:"POST",body:data,headers:{Origin:base}});
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
    for(const role of ["admin","operaciones"]){
      const original=formFrom(await html(path,role)),key=field(original.form,"submission_key");
      const values={title:"   ",category:"seguridad",priority:"critica",item_id:item,quantity:"2.750",notes:"Antecedentes conservados <revisar> & confirmar\nSegunda línea"};
      const fill=(data:FormData,fields:Record<string,string>)=>{for(const [name,value]of Object.entries(fields))data.set(name,value);};
      fill(original.data,values);original.data.set("password","NO_SERIALIZAR_CLAVE");original.data.set("attachment",new File(["NO_SERIALIZAR_ARCHIVO"],"privado.txt"));
      let response=await post(original.data,role);
      await writeFile(join(work,`invalid-${role}.json`),JSON.stringify({status:response.status,location:response.headers.get("location")},null,2));
      assert.equal(response.status,200,"la validación debe conservar el formulario en lugar de redirigir vacío");
      let body=clean(await response.text());assert.match(body,/No se pudo crear la solicitud/);assert.match(body,/Página 2 de 2/);
      let failed=formFrom(body);assert.equal(field(failed.form,"submission_key"),key);
      for(const [name,value]of Object.entries(values))assert.equal(field(failed.form,name),value,name);
      assert.doesNotMatch(body,/NO_SERIALIZAR_CLAVE|NO_SERIALIZAR_ARCHIVO/);
      const unavailable=randomUUID(),validTitle=`Requerimiento conservado ${role}`;
      fill(failed.data,{...values,title:validTitle,item_id:unavailable});
      response=await post(failed.data,role);assert.equal(response.status,200);body=clean(await response.text());
      assert.match(body,/Seleccione un artículo activo/);assert.match(body,/Artículo no disponible/);failed=formFrom(body);
      assert.equal(field(failed.form,"title"),validTitle);assert.equal(field(failed.form,"item_id"),unavailable);assert.equal(field(failed.form,"submission_key"),key);
      assert.ok(!(await html("/compras?estado=solicitada",role)).includes(validTitle),"un error no crea la compra");
      fill(failed.data,{...values,title:validTitle,item_id:item});
      response=await post(failed.data,role);assert.equal(response.status,303);const target=response.headers.get("location")!;assert.match(target,/^\/compras\/[0-9a-f-]+\?ok=1$/);
      const repeated=await post(failed.data,role);assert.equal(repeated.status,303);assert.equal(repeated.headers.get("location"),target,"el reintento no duplica la compra");
      const detail=await html(target,role);assert.ok(detail.includes(validTitle));assert.match(detail,/2,75/);assert.match(detail,/Antecedentes conservados &lt;revisar&gt; &amp; confirmar/);
      outcomes.push({role,allFieldsRetained:true,listContextRetained:true,businessErrorRetained:true,noCreationOnError:true,retrySamePurchase:true,privateExtrasExcluded:true});console.log(JSON.stringify({phase:"workflow",role,ok:true}));
    }
    const denied=await request(path,"conductor"),deniedBody=await denied.text();
    assert.ok(denied.status===307||denied.status===200&&deniedBody.includes("NEXT_REDIRECT"));assert.ok(!deniedBody.includes('class="form-stack purchase-creation-form"'));
    const anonymous=await post(formFrom(await html(path)).data,"");assert.equal(anonymous.status,303);assert.match(anonymous.headers.get("location")||"",/^\/ingresar/);
    const result={ok:true,outcomes,driverDenied:true,anonymousDenied:true,productionMutations:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{
    if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}
    await writeFile(join(work,"server.log"),logs);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
