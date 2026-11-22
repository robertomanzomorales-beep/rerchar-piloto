import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-agenda-navigation-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");let server:ChildProcess|undefined,logs="";
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  function getForm(body:string,marker:string){const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes(marker));assert.ok(form,marker);return form;}
  function inputTag(form:string,name:string){const tag=(form.match(/<input\b[^>]*>/g)||[]).find(x=>x.includes(`name="${name}"`));assert.ok(tag,name);return tag;}
  const inputValue=(form:string,name:string)=>decode(inputTag(form,name).match(/\bvalue="([^"]*)"/)?.[1]??"");
  function selected(form:string,name:string){const select=form.match(new RegExp('<select[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))?.[1];assert.ok(select,name);return select.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1]??"";}
  function link(body:string,label:string){const tag=(body.match(/<a\b[^>]*>/g)||[]).find(x=>x.includes(`aria-label="${label}"`));assert.ok(tag,label);return decode(tag.match(/href="([^"]*)"/)?.[1]??"");}
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente agenda HTTP') RETURNING id");
    const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena HTTP') RETURNING id",[client.id]);
    const [admin]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin') RETURNING id");
    const token=randomBytes(32).toString("hex");await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),admin.id]);
    const tokens:Record<string,string>={admin:token};
    for(const role of ["operaciones","cliente","conductor"]){
      const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$2,$3) RETURNING id",[role+"@agenda.example.invalid",role,role==="cliente"?client.id:null]);
      const session=randomBytes(32).toString("hex");tokens[role]=session;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(session).digest("hex"),user.id]);
    }
    const [truck]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES('AGENDA-HTTP','Camión de prueba de navegación','camion') RETURNING id");
    const [equipment]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES('AGENDA-EQUIPO','Equipo que no es camión','equipo') RETURNING id");
    const trips=await db.query<{id:string;operating_company:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,assigned_asset_id,scheduled_for,created_by)
      SELECT gen_random_uuid(),$1,$2,company,'traslado','Material HTTP','Origen','Destino','programada',$3,
        CASE WHEN company='rerchar' THEN '2027-01-01T12:00:00Z'::timestamptz ELSE '2027-01-01T16:00:00Z'::timestamptz END,$4
      FROM unnest(ARRAY['rerchar','e_y_j']) company RETURNING id,operating_company`,[client.id,site.id,truck.id,admin.id]);
    await db.query(`WITH services AS (
      INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,assigned_asset_id,scheduled_for,created_by)
      SELECT gen_random_uuid(),$1,$2,CASE WHEN n<=101 THEN 'rerchar' ELSE 'e_y_j' END,'traslado','Seguimiento anterior','Origen','Destino','en_ruta',$3,'2026-11-18T12:00:00Z',$4 FROM generate_series(1,202) n RETURNING id)
      INSERT INTO service_day_reports(service_id,day,asset_id,outcome,observation,recorded_by)
      SELECT id,'2026-11-18',$3,'incompleto','Parte anterior pendiente',$4 FROM services`,[client.id,site.id,truck.id,admin.id]);
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
    const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
    server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);return clean(await r.text());};
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[],notes=[];
    const formData=(body:string)=>{const form=getForm(body,'data-fleet-day-form="note"'),data=new FormData();for(const tag of form.match(/<input\b[^>]*>/g)||[]){const name=tag.match(/\bname="([^\"]*)"/)?.[1];if(name)data.set(decode(name),decode(tag.match(/\bvalue="([^\"]*)"/)?.[1]??""));}for(const tag of form.match(/<select\b[\s\S]*?<\/select>/g)||[]){const name=tag.match(/\bname="([^\"]*)"/)?.[1];if(name)data.set(name,selected(form,name));}const detail=form.match(/<textarea\b[^>]*name="detail"[^>]*>([\s\S]*?)<\/textarea>/)?.[1]??"";data.set("detail",decode(detail));return {form,data,target:decode(form.match(/\baction="([^\"]*)"/)?.[1]??"")};};
    const fill=(data:FormData,values:Record<string,string>)=>{for(const [key,value]of Object.entries(values))data.set(key,value);};
    const post=(current:ReturnType<typeof formData>,role="admin")=>request(current.target,{method:"POST",body:current.data,headers:{Origin:base}},role);
    const retained=(body:string,values:Record<string,string>)=>{const current=formData(body);for(const [name,value]of Object.entries(values))assert.equal(String(current.data.get(name)??""),value,name);assert.match(body,/Los datos ingresados se conservan/);assert.equal(inputValue(current.form,"empresa"),values.empresa);assert.equal(inputValue(current.form,"pagina"),"2");return current;};
    for(const company of ["rerchar","e_y_j"]){
      const body=await html(`/agenda?empresa=${company}&mes=01&anio=2027&partes=pendientes`),jump=getForm(body,"agenda-month-jump");
      assert.equal(selected(jump,"mes"),"01");assert.equal(inputValue(jump,"anio"),"2027");assert.equal(inputValue(jump,"empresa"),company);assert.equal(inputValue(jump,"partes"),"pendientes");
      assert.equal((jump.match(/<option/g)||[]).length,12);
      const noteForm=getForm(body,"Guardar novedad");assert.match(inputTag(noteForm,"day"),/min="2026-12-28"/);assert.match(inputTag(noteForm,"day"),/max="2027-01-03"/);assert.equal(inputValue(noteForm,"inicio"),"2027-01-01");
      const filtered=getForm(body,">Filtrar<");assert.equal(inputValue(filtered,"inicio"),"2027-01-01","cambiar empresa conserva el mes seleccionado aunque la semana empiece en diciembre");
      const shown=(body.match(/<a\b[^>]*class="fleet-week-trip"[^>]*>/g)||[]).map(tag=>tag.match(/href="([^"]*)"/)?.[1]);
      assert.ok(shown.includes(`/solicitudes/${trips.find(t=>t.operating_company===company)!.id}`));assert.ok(!shown.includes(`/solicitudes/${trips.find(t=>t.operating_company!==company)!.id}`),"se mantienen los detalles de la empresa seleccionada");
      for(const [label,date] of [["Semana anterior","2026-12-21"],["Semana siguiente","2027-01-04"]]){
        const href=link(body,label),url=new URL(href,base);assert.equal(url.searchParams.get("inicio"),date);assert.equal(url.searchParams.get("empresa"),company);assert.equal(url.searchParams.get("partes"),"pendientes");
        const navigated=await html(href),again=getForm(navigated,"agenda-month-jump");assert.equal(inputValue(again,"empresa"),company);
      }
      const todayAnchor=(body.match(/<a\b[^>]*>[\s\S]*?<\/a>/g)||[]).find(tag=>/>Hoy<\/a>/.test(tag));assert.ok(todayAnchor);const todayUrl=new URL(decode(todayAnchor.match(/href="([^"]*)"/)?.[1]??""),base);
      const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());assert.equal(todayUrl.searchParams.get("inicio"),today);assert.equal(todayUrl.searchParams.get("empresa"),company);
      const may=await html(`/agenda?empresa=${company}&mes=05&anio=2027`),mayJump=getForm(may,"agenda-month-jump"),mayNote=getForm(may,"Guardar novedad");assert.equal(selected(mayJump,"mes"),"05");assert.match(inputTag(mayNote,"day"),/min="2027-04-26"/);assert.equal(inputValue(getForm(may,">Filtrar<"),"inicio"),"2027-05-01");
      outcomes.push({company,directMonthYear:true,firstWeekAcrossYear:true,companyPreserved:true,weeklyNavigation:true,today:true});
      const context={inicio:"2027-01-01",empresa:company,partes:"pendientes",pagina:"2"},path="/agenda?"+new URLSearchParams(context),role=company==="rerchar"?"admin":"operaciones";
      let current=formData(await html(path));assert.match(current.form,/<button[^>]*disabled=""/);
      const values={...context,asset_id:truck.id,day:"2027-01-01",kind:"indisponible",detail:"Inspección & revisión <previa>\nCamión de "+company};fill(current.data,values);current.data.set("password","SECRETO_NO_RETORNAR_AGENDA");let response=await post(current,role);assert.equal(response.status,200);let failed=clean(await response.text());assert.match(failed,/Ya hay un servicio activo/);assert.doesNotMatch(failed,/SECRETO_NO_RETORNAR_AGENDA/);current=retained(failed,values);
      fill(current.data,{...values,day:"2027-01-02",detail:"x"});response=await post(current,role);assert.equal(response.status,200);current=retained(clean(await response.text()),{...values,day:"2027-01-02",detail:"x"});
      fill(current.data,{...values,day:"2027-01-02"});response=await post(current,role);assert.equal(response.status,303);const destination=new URL(response.headers.get("location")!,base);assert.equal(destination.hash,"#planilla-semanal");for(const [key,value]of Object.entries(context))assert.equal(destination.searchParams.get(key),value);assert.ok(destination.searchParams.get("ok"));const saved=await html(destination.pathname+destination.search);assert.match(saved,/Cambios guardados correctamente/);assert.match(saved,/fleet-week-note indisponible/);assert.ok(saved.includes("Inspección &amp; revisión &lt;previa&gt;"));current=formData(saved);assert.equal(selected(current.form,"asset_id"),"");assert.equal(selected(current.form,"kind"),"nota");assert.equal(inputValue(current.form,"day"),"2026-12-28");assert.equal(String(current.data.get("detail")),"");
      const afterSave=formData(saved);fill(afterSave.data,values);response=await post(afterSave,role);assert.equal(response.status,200);retained(clean(await response.text()),values);
      const other=await html(path.replace("empresa="+company,"empresa="+(company==="rerchar"?"e_y_j":"rerchar")));assert.ok(other.includes("Inspección &amp; revisión &lt;previa&gt;"),"la novedad pertenece a la flota compartida");
      fill(current.data,{...values,day:"2027-01-02",kind:"despejado",detail:""});response=await post(current,role);assert.equal(response.status,303);const cleared=new URL(response.headers.get("location")!,base);assert.notEqual(cleared.searchParams.get("ok"),destination.searchParams.get("ok"));assert.ok(!(await html(cleared.pathname+cleared.search)).includes("Inspección &amp; revisión &lt;previa&gt;"));
      current=formData(await html(path));fill(current.data,{...values,asset_id:equipment.id,day:"2027-01-03"});response=await post(current,role);assert.equal(response.status,200);const unavailable=retained(clean(await response.text()),{...values,asset_id:equipment.id,day:"2027-01-03"});assert.match(unavailable.form,/Selección anterior no disponible/);assert.match(unavailable.form,/<button[^>]*disabled=""/);
      for(const denied of ["cliente","conductor",""]){current=formData(await html(path));fill(current.data,{...values,day:"2027-01-03",kind:"nota",detail:"INTENTO_SIN_PERMISO"});response=await post(current,denied);if(!denied)assert.equal(response.status,303);else{assert.equal(response.status,200);assert.ok(!clean(await response.text()).includes('data-fleet-day-form="note"'));}}
      notes.push({company,actor:role,conflictKeepsFourFields:true,invalidReasonKeepsDraft:true,pageAndPendingViewPreserved:true,saveReturnsToBoard:true,sharedFleetNote:true,clearAllowedWithoutReason:true,unavailableSelectionRetained:true,unauthorizedWritesRejected:true});
    }
    const result={ok:true,cases:outcomes,noteForms:notes,pendingAlertsPerCompany:101,productionMutations:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
