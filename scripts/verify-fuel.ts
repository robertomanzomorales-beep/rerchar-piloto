import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-fuel-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");let server:ChildProcess|undefined,logs="";
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const actions=new WeakMap<FormData,string>();
  function formFrom(body:string,marker:string,source?:string){
    const forms=body.match(/<form\b[\s\S]*?<\/form>/g)||[];
    const form=forms.find(x=>x.includes(marker)&&(source===undefined||(source?x.includes(`data-source-id="${source}"`):!x.includes('data-source-id='))));assert.ok(form,marker+":"+source);const data=new FormData();
    for(const tag of form.match(/<input\b[^>]*>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name&&!(/type="checkbox"/.test(tag)&&!tag.includes('checked=""')))data.set(decode(name),decode(tag.match(/\bvalue="([^"]*)"/)?.[1]??(/type="checkbox"/.test(tag)?"on":"")));}
    for(const tag of form.match(/<select\b[\s\S]*?<\/select>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name){const options=tag.match(/<option\b[^>]*>/g)||[],selected=options.find(x=>x.includes('selected=""'))??options[0];data.set(name,decode(selected?.match(/\bvalue="([^"]*)"/)?.[1]??""));}}
    for(const tag of form.match(/<textarea\b[\s\S]*?<\/textarea>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(name,decode(tag.slice(tag.indexOf(">")+1,tag.indexOf("</textarea>"))));}
    const action=decode(form.match(/\baction="([^"]*)"/)?.[1]??"");if(action)actions.set(data,action);return {form,data};
  }
  const fill=(data:FormData,values:Record<string,string>)=>{for(const [key,value]of Object.entries(values))data.set(key,value);};
  function retained(body:string,marker:string,values:Record<string,string>,source?:string){const result=formFrom(body,marker,source);for(const [key,value]of Object.entries(values))assert.equal(result.data.get(key),value,key);assert.match(body,/Los datos ingresados se conservan/);return result;}
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente combustible HTTP') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena HTTP') RETURNING id",[client.id]);
    const tokens:Record<string,string>={},users:Record<string,{id:string}>={};
    for(const role of ["admin","operaciones","conductor","cliente"] as const){
      const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id",[role+"@fuel.example.invalid","Revisión "+role,role,client.id]);users[role]=user;
      const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
    }
    const [secondDriver,inactive]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,active) VALUES('second@fuel.example.invalid','Conductor B','h','conductor',true),('inactive@fuel.example.invalid','Conductor inactivo','h','conductor',false) RETURNING id");
    const [history,asset,other,hours,ramp,archived]=await db.query<{id:string}>(`INSERT INTO assets(code,label,kind,reading_unit,current_reading) VALUES
      ('HTTP-H','Historial de combustible','camion','km',1000),('HTTP-A','Camión A','camion','km',100),('HTTP-B','Camión B','camion','km',200),
      ('HTTP-E','Equipo con horómetro','equipo','horas',30),('HTTP-R','Rampla sin lectura','rampa','sin',0),('HTTP-Z','Camión archivado','camion','km',10) RETURNING id`);
    await db.query(`INSERT INTO fuel_entries(submission_key,asset_id,fuel_date,liters,cost_clp,reading,full_tank,supplier,receipt_number,created_by,created_at)
      SELECT gen_random_uuid(),$1,'2026-10-01',2,1000,n,false,'Estación HTTP','H-'||n,$2,'2026-10-01' FROM generate_series(1,315) n`,[history.id,users.admin.id]);
    for(const id of [hours.id,archived.id])await db.query(`INSERT INTO fuel_entries(submission_key,asset_id,fuel_date,liters,cost_clp,reading,full_tank,supplier,receipt_number,created_by)
      VALUES(gen_random_uuid(),$1,'2026-10-01',5,500,10,false,'Estación HTTP','A-HTTP',$2)`,[id,users.admin.id]);
    await db.query("UPDATE assets SET deleted_at=now() WHERE id=$1",[archived.id]);
    const services=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,priority,created_by,operating_company,status,assigned_asset_id,driver_id,created_at)
      SELECT gen_random_uuid(),$1,$2,'traslado','Material','Faena','Patio','normal',$3,CASE WHEN n%2=0 THEN 'rerchar' ELSE 'e_y_j' END,'programada',$4,$5,now()-n*interval '1 day' FROM generate_series(1,211) n RETURNING id`,[client.id,site.id,users.admin.id,asset.id,users.conductor.id]);
    const [foreign]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,priority,created_by,operating_company,status,assigned_asset_id,driver_id)
      VALUES(gen_random_uuid(),$1,$2,'traslado','Material','Faena','Patio','normal',$3,'rerchar','programada',$4,$5) RETURNING id`,[client.id,site.id,users.admin.id,other.id,secondDriver.id]);
    const stale=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,priority,created_by,operating_company,status,assigned_asset_id,driver_id)
      SELECT gen_random_uuid(),$1,$2,'traslado','Material','Faena','Patio','normal',$3,company,'programada',$4,$5 FROM unnest(ARRAY['rerchar','e_y_j']) AS company RETURNING id`,[client.id,site.id,users.admin.id,asset.id,users.conductor.id]);
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const post=(path:string,data:FormData,role="admin")=>request(actions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
    const total=(body:string)=>Number(body.match(/<strong>(\d+)<\/strong><span>Cargas registradas<\/span>/)?.[1]);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const seen:string[]=[];
    for(let page=1;page<=4;page++){const body=await html("/combustible?"+new URLSearchParams({activo:history.id,pagina:String(page),empresa:"rerchar"}));assert.equal(total(body),315);seen.push(...[...body.matchAll(/data-fuel-entry="([^"]+)"/g)].map(x=>x[1]));}
    assert.equal(seen.length,315);assert.equal(new Set(seen).size,315);
    assert.equal(total(await html("/combustible?activo="+ramp.id)),0);const archive=await html("/combustible?activo="+archived.id);assert.equal(total(archive),1);assert.match(archive,/Camión archivado · Archivado/);assert.match(await html("/combustible?activo="+hours.id),/10 horas/);
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    let currentReading=100;const outcomes=[];
    for(const [index,company]of ["rerchar","e_y_j"].entries()){
      const role=index?"operaciones":"admin",context={empresa:company,pagina:"4",activo:history.id},path="/combustible?"+new URLSearchParams(context),before=total(await html("/combustible"));
      const target=(response:Response)=>{assert.equal(response.status,303);const url=new URL(response.headers.get("location")!,base);assert.equal(url.pathname,"/combustible");assert.equal(url.hash,"#nueva-carga");for(const [key,value]of Object.entries(context))assert.equal(url.searchParams.get(key),value,key);};
      const original=formFrom(await html(path),"data-fuel-form"),values={submission_key:String(original.data.get("submission_key")),asset_id:asset.id,driver_id:users.conductor.id,service_id:foreign.id,fuel_date:today,liters:"15.125",cost_clp:"4567.89",reading:String(currentReading+10),full_tank:"on",supplier:"Estación & prueba",receipt_number:"FUEL-"+company,notes:"Observación conservada\nSegunda línea"};fill(original.data,values);
      let response=await post(path,original.data,role);assert.equal(response.status,200);let body=clean(await response.text()),failed=retained(body,"data-fuel-form",values);assert.match(failed.form,/type="checkbox"[^>]*checked=""/);assert.match(failed.form,/Selección anterior no disponible/);
      fill(failed.data,{service_id:services[210].id,reading:String(currentReading-1)});response=await post(path,failed.data,role);assert.equal(response.status,200);body=clean(await response.text());failed=retained(body,"data-fuel-form",{...values,service_id:services[210].id,reading:String(currentReading-1)});assert.match(failed.form,new RegExp('min="'+currentReading+'\\.00"'));
      failed.data.set("reading",String(currentReading+10));const recorded=failed.data;target(await post(path,recorded,role));assert.equal(total(await html("/combustible")),before+1);target(await post(path,recorded,role));assert.equal(total(await html("/combustible")),before+1,"el reintento no duplica la carga");
      recorded.set("cost_clp","4568.89");response=await post(path,recorded,role);assert.equal(response.status,200);body=clean(await response.text());failed=retained(body,"data-fuel-form",{...values,service_id:services[210].id,reading:String(currentReading+10),cost_clp:"4568.89"});assert.match(failed.form,/Preparar otra carga/);assert.equal(total(await html("/combustible")),before+1);
      failed.data.set("submission_key",randomUUID());target(await post(path,failed.data,role));assert.equal(total(await html("/combustible")),before+2);
      const staleForm=formFrom(await html(path),"data-fuel-form"),staleValues={...values,submission_key:String(staleForm.data.get("submission_key")),service_id:stale[index].id,reading:String(currentReading+20),receipt_number:"STALE-"+company};fill(staleForm.data,staleValues);
      const servicePath="/solicitudes/"+stale[index].id,cancel=formFrom(await html(servicePath),'data-service-operation="cancel"');cancel.data.set("reason","Cancelación ficticia para comprobar combustible");assert.equal((await post(servicePath,cancel.data,role)).status,303);
      response=await post(path,staleForm.data,role);assert.equal(response.status,200);failed=retained(clean(await response.text()),"data-fuel-form",staleValues);assert.equal(total(await html("/combustible")),before+2);failed.data.set("service_id","");failed.data.set("driver_id","");target(await post(path,failed.data,role));assert.equal(total(await html("/combustible")),before+3);currentReading+=20;
      const inactiveForm=formFrom(await html(path),"data-fuel-form");fill(inactiveForm.data,{...values,submission_key:String(inactiveForm.data.get("submission_key")),driver_id:inactive.id,service_id:"",reading:String(currentReading+10)});response=await post(path,inactiveForm.data,role);assert.equal(response.status,200);assert.match(await response.text(),/conductor no está habilitado/);
      outcomes.push({company,role,allFieldsRetained:true,oldServiceAvailable:true,retryWithoutDuplicate:true,conflictPreservesDraft:true,newChargeWithNewIntent:true,cancelledServiceRejected:true,inactiveDriverRejected:true,filterAndPagePreserved:true});console.log(JSON.stringify({phase:"forms",company,complete:true}));
    }
    assert.equal(total(await html("/combustible")),323);const all:string[]=[];for(let page=1;page<=4;page++)all.push(...[...(await html("/combustible?pagina="+page)).matchAll(/data-fuel-entry="([^"]+)"/g)].map(x=>x[1]));assert.equal(all.length,323);assert.equal(new Set(all).size,323);
    const clamp=await request("/combustible?"+new URLSearchParams({empresa:"e_y_j",activo:history.id,pagina:"999",ok:"1"})),clampBody=await clamp.text(),location=clamp.headers.get("location");assert.ok(location?location.includes("pagina=4")&&location.includes("ok=1"):clampBody.includes("NEXT_REDIRECT")&&clampBody.includes("pagina=4")&&clampBody.includes("ok=1"));
    for(const role of ["conductor","cliente",""]){const r=await request("/combustible",{},role),body=await r.text();assert.ok(r.status>=300&&r.status<400||body.includes("NEXT_REDIRECT"));assert.ok(!body.includes("data-fuel-form"));}
    const forbidden=formFrom(await html("/combustible"),"data-fuel-form");fill(forbidden.data,{asset_id:asset.id,driver_id:"",service_id:"",fuel_date:today,liters:"10",cost_clp:"100",reading:String(currentReading+1),supplier:"Estación",receipt_number:"NO-PERMISO",notes:""});await post("/combustible",forbidden.data,"conductor");assert.equal(total(await html("/combustible")),323);
    const result={ok:true,cases:outcomes,historyEntries:323,historyPages:4,eligibleServicesBeyond200:true,archivedHistory:true,hoursPreserved:true,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
