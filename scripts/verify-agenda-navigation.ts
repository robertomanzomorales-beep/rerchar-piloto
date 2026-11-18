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
    const [truck]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES('AGENDA-HTTP','Camión de prueba de navegación','camion') RETURNING id");
    const trips=await db.query<{id:string;operating_company:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,assigned_asset_id,scheduled_for,created_by)
      SELECT gen_random_uuid(),$1,$2,company,'traslado','Material HTTP','Origen','Destino','programada',$3,
        CASE WHEN company='rerchar' THEN '2027-01-01T12:00:00Z'::timestamptz ELSE '2027-01-01T16:00:00Z'::timestamptz END,$4
      FROM unnest(ARRAY['rerchar','e_y_j']) company RETURNING id,operating_company`,[client.id,site.id,truck.id,admin.id]);
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
    const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
    server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string)=>fetch(base+path,{redirect:"manual",headers:{Cookie:`rerchar_session=${token}`},signal:AbortSignal.timeout(60000)});
    const html=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);return clean(await r.text());};
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
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
    }
    const result={ok:true,cases:outcomes,productionMutations:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
