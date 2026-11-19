import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-service-evidence-review-http-"));
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
  function retained(body:string,marker:string,values:Record<string,string>,source?:string){const result=formFrom(body,marker,source);for(const [key,value]of Object.entries(values))assert.equal(String(result.data.get(key)??""),value,key);assert.ok(body.includes("El tipo y las observaciones se conservan"),"Aviso de conservación del formulario");return result;}
  try{
    process.env.EVIDENCE_STORAGE="database";
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente adjuntos HTTP'),('Cliente ajeno HTTP') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena HTTP') RETURNING id",[client.id]),[asset]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES('CAM-DOC-HTTP','Camión documentos','camion') RETURNING id");
    const users:Record<string,{id:string}>={},tokens:Record<string,string>={};
    for(const role of ["admin","operaciones","conductor","cliente","ajeno"] as const){const actual=role==="ajeno"?"cliente":role,[user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id",[role+"@docs.example.invalid","Revisión "+role,actual,role==="ajeno"?other.id:client.id]);users[role]=user;const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);}
    const binary=Buffer.from([0xff,0xd8,0xff,0xd9]),fixtures:Record<string,{service:string;ids:string[];missing:string;note:string}>={};
    for(const company of ["rerchar","e_y_j"] as const){
      const [service]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,request_category,service_type,waste_type,origin,destination,status,scheduled_for,assigned_asset_id,driver_id,created_by)
        VALUES(gen_random_uuid(),$1,$2,$3,$4,CASE WHEN $3='rerchar' THEN 'retiro' ELSE 'traslado' END,'Material','Faena','Patio','programada','2020-01-01T15:00:00Z',$5,$6,$7) RETURNING id`,[client.id,site.id,company,company==="rerchar"?"compra":"servicios",asset.id,users.conductor.id,users.admin.id]);
      await db.query("INSERT INTO service_day_reports(service_id,day,asset_id,outcome,observation,recorded_by) VALUES($1,'2020-01-01',$2,'incompleto','Respaldo pendiente HTTP',$3)",[service.id,asset.id,users.admin.id]);
      await db.query(`INSERT INTO service_evidence(service_id,description,document_kind,storage_key,original_filename,mime_type,size_bytes,created_by,file_content,created_at)
        SELECT $1,'Archivo histórico HTTP '||n,'evidencia',gen_random_uuid()::text||'.jpg','Guía histórica '||n||'.jpg','image/jpeg',4,$2,$3,'2020-01-02' FROM generate_series(1,213) n`,[service.id,users.admin.id,binary]);
      const [note,missing]=await db.query<{id:string}>(`INSERT INTO service_evidence(service_id,description,document_kind,storage_key,original_filename,created_by,created_at)
        VALUES($1,'Anotación sin archivo HTTP','otro',NULL,'nombre sin archivo.jpg',$2,'2020-01-01'),($1,'Archivo previo no disponible HTTP','otro',gen_random_uuid()::text||'.jpg','faltante.jpg',$2,'2020-01-01') RETURNING id`,[service.id,users.admin.id]);
      fixtures[company]={service:service.id,note:note.id,missing:missing.id,ids:(await db.query<{id:string}>("SELECT id FROM service_evidence WHERE service_id=$1 ORDER BY created_at DESC,id DESC",[service.id])).map(r=>r.id)};assert.equal(fixtures[company].ids.length,215);
    }
    console.log(JSON.stringify({phase:"fixtures",companies:2,documentsPerCompany:215,pagesPerCompany:11}));
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(120000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,{},role);assert.equal(r.status,200,path);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const post=(path:string,data:FormData,role="admin")=>request(actions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role),form=(body:string,slot:string)=>formFrom(body,`data-evidence-form="${slot}"`),keep=(body:string,slot:string,values:Record<string,string>)=>retained(body,`data-evidence-form="${slot}"`,values);
    const ids=(body:string)=>[...body.matchAll(/data-service-evidence="([^"]+)"/g)].map(x=>x[1]),row=(body:string,id:string)=>body.match(new RegExp(`<li\\b[^>]*data-service-evidence="${id}"[\\s\\S]*?<\\/li>`))?.[0]??"";
    const jpg=(name="Guía Niño's (1).jpg")=>new File([binary],name,{type:"image/jpeg"}),pdf=()=>new File(["%PDF-1.7\n"],"respaldo.pdf",{type:"application/pdf"});
    const target=(r:Response,path:string,id?:string)=>{assert.equal(r.status,303);const url=new URL(r.headers.get("location")!,base);assert.equal(url.pathname,path);assert.equal(url.searchParams.get("pagina_documentos"),"11");assert.equal(url.searchParams.get("documento_form"),null);const saved=url.searchParams.get("archivo")!;assert.match(saved,/^[a-f0-9-]{36}$/);if(id)assert.equal(saved,id);assert.equal(url.hash,"#archivo-"+saved);return {url:url.pathname+url.search+url.hash,id:saved};};
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
    for(const company of ["rerchar","e_y_j"] as const){
      const f=fixtures[company],servicePath="/solicitudes/"+f.service,all:string[]=[];for(let page=1;page<=11;page++)all.push(...ids(await html(servicePath+"?pagina_documentos="+page)));assert.deepEqual(all,f.ids);assert.equal(new Set(all).size,215);
      const last=await html(servicePath+"?pagina_documentos=11");assert.ok(row(last,f.note).includes("Registro sin archivo adjunto"));assert.ok(!row(last,f.note).includes("/api/evidencia/"));assert.equal((await request("/api/evidencia/"+f.missing)).status,404);
      const exceeded=await request(servicePath+"?pagina_documentos=999"),exceededBody=await exceeded.text(),location=exceeded.headers.get("location")??decode(exceededBody.match(/<meta\b[^>]*http-equiv="refresh"[^>]*content="[^;]*;url=([^"]*)"/)?.[1]??"");assert.equal(new URL(location,base).searchParams.get("pagina_documentos"),"11");
      const role=company==="rerchar"?"conductor":"operaciones",slot=company==="rerchar"?"guia_traslado":"general",path=servicePath+"?pagina_documentos=11&documento_form="+slot;let current=form(await html(path,role),slot);const values={document_kind:company==="rerchar"?"guia_traslado":"foto_area",description:'Respaldo & observación "cliente"\nSegundo antecedente '+company,submission_key:String(current.data.get("submission_key"))};fill(current.data,values);current.data.set("file",company==="rerchar"?new File(["inválido"],"archivo.jpg",{type:"image/jpeg"}):pdf());let r=await post(path,current.data,role);assert.equal(r.status,200);current=keep(clean(await r.text()),slot,values);assert.ok(current.form.includes("Seleccione nuevamente el archivo"));current.data.set("file",jpg());const saved=target(await post(path,current.data,role),servicePath),savedBody=await html(saved.url);assert.ok(ids(savedBody).includes(saved.id));assert.ok(savedBody.includes("Archivo seleccionado fuera de esta página"));assert.ok(row(savedBody,saved.id).includes("Guía Niño&#x27;s (1).jpg"));target(await post(path,current.data,role),servicePath,saved.id);
      current.data.set("description","Otro respaldo diferente con la misma clave");r=await post(path,current.data,role);assert.equal(r.status,200);keep(clean(await r.text()),slot,{...values,description:"Otro respaldo diferente con la misma clave"});assert.equal(ids(await html(servicePath+"?pagina_documentos=11")).length,16);
      for(const reader of ["admin","operaciones","conductor","cliente"]){const download=await request("/api/evidencia/"+saved.id,{},reader);assert.equal(download.status,200);assert.equal(download.headers.get("Content-Type"),"image/jpeg");assert.equal(download.headers.get("Cache-Control"),"private, no-store");assert.equal(download.headers.get("X-Content-Type-Options"),"nosniff");assert.ok(download.headers.get("Content-Disposition")?.includes("Ni%C3%B1o%27s%20%281%29.jpg"));assert.deepEqual(Buffer.from(await download.arrayBuffer()),binary);}
      assert.equal((await request("/api/evidencia/"+saved.id,{},"ajeno")).status,404);assert.equal((await request("/api/evidencia/"+saved.id,{},"")).status,401);for(const invalid of ["------------------------------------","no-es-uuid"])assert.equal((await request("/api/evidencia/"+invalid)).status,404);
      const portal=await html(saved.url,"cliente");assert.ok(ids(portal).includes(saved.id));assert.ok(!portal.includes("data-evidence-form="));
      const partForm=formFrom(await html(servicePath+"?pagina_documentos=11&parte=2020-01-01"),'data-service-operation="day"');assert.equal(partForm.data.get("pagina_documentos"),"11");
      if(company==="rerchar"){
        const photoPath=servicePath+"?pagina_documentos=11&documento_form=foto_area",photo=form(await html(photoPath,"conductor"),"foto_area");fill(photo.data,{description:"Fotografía complementaria HTTP"});photo.data.set("file",pdf());r=await post(photoPath,photo.data,"conductor");assert.equal(r.status,200);const rejected=clean(await r.text());keep(rejected,"foto_area",{document_kind:"foto_area",description:"Fotografía complementaria HTTP",submission_key:String(photo.data.get("submission_key"))});assert.match(rejected,/<details\b(?=[^>]*class="document-optional")(?=[^>]*open)[^>]*>/);
      }else{
        const attempt=form(await html(path),slot);fill(attempt.data,{document_kind:"guia_valorizada",description:"Tipo ajeno a E y J"});attempt.data.set("file",jpg());r=await post(path,attempt.data);assert.equal(r.status,200);keep(clean(await r.text()),slot,{document_kind:"guia_valorizada",description:"Tipo ajeno a E y J",submission_key:String(attempt.data.get("submission_key"))});
      }
      const stale=form(await html(path,role),slot),cancel=formFrom(await html(servicePath),'data-service-operation="cancel"');cancel.data.set("reason","Cancelación de revisión documental HTTP");assert.equal((await post(servicePath,cancel.data)).status,303);fill(stale.data,values);stale.data.set("file",jpg());r=await post(path,stale.data,role);assert.equal(r.status,200);assert.ok(keep(clean(await r.text()),slot,values).form.includes('disabled=""'));
      outcomes.push({company,completeHistory:true,compactPagination:true,notesWithoutDeadLinks:true,descriptionAndTypeRetained:true,fileReselectionExplained:true,safeReplay:true,changedPayloadRejected:true,downloadBytesAndHeaders:true,currentScope:true,cancelledServiceKeepsDraft:true});console.log(JSON.stringify({phase:"forms-and-downloads",company,ok:true}));
    }
    const result={ok:true,cases:outcomes,documentsPerCompany:215,pagesPerCompany:11,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
