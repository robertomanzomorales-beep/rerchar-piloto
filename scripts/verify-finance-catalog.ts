import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-finance-catalog-http-"));
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
    const [client,other,archived]=await db.query<{id:string}>("INSERT INTO clients(name,email,deleted_at) VALUES('Cliente HTTP','contacto@example.invalid',NULL),('Cliente ajeno HTTP','otro@example.invalid',NULL),('Cliente archivado HTTP','archivo@example.invalid',now()) RETURNING id");
    const [site,foreignSite]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena HTTP'),($2,'Faena ajena HTTP') RETURNING id",[client.id,other.id]);
    const tokens:Record<string,string>={},users:Record<string,{id:string}>={};
    for(const role of ["admin","operaciones","conductor","cliente"] as const){
      const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id",[role+"@finance.example.invalid","Revisión "+role,role,client.id]);users[role]=user;
      const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
    }
    const {listFinance,createTariff}=await import("../lib/finance"),actor={...users.admin,name:"Admin HTTP",email:"admin@finance.example.invalid",role:"admin" as const,client_id:null};
    const fixtures:Record<string,{contract:string;rate:string;notice:string;legacy:string;contracts:string[];tariffs:string[];notices:string[]}>= {};
    for(const company of ["rerchar","e_y_j"]){
      const contracts=await db.query<{id:string}>(`INSERT INTO client_contracts(client_id,site_id,operating_company,code,starts_on,notes,created_by,created_at)
        SELECT $1,$2,$3,$3||'-HTTP-'||n,'2020-01-01','Condiciones conservadas de revisión',$4,'2020-01-01' FROM generate_series(1,213) n RETURNING id`,[client.id,site.id,company,actor.id]);
      const tariffs=await db.query<{id:string}>(`INSERT INTO service_tariffs(contract_id,service_type,waste_type,unit,unit_price_clp,valid_from,created_by,created_at)
        SELECT $1,'retiro','Material HTTP '||n,'servicio',100.25,'2020-01-01',$2,'2020-01-01' FROM generate_series(1,315) n RETURNING id`,[contracts[212].id,actor.id]);
      await db.query("UPDATE service_tariffs SET active=false WHERE id=$1",[tariffs[314].id]);
      await db.query(`INSERT INTO tariff_change_notices(old_tariff_id,new_tariff_id,reason,created_at)
        SELECT $1,id,'Acuerdo comercial de revisión HTTP','2020-01-01' FROM service_tariffs WHERE id=ANY($2::uuid[])`,[tariffs[314].id,tariffs.slice(0,205).map(t=>t.id)]);
      const rate=await createTariff(actor,{contract_id:contracts[212].id,service_type:"retiro",waste_type:"Revisión HTTP",unit:"servicio",unit_price_clp:"100.25",valid_from:"2020-01-01",valid_until:""});
      const [legacy]=await db.query<{id:string}>("INSERT INTO client_contracts(client_id,code,starts_on,created_by) VALUES($1,$2,'2020-01-01',$3) RETURNING id",[client.id,"LEGACY-HTTP-"+company,actor.id]);
      const [legacyRate]=await db.query<{id:string}>("INSERT INTO service_tariffs(contract_id,service_type,unit,unit_price_clp,valid_from,created_by) VALUES($1,'retiro','servicio',1,'2020-01-01',$2) RETURNING id",[legacy.id,actor.id]);
      const [legacyService]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,closed_at,created_by)
        VALUES(gen_random_uuid(),$1,$2,$3,'retiro','Metal HTTP','Faena','Patio','completada','2020-02-02T15:00:00Z',$4) RETURNING id`,[client.id,site.id,company,actor.id]);
      await db.query("INSERT INTO service_valuations(service_id,tariff_id,quantity,unit_price_clp,total_clp,created_by) VALUES($1,$2,1,1,1,$3)",[legacyService.id,legacyRate.id,actor.id]);
      const data=await listFinance(actor,company);fixtures[company]={contract:data.contracts.at(-1)!.id,rate,notice:data.notices[0].id,legacy:legacy.id,contracts:data.contracts.map(x=>x.id),tariffs:data.tariffs.map(x=>x.id),notices:data.notices.map(x=>x.id)};
    }
    console.log(JSON.stringify({phase:"fixtures",contractsPerCompany:213,tariffsPerCompany:316,noticesPerCompany:205}));
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(120000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,{},role);assert.equal(r.status,200);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const post=(path:string,data:FormData,role="admin")=>request(actions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
    const form=(body:string,kind:string,id="")=>formFrom(body,`data-finance-catalog="${kind}"`,id);
    const keep=(body:string,kind:string,values:Record<string,string>,id="")=>retained(body,`data-finance-catalog="${kind}"`,values,id);
    const ids=(body:string,attribute:string)=>[...body.matchAll(new RegExp(`${attribute}="([^"]+)"`,"g"))].map(x=>x[1]);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    for(const company of ["rerchar","e_y_j"]){
      const seenContracts:string[]=[],seenTariffs:string[]=[],seenNotices:string[]=[];let inactiveVisible=false;
      for(let page=1;page<=4;page++){
        const body=await html(`/finanzas?empresa=${company}&pagina_contratos=${Math.min(page,3)}&pagina_tarifas=${page}&pagina_avisos=${Math.min(page,3)}`);
        if(page<=3){seenContracts.push(...ids(body,"data-finance-contract"));seenNotices.push(...ids(body,"data-finance-notice"));}
        seenTariffs.push(...ids(body,"data-finance-tariff"));inactiveVisible ||= body.includes("Inactiva");
      }
      assert.deepEqual(seenContracts,fixtures[company].contracts);assert.deepEqual(seenTariffs,fixtures[company].tariffs);assert.equal(seenNotices.length,205);assert.equal(new Set(seenNotices).size,205);assert.ok(inactiveVisible,"el historial incluye tarifas inactivas");
    }
    console.log(JSON.stringify({phase:"pagination",bothCompanies:true,stableOrder:true,completeHistories:true}));
    const outcomes=[];
    for(const company of ["rerchar","e_y_j"]){
      const fixture=fixtures[company],context={empresa:company,facturacion:"pendiente",oc:"pendiente",avisos:"pendientes",pagina:"2",pagina_contratos:"3",pagina_tarifas:"4",pagina_avisos:"3"},path="/finanzas?"+new URLSearchParams(context);
      const target=(r:Response,prefix:string,expectedCompany=company)=>{assert.equal(r.status,303);const url=new URL(r.headers.get("location")!,base);assert.equal(url.pathname,"/finanzas");assert.ok(url.hash.startsWith("#"+prefix));for(const [key,value]of Object.entries(context))assert.equal(url.searchParams.get(key),key==="empresa"?expectedCompany:value,key);assert.equal(url.searchParams.get("formulario"),null);assert.ok(url.searchParams.get("origen"));return url.pathname+url.search+url.hash;};
      let current=form(await html(path),"contract");const contractValues={client_id:client.id,site_id:foreignSite.id,operating_company:company,code:"HTTP Nuevo "+company,starts_on:"2020-01-01",ends_on:"2030-01-01",notes:"Acuerdo & condiciones\nconservadas"};fill(current.data,contractValues);let r=await post(path,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"contract",contractValues);assert.match(current.form,/Selección anterior no disponible/);current.data.set("site_id",site.id);const created=target(await post(path,current.data),"contrato-");assert.match(await html(created),/HTTP Nuevo/);assert.equal(form(await html(path),"contract").data.get("code"),"");
      current=form(await html(path),"contract");fill(current.data,{...contractValues,client_id:archived.id,site_id:"",code:"HTTP Archivado"});r=await post(path,current.data);assert.equal(r.status,200);keep(clean(await r.text()),"contract",{...contractValues,client_id:archived.id,site_id:"",code:"HTTP Archivado"});
      current=form(await html(path),"tariff");assert.ok(current.form.includes(`value="${fixture.contract}"`),"el selector incluye contratos fuera de los primeros 200");const tariffValues={contract_id:fixture.contract,service_type:"arriendo",waste_type:"Equipo & HTTP "+company,unit:"kg",unit_price_clp:"125.75",valid_from:"2020-01-01",valid_until:"2030-01-01"};fill(current.data,tariffValues);r=await post(path,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"tariff",tariffValues);current.data.set("unit","dia");const savedTariff=target(await post(path,current.data),"tarifa-");assert.match(await html(savedTariff),/125,75/);
      current=form(await html(path),"tariff");fill(current.data,{...tariffValues,unit:"dia"});r=await post(path,current.data);assert.equal(r.status,200);keep(clean(await r.text()),"tariff",{...tariffValues,unit:"dia"});
      const editPath=path+"&formulario=revise&edicion="+fixture.rate;current=form(await html(editPath),"revise",fixture.rate);const reviseValues={tariff_id:fixture.rate,unit_price_clp:"100.25",valid_from:"2020-02-01",reason:"Nuevo acuerdo & respaldo\nconservado"};fill(current.data,reviseValues);r=await post(editPath,current.data);assert.equal(r.status,200);let body=clean(await r.text());current=keep(body,"revise",reviseValues,fixture.rate);assert.match(body,/El precio no cambió/);assert.match(body,/Tarifa seleccionada fuera de esta página/);current.data.set("unit_price_clp","145.25");const revised=target(await post(editPath,current.data),"tarifa-");assert.match(await html(revised),/145,25/);
      const noticePath=path+"&formulario=notice&edicion="+fixture.notice;current=form(await html(noticePath),"notice",fixture.notice);const noticeValues={notice_id:fixture.notice,channel:"correo",recipient:"inválido",notified_on:"2020-02-01",reference:"Correo & constancia\nconservados"};fill(current.data,noticeValues);r=await post(noticePath,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"notice",noticeValues,fixture.notice);current.data.set("recipient","cliente@example.invalid");current.data.set("notified_on","2099-01-01");r=await post(noticePath,current.data);assert.equal(r.status,200);body=clean(await r.text());current=keep(body,"notice",{...noticeValues,recipient:"cliente@example.invalid",notified_on:"2099-01-01"},fixture.notice);assert.match(body,/fecha del aviso no puede ser futura/);current.data.set("notified_on","2020-02-01");const notified=target(await post(noticePath,current.data),"aviso-");body=await html(notified);assert.match(body,/Aviso seleccionado fuera del filtro o página actual/);assert.ok(!formFromOptional(body,"notice",fixture.notice));assert.match(body,/Aviso registrado/);
      const legacyContext={...context,empresa:"pendiente",pagina_contratos:"1",pagina_tarifas:"1",pagina_avisos:"1"},legacyPath="/finanzas?"+new URLSearchParams(legacyContext)+"&formulario=classify&edicion="+fixture.legacy;current=form(await html(legacyPath),"classify",fixture.legacy);const badCompany=company==="rerchar"?"e_y_j":"rerchar";fill(current.data,{id:fixture.legacy,operating_company:badCompany});r=await post(legacyPath,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"classify",{id:fixture.legacy,operating_company:badCompany},fixture.legacy);current.data.set("operating_company",company);r=await post(legacyPath,current.data);assert.equal(r.status,303);const classified=new URL(r.headers.get("location")!,base);assert.equal(classified.searchParams.get("empresa"),"pendiente");body=await html(classified.pathname+classified.search);assert.ok(ids(body,"data-finance-contract").includes(fixture.legacy));assert.match(body,/Contrato seleccionado fuera de esta vista o página/);
      outcomes.push({company,fiveFormsRetainDrafts:true,filtersAndPagesPreserved:true,offPageRecordsAccessible:true,oldContractSelectable:true,historicalDecimals:true});console.log(JSON.stringify({phase:"forms",company,ok:true}));
    }
    const clamped=await request("/finanzas?empresa=e_y_j&pagina_contratos=999&pagina_tarifas=999"),clampedBody=await clamped.text();
    const meta=(clampedBody.match(/<meta\b[^>]*>/g)||[]).find(tag=>tag.includes('http-equiv="refresh"')),destination=clamped.headers.get("location")??decode(meta?.match(/content="[^";]*;url=([^"\n]*)"/)?.[1]??"");
    assert.ok(destination,"la página fuera de rango debe redirigir a la última página existente");assert.equal(new URL(destination,base).searchParams.get("pagina_contratos"),"3");
    for(const role of ["operaciones","conductor","cliente",""]){const r=await request("/finanzas",{},role),body=await r.text();assert.ok(r.status>=300&&r.status<400||body.includes("NEXT_REDIRECT"));assert.ok(!body.includes("data-finance-catalog"));}
    const result={ok:true,cases:outcomes,pagination:{contractsPerCompany:213,tariffsPerCompany:316,noticesPerCompany:205},archivedClientRejected:true,overlappingTariffRejected:true,classificationMismatchRejected:true,futureNoticeRejected:true,rolesRestricted:true,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
  function formFromOptional(body:string,kind:string,id:string){return (body.match(/<form\b[\s\S]*?<\/form>/g)||[]).some(x=>x.includes(`data-finance-catalog="${kind}"`)&&x.includes(`data-source-id="${id}"`));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
