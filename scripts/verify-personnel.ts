import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-personnel-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");let server:ChildProcess|undefined,logs="";
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const actions=new WeakMap<FormData,string>();
  function formFrom(body:string,marker:string,decision?:string){
    const forms=body.match(/<form\b[\s\S]*?<\/form>/g)||[];
    const form=forms.find(x=>x.includes(marker)&&(!decision||x.includes(`value="${decision}"`)));assert.ok(form,marker+":"+decision);const data=new FormData();
    for(const tag of form.match(/<input\b[^>]*>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(tag.match(/\bvalue="([^"]*)"/)?.[1]??""));}
    for(const tag of form.match(/<select\b[\s\S]*?<\/select>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name){const options=tag.match(/<option\b[^>]*>/g)||[],selected=options.find(x=>x.includes('selected=""'))??options[0];data.set(name,decode(selected?.match(/\bvalue="([^"]*)"/)?.[1]??""));}}
    for(const tag of form.match(/<textarea\b[\s\S]*?<\/textarea>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(name,decode(tag.slice(tag.indexOf(">")+1,tag.indexOf("</textarea>"))));}
    const action=decode(form.match(/\baction="([^"]*)"/)?.[1]??"");if(action)actions.set(data,action);return {form,data};
  }
  const fill=(data:FormData,values:Record<string,string>)=>{for(const [key,value]of Object.entries(values))data.set(key,value);};
  function retained(body:string,marker:string,values:Record<string,string>,decision?:string){const result=formFrom(body,marker,decision);for(const [key,value]of Object.entries(values))assert.equal(result.data.get(key),value,key);assert.match(body,/Los datos ingresados se conservan/);return result;}
  function tableKeys(body:string,id:string,allEnabled=false){
    const fragments=new Map([...body.matchAll(/<table hidden><(tbody|tr) id="S:([^"]+)">([\s\S]*?)<\/\1><\/table>/g)].map(x=>[x[2],x[3]]));
    let section=body.match(new RegExp('<section[^>]*id="'+id+'"[\\s\\S]*?</section>'))?.[0];assert.ok(section,id);
    for(let pass=0;pass<fragments.size;pass++){let expanded=false;section=section.replace(/<template id="P:([^"]+)"><\/template>/g,(tag,key)=>{if(!fragments.has(key))return tag;expanded=true;return fragments.get(key)!;});if(!expanded)break;}
    if(allEnabled){assert.match(section,/Habilitado/);assert.doesNotMatch(section,/>Faltan \d/);}
    return [...section.matchAll(/data-coverage-key="([^"]+)"/g)].map(x=>x[1]);
  }
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const users=await db.query<{id:string;role:string}>(`INSERT INTO users(email,name,password_hash,role,active) VALUES
      ('admin@example.invalid','Admin','h','admin',true),('ops@example.invalid','Operaciones','h','operaciones',true),
      ('first@example.invalid','Conductor A','h','conductor',true),('second@example.invalid','Conductor B','h','conductor',true),
      ('inactive@example.invalid','Inactivo','h','conductor',false) RETURNING id,role`);
    const [admin,ops,first,second,inactive]=users,tokens:Record<string,string>={};
    for(const [role,user]of [["admin",admin],["operaciones",ops],["conductor",first]] as const){const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);}
    const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente HTTP'),('Otro cliente HTTP') RETURNING id");
    const sites=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) SELECT $1,'Faena '||lpad(n::text,3,'0') FROM generate_series(1,156) n RETURNING id",[client.id]);
    const [foreign]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena ajena') RETURNING id",[other.id]);
    const [external]=await db.query<{id:string}>("INSERT INTO external_drivers(name,tax_id,company_name,created_by) VALUES('Conductor tercero HTTP','12345678-5','Transporte HTTP',$1) RETURNING id",[admin.id]);
    const [requirement]=await db.query<{id:string}>("INSERT INTO site_requirements(client_id,name,kind,warning_days,created_by) VALUES($1,'Inducción HTTP','curso',30,$2) RETURNING id",[client.id,admin.id]);
    for(const [table,column,worker]of [["worker_credentials","user_id",first.id],["external_driver_credentials","external_driver_id",external.id]])await db.query(`INSERT INTO ${table}(${column},requirement_id,reference,issued_on,expires_on,created_by,created_at)
      SELECT $1,$2,'Pendiente '||n,(now() AT TIME ZONE 'America/Santiago')::date,(now() AT TIME ZONE 'America/Santiago')::date+365,$3,'2025-01-01' FROM generate_series(1,450) n`,[worker,requirement.id,admin.id]);
    const internalIds:string[]=[],externalIds:string[]=[],expiredIds:string[]=[];
    for(const worker of [first,second]){
      const [good]=await db.query<{id:string}>(`INSERT INTO worker_credentials(user_id,requirement_id,reference,issued_on,expires_on,state,created_by,reviewed_by,reviewed_at,created_at)
        VALUES($1,$2,'Vigente anterior',(now() AT TIME ZONE 'America/Santiago')::date-30,(now() AT TIME ZONE 'America/Santiago')::date+365,'verificada',$3,$3,now(),'2024-01-01') RETURNING id`,[worker.id,requirement.id,admin.id]);internalIds.push(good.id);
      const [third]=await db.query<{id:string}>(`INSERT INTO external_driver_credentials(external_driver_id,requirement_id,reference,issued_on,expires_on,state,created_by,reviewed_by,reviewed_at,created_at)
        VALUES($1,$2,'Vigente tercero',(now() AT TIME ZONE 'America/Santiago')::date-30,(now() AT TIME ZONE 'America/Santiago')::date+365,'verificada',$3,$3,now(),'2024-01-01') RETURNING id`,[external.id,requirement.id,admin.id]);externalIds.push(third.id);
      const [expired]=await db.query<{id:string}>(`INSERT INTO worker_credentials(user_id,requirement_id,reference,issued_on,expires_on,created_by)
        VALUES($1,$2,'Vencido sin revisar',(now() AT TIME ZONE 'America/Santiago')::date-30,(now() AT TIME ZONE 'America/Santiago')::date-1,$3) RETURNING id`,[worker.id,requirement.id,admin.id]);expiredIds.push(expired.id);
    }
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);return clean(await r.text());};
    const post=(path:string,data:FormData,role="admin")=>request(actions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const outcomes=[];
    for(const [index,company]of ["rerchar","e_y_j"].entries()){
      const context={empresa:company,vigencia:"vencidas",pagina_documentos:"5",pagina_terceros:"5",pagina_habilitacion:"2",pagina_habilitacion_terceros:"2"},path="/personal?"+new URLSearchParams(context);
      let body=await html(path),original=formFrom(body,"Guardar ficha");if(index===0){tableKeys(body,"habilitacion-propios",true);tableKeys(body,"habilitacion-terceros",true);}const profile={user_id:inactive.id,national_id:"ID-HTTP",position:"Cargo conservado",shift:"Turno HTTP",phone:"5550100",employer:company};fill(original.data,profile);
      let response=await post(path,original.data);assert.equal(response.status,200,"una ficha rechazada conserva trabajador y datos");body=clean(await response.text());let failed=retained(body,"Guardar ficha",profile);fill(failed.data,{...profile,user_id:index?second.id:first.id});response=await post(path,failed.data);assert.equal(response.status,303);let target=new URL(response.headers.get("location")!,base);for(const [key,value]of Object.entries(context))assert.equal(target.searchParams.get(key),value);assert.equal(target.hash,"#fichas-personal");
      original=formFrom(await html(path),'data-personnel-form="requirement"');const requirementValues={client_id:client.id,site_id:foreign.id,name:"Requisito nuevo "+company,kind:"examen",warning_days:"17"};fill(original.data,requirementValues);response=await post(path,original.data);assert.equal(response.status,200);failed=retained(clean(await response.text()),'data-personnel-form="requirement"',requirementValues);failed.data.set("site_id",sites[0].id);assert.equal((await post(path,failed.data)).status,303);
      body=await html(path);const option=[...body.matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]*)<\/option>/g)].find(x=>x[2].includes(requirementValues.name));assert.ok(option);const newRequirement=option[1];
      original=formFrom(body,'data-personnel-form="external_driver"');const externalValues={name:"Tercero nuevo "+company,tax_id:"12.345.678-5",company_name:"Transporte conservado",phone:"5550199"};fill(original.data,externalValues);response=await post(path,original.data);assert.equal(response.status,200);failed=retained(clean(await response.text()),'data-personnel-form="external_driver"',externalValues);failed.data.set("tax_id",index?"22.222.222-2":"11.111.111-1");assert.equal((await post(path,failed.data)).status,303);
      for(const source of ["credential","external_credential"] as const){original=formFrom(await html(path),`data-personnel-form="${source}"`);const values:Record<string,string>={...(source==="credential"?{user_id:index?second.id:first.id}:{external_driver_id:external.id}),requirement_id:requirement.id,reference:"Referencia conservada "+company,issued_on:"2030-01-01",expires_on:"2029-01-01"};fill(original.data,values);response=await post(path,original.data);assert.equal(response.status,200);failed=retained(clean(await response.text()),`data-personnel-form="${source}"`,values);assert.match(failed.form,/min="2030-01-01"/);failed.data.set("issued_on",today);failed.data.set("expires_on","2099-01-01");assert.equal((await post(path,failed.data)).status,303);}
      const firstPage="/personal?"+new URLSearchParams({...context,pagina_documentos:"1"});original=formFrom(await html(firstPage),expiredIds[index],"verificada");response=await post(firstPage,original.data);assert.equal(response.status,200);assert.match(await response.text(),/documento ya está vencido/);
      original=formFrom(await html(firstPage),expiredIds[index],"rechazada");original.data.set("reason","abc");response=await post(firstPage,original.data);assert.equal(response.status,200);failed=retained(clean(await response.text()),expiredIds[index],{reason:"abc"},"rechazada");failed.data.set("reason","Rechazo de prueba documentado");assert.equal((await post(firstPage,failed.data)).status,303);
      for(const [source,id]of [["review",internalIds[index]],["external_review",externalIds[index]]] as const){original=formFrom(await html(path),id,"revocada");original.data.set("reason","abc");response=await post(path,original.data);assert.equal(response.status,200);body=clean(await response.text());failed=retained(body,id,{reason:"abc"},"revocada");assert.match(body,new RegExp('<details[^>]*data-review="'+id+'"[^>]*open'));failed.data.set("reason","Revocación ficticia documentada");response=await post(path,failed.data);assert.equal(response.status,303);target=new URL(response.headers.get("location")!,base);assert.equal(target.searchParams.get("empresa"),company);assert.equal(target.searchParams.get("pagina_documentos"),"5");assert.equal(target.hash,source==="review"?"#documentos-propios":"#documentos-terceros");}
      original=formFrom(await html(path),'data-personnel-form="disable"',newRequirement);original.data.set("reason","abc");response=await post(path,original.data);assert.equal(response.status,200);failed=retained(clean(await response.text()),'data-personnel-form="disable"',{reason:"abc"},newRequirement);failed.data.set("reason","Requisito duplicado de prueba");assert.equal((await post(path,failed.data)).status,303);
      outcomes.push({company,profileRetained:true,requirementRetained:true,externalDriverRetained:true,credentialDatesRetained:true,reviewReasonsRetained:true,expiredVerificationBlocked:true,contextPreserved:true});
    }
    const seenInternal=[],seenExternal=[];
    for(let page=1;page<=5;page++){const body=await html("/personal?"+new URLSearchParams({pagina_documentos:String(page),pagina_terceros:String(page)}));seenInternal.push(...[...body.matchAll(/<li[^>]*id="documento-propio-([^"]+)"/g)].map(x=>x[1]));seenExternal.push(...[...body.matchAll(/<li[^>]*id="documento-tercero-([^"]+)"/g)].map(x=>x[1]));}
    assert.equal(seenInternal.length,456);assert.equal(new Set(seenInternal).size,456);assert.equal(seenExternal.length,454);assert.equal(new Set(seenExternal).size,454);
    const own=[],third=[];for(let page=1;page<=5;page++){const body=await html("/personal?"+new URLSearchParams({pagina_habilitacion:String(Math.min(page,4)),pagina_habilitacion_terceros:String(page)}));if(page<=4)own.push(...tableKeys(body,"habilitacion-propios"));third.push(...tableKeys(body,"habilitacion-terceros"));}
    assert.equal(new Set(own).size,312);assert.equal(new Set(third).size,468);
    const clamp=await request("/personal?pagina_documentos=999&empresa=e_y_j&vigencia=vencidas&ok=1"),clampBody=await clamp.text(),location=clamp.headers.get("location");assert.ok(location?location.includes("pagina_documentos=5")&&location.includes("ok=1"):clampBody.includes("NEXT_REDIRECT")&&clampBody.includes("pagina_documentos=5")&&clampBody.includes("ok=1"));
    for(const role of ["conductor",""]){const response=await request("/personal",{},role),text=await response.text();assert.ok(response.status>=300&&response.status<400||text.includes("NEXT_REDIRECT"));assert.ok(!text.includes('data-personnel-form="profile"'));}
    const result={ok:true,cases:outcomes,internalHistory:456,externalHistory:454,coveragePagination:true,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
