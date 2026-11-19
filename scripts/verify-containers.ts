import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-containers-http-"));
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
  function retained(body:string,marker:string,values:Record<string,string>,source?:string){const result=formFrom(body,marker,source);for(const [key,value]of Object.entries(values))assert.equal(String(result.data.get(key)??""),value,key);assert.match(body,/Los datos ingresados se conservan/);return result;}
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const [client,foreignClient]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente tolvas HTTP'),('Cliente distinto HTTP') RETURNING id");
    const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena HTTP') RETURNING id",[client.id]);
    const [foreignSite]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena distinta') RETURNING id",[foreignClient.id]);
    const tokens:Record<string,string>={},users:Record<string,{id:string}>={};
    for(const role of ["admin","operaciones","conductor","cliente"] as const){
      const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id",[role+"@containers.example.invalid","Revisión "+role,role,client.id]);users[role]=user;
      const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
    }
    const units=await db.query<{id:string;code:string}>(`INSERT INTO containers(code,kind,capacity_m3,location_name,created_by,updated_at)
      SELECT 'HTTP-'||lpad(n::text,3,'0'),'tolva',12,'Patio principal',$1,'2026-10-01' FROM generate_series(1,415) n RETURNING id,code`,[users.admin.id]);
    const services=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,priority,created_by,operating_company,status,driver_id,created_at)
      SELECT gen_random_uuid(),$1,$2,'retiro','Chatarra','Faena','Patio','normal',$3,CASE WHEN n%2=0 THEN 'rerchar' ELSE 'e_y_j' END,'programada',$4,now()-n*interval '1 day' FROM generate_series(1,161) n RETURNING id`,[client.id,site.id,users.admin.id,users.conductor.id]);
    const [foreign]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,priority,created_by,operating_company)
      VALUES(gen_random_uuid(),$1,$2,'retiro','Metal','Faena','Patio','normal',$3,'rerchar') RETURNING id`,[foreignClient.id,foreignSite.id,users.admin.id]);
    await db.query(`INSERT INTO container_movements(container_id,kind,next_status,next_location,note,actor_id,created_at)
      SELECT $1,'traslado','en_transito','Camión','Movimiento histórico '||n,$2,'2026-10-01' FROM generate_series(1,317) n`,[units[0].id,users.admin.id]);
    await db.query(`INSERT INTO container_service_records(container_id,kind,record_date,kilometers,description,recorded_by,created_at)
      SELECT $1,'kilometraje','2026-10-01',12.5,'Traslado histórico '||n,$2,'2026-10-01' FROM generate_series(1,317) n`,[units[0].id,users.admin.id]);
    await db.query("INSERT INTO container_service_records(container_id,kind,record_date,description,recorded_by) VALUES($1,'mantenimiento','2026-10-02','Otra unidad',$2)",[units[1].id,users.admin.id]);
    const {moveContainer}=await import("../lib/containers");
    const actor={...users.admin,name:"Admin",email:"admin@containers.example.invalid",role:"admin" as const,client_id:null};
    for(const unit of units.slice(2,67))await moveContainer(actor,unit.id,{action:"instalar",site_id:site.id,service_id:services[160].id,waste_type:"Metal",note:"Instalación de prueba"});
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const post=(path:string,data:FormData,role="admin")=>request(actions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
    const form=(body:string,kind:string)=>formFrom(body,`data-container-form="${kind}"`);
    const keep=(body:string,kind:string,values:Record<string,string>)=>retained(body,`data-container-form="${kind}"`,values);
    const ids=(body:string,kind:string)=>[...body.matchAll(new RegExp(`data-container-${kind}="([^"]+)"`,"g"))].map(x=>x[1]);
    const total=(body:string)=>Number(body.match(/<strong>(\d+)<\/strong><span>Unidades registradas<\/span>/)?.[1]);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const inventory:string[]=[],history:string[]=[],records:string[]=[];
    for(let page=1;page<=5;page++)inventory.push(...ids(await html(`/contenedores?empresa=rerchar&pagina=${page}`),"id"));
    assert.equal(inventory.length,415);assert.equal(new Set(inventory).size,415);
    for(let page=1;page<=4;page++){
      const body=await html("/contenedores?"+new URLSearchParams({empresa:"rerchar",unidad:units[0].id,pagina_movimientos:String(page),pagina_registros:String(page)}));history.push(...ids(body,"movement"));records.push(...ids(body,"record"));
    }
    assert.equal(history.length,317);assert.equal(new Set(history).size,317);assert.equal(records.length,317);assert.equal(new Set(records).size,317);
    const empty=await html("/contenedores?unidad="+units[410].id);assert.equal(ids(empty,"record").length,0);assert.equal(ids(empty,"movement").length,0);
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),outcomes=[];
    for(const [index,company]of ["rerchar","e_y_j"].entries()){
      const role=index?"operaciones":"admin",context={empresa:company,pagina:"3",pagina_movimientos:"4",pagina_registros:"4",unidad:units[0].id},path="/contenedores?"+new URLSearchParams(context),unit=units[index];
      const target=(r:Response,anchor:string)=>{assert.equal(r.status,303);const url=new URL(r.headers.get("location")!,base);assert.equal(url.pathname,"/contenedores");assert.equal(url.hash,"#"+anchor);for(const [key,value]of Object.entries(context))assert.equal(url.searchParams.get(key),value,key);};
      let body=await html(path),current=form(body,"create"),values={code:units[0].code,kind:"contenedor",capacity_m3:"18.75",location_name:"Patio & norte",max_stay_days:"21"};fill(current.data,values);
      let r=await post(path,current.data,role);assert.equal(r.status,200);body=clean(await r.text());current=keep(body,"create",values);assert.match(body,/código ya pertenece/);
      current.data.set("code","HTTP-NUEVA-"+company);current.data.set("capacity_m3","0");r=await post(path,current.data,role);assert.equal(r.status,200);current=keep(clean(await r.text()),"create",{...values,code:"HTTP-NUEVA-"+company,capacity_m3:"0"});current.data.set("capacity_m3","18.75");target(await post(path,current.data,role),"nueva-unidad");
      body=await html(path);assert.equal(form(body,"create").data.get("code"),"");
      current=form(body,"move");const movement={container_id:unit.id,action:"instalar",site_id:site.id,service_id:foreign.id,waste_type:"Metal & chatarra",location_name:"",note:"Instalación con respaldo\nSegunda línea"};fill(current.data,movement);current.data.set("installation_photo",new File([Buffer.from("no es una foto")],"invalida.png",{type:"image/png"}));
      r=await post(path,current.data,role);assert.equal(r.status,200);body=clean(await r.text());current=keep(body,"move",movement);assert.equal(current.data.get("photo_retry"),"on");assert.match(current.form,/Continuar sin foto/);assert.ok(current.form.match(/<input\b[^>]*>/g)?.some(tag=>tag.includes('name="installation_photo"')&&/\brequired/.test(tag)),"la foto debe volver a adjuntarse");
      current.data.delete("installation_photo");current.data.set("service_id",services[160].id);r=await post(path,current.data,role);assert.equal(r.status,200);body=clean(await r.text());current=keep(body,"move",{...movement,service_id:services[160].id});assert.match(body,/Vuelva a seleccionar la foto/);
      const photoBytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);current.data.set("installation_photo",new File([photoBytes],"instalada.html",{type:"text/html"}));target(await post(path,current.data,role),"movimiento-unidad");
      body=await html("/contenedores?"+new URLSearchParams({empresa:company,unidad:unit.id}));assert.match(body,/instalada.png/);const photoId=body.match(/href="\/api\/contenedores\/movimientos\/([^"]+)\/foto"/)?.[1];assert.ok(photoId);
      const photo=await request(`/api/contenedores/movimientos/${photoId}/foto`);assert.equal(photo.status,200);assert.equal(photo.headers.get("content-type"),"image/png");assert.deepEqual(Buffer.from(await photo.arrayBuffer()),photoBytes);
      for(const forbiddenRole of ["cliente","conductor",""]){const denied=await request(`/api/contenedores/movimientos/${photoId}/foto`,{},forbiddenRole);assert.equal(denied.status,forbiddenRole?403:401);}
      const linked=await html(path);current=form(linked,"record");const record={container_id:unit.id,service_id:foreign.id,kind:"mantenimiento",record_date:today,kilometers:"16.75",cost_clp:"25000.50",description:"Revisión de bisagras\nDetalle conservado",mark_out_of_service:"on",workshop_location:"Taller & reparaciones"};fill(current.data,record);
      r=await post(path,current.data,role);assert.equal(r.status,200);body=clean(await r.text());current=keep(body,"record",record);assert.match(body,/retire primero la unidad/);assert.match(current.form,/type="checkbox"[^>]*checked=""/);assert.ok(current.form.match(/<input\b[^>]*>/g)?.some(tag=>tag.includes('name="workshop_location"')&&/\brequired/.test(tag)),"el taller debe ser obligatorio");
      current.data.set("mark_out_of_service","");r=await post(path,current.data,role);assert.equal(r.status,200);current=keep(clean(await r.text()),"record",{...record,mark_out_of_service:"",workshop_location:"",service_id:foreign.id});assert.match(current.form,/cliente actual/);
      current.data.set("service_id",services[160].id);target(await post(path,current.data,role),"registro-unidad");
      current=form(await html(path),"move");fill(current.data,{container_id:unit.id,action:"retirar",site_id:"",service_id:services[160].id,waste_type:"",location_name:"Patio de retorno",note:"Retiro para mantención"});target(await post(path,current.data,role),"movimiento-unidad");
      current=form(await html(path),"record");fill(current.data,{...record,service_id:services[160].id});target(await post(path,current.data,role),"registro-unidad");
      body=await html("/contenedores?"+new URLSearchParams({empresa:company,unidad:unit.id}));current=form(body,"move");assert.match(current.form,/Reactivar en patio/);assert.ok(!current.form.includes('value="instalar"'));assert.match(body,/25.000,5/);
      fill(current.data,{container_id:unit.id,action:"instalar",site_id:site.id,service_id:services[160].id,waste_type:"Metal",location_name:"",note:"Instalación desde estado antiguo"});r=await post(path,current.data,role);assert.equal(r.status,200);assert.ok(/patio o tránsito antes de instalarse/.test(await r.text()),"el estado vigente debe impedir una instalación desde taller");
      outcomes.push({company,role,createMoveRecordRetention:true,photoRetryExplicit:true,photoBytesAndExtension:true,oldServiceAvailable:true,maintenanceAndWithdrawal:true,invalidTransitionRejected:true,companyAndPagesPreserved:true});console.log(JSON.stringify({phase:"forms",company,complete:true}));
    }
    let omitted=form(await html("/contenedores?empresa=e_y_j"),"move");fill(omitted.data,{container_id:units[67].id,action:"instalar",site_id:site.id,service_id:services[160].id,waste_type:"Metal",location_name:"",note:"Instalación sin foto por decisión explícita"});omitted.data.set("installation_photo",new File([Buffer.from("foto inválida")],"invalida.png"));
    const rejected=await post("/contenedores",omitted.data);assert.equal(rejected.status,200);omitted=form(clean(await rejected.text()),"move");omitted.data.delete("installation_photo");omitted.data.set("omit_photo","on");assert.equal((await post("/contenedores",omitted.data)).status,303);
    assert.equal(total(await html("/contenedores")),417);
    const clamped=await request("/contenedores?empresa=e_y_j&pagina=999&pagina_movimientos=999&pagina_registros=999&ok=1"),clampBody=await clamped.text(),location=clamped.headers.get("location");assert.ok(location?location.includes("pagina=5")&&location.includes("ok=1"):clampBody.includes("NEXT_REDIRECT")&&clampBody.includes("pagina=5")&&clampBody.includes("ok=1"));
    for(const role of ["conductor","cliente",""]){const r=await request("/contenedores",{},role),body=await r.text();assert.ok(r.status>=300&&r.status<400||body.includes("NEXT_REDIRECT"));assert.ok(!body.includes("data-container-form"));}
    const forbidden=form(await html("/contenedores"),"create");fill(forbidden.data,{code:"SIN-PERMISO",kind:"tolva",capacity_m3:"12",location_name:"Patio",max_stay_days:"14"});await post("/contenedores",forbidden.data,"conductor");assert.equal(total(await html("/contenedores")),417);
    const result={ok:true,cases:outcomes,inventoryUnits:417,inventoryPages:5,filteredMovements:317,filteredRecords:317,historyPages:4,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
