import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {Actor} from "../lib/auth";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-commercial-navigation-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",NEXT_TELEMETRY_DISABLED:"1",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");
  let server:ChildProcess|undefined,logs="";
  const checks:{company:string;role:string;name:string;ok:boolean;error?:string}[]=[];
  const decode=(value:string)=>value.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const text=(value:string)=>decode(value.replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim();
  const links=(body:string)=>(body.match(/<a\b[\s\S]*?<\/a>/g)||[]).map(tag=>({label:text(tag),href:decode(tag.match(/\bhref="([^"]*)"/)?.[1]??"")}));
  const link=(body:string,label:string)=>{const found=links(body).find(item=>item.label===label);assert.ok(found,label);return found.href;};
  const selected=(body:string,name:string)=>{const select=(body.match(/<select\b[\s\S]*?<\/select>/g)||[]).find(tag=>tag.match(/\bname="([^"]*)"/)?.[1]===name);assert.ok(select,name);return decode((select.match(/<option\b[^>]*>/g)||[]).find(tag=>tag.includes('selected=""'))?.match(/\bvalue="([^"]*)"/)?.[1]??"");};
  try{
    for(const name of(await readdir("db")).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
      const sql=await readFile(join("db",name),"utf8");
      await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(value=>value.trim()).filter(Boolean))await tx.query(part);});
    }
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name)VALUES('Cliente trazabilidad sintético')RETURNING id");
    const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name)VALUES($1,'Faena trazabilidad')RETURNING id",[client.id]);
    const actors={}as Record<"admin"|"operaciones"|"cliente"|"conductor",Actor>,tokens:Record<string,string>={};
    for(const role of["admin","operaciones","cliente","conductor"]as const){
      const[user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id)VALUES($1,$2,'h',$3,$4)RETURNING id",[role+"@commercial-review.example.invalid","Revisión "+role,role,role==="cliente"?client.id:null]);
      actors[role]={id:user.id,name:"Revisión "+role,email:role+"@commercial-review.example.invalid",role,client_id:role==="cliente"?client.id:null};
      const token=randomBytes(32).toString("hex");tokens[role]=token;
      await db.query("INSERT INTO sessions(token_hash,user_id,expires_at)VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
    }
    const quotes=await import("../lib/quotes"),pilot=await import("../lib/pilot");
    const fixtures:{company:"rerchar"|"e_y_j";quote:string;service:string}[]=[];
    for(const company of["rerchar","e_y_j"]as const){
      const quote=await quotes.createQuote(actors.admin,{submission_key:randomUUID(),client_id:client.id,issuer:company,title:"Traslado sintético "+company,issued_on:"2026-11-01",valid_until:"2027-12-01"});
      await db.query("INSERT INTO client_quote_lines(quote_id,position,description,quantity,unit,unit_price_clp,taxable)VALUES($1,1,'Traslado sintético',1,'servicio',1000,true)",[quote]);
      await db.query("UPDATE client_quotes SET status='aceptada',client_order_reference='OC-CORREGIDA',client_order_on='2026-11-20' WHERE id=$1",[quote]);
      await db.query("INSERT INTO client_quote_documents(quote_id,kind,filename,mime,content,uploaded_by,uploaded_at)VALUES($1,'orden_compra','oc-anterior.pdf','application/pdf',$2,$3,now()-interval '1 day')",[quote,Buffer.from("%PDF-1.4\n%%EOF"),actors.admin.id]);
      await db.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value)VALUES($1,'client_order','client_quote',$2,'{}')",[actors.admin.id,quote]);
      const service=await pilot.createService(actors.admin,{submission_key:randomUUID(),quote_id:quote,client_id:client.id,site_id:site.id,operating_company:company,request_category:"servicios",service_type:"traslado",waste_type:"Material sintético",estimated_kg:"",origin:"Faena sintética",destination:"Patio sintético",priority:"normal",notes:""});
      await db.query("UPDATE service_requests SET driver_id=$2 WHERE id=$1",[service,actors.conductor.id]);
      await assert.rejects(()=>pilot.assignService(actors.admin,service,{asset_id:randomUUID(),driver_id:actors.conductor.id,scheduled_for:"2026-11-21T10:00"}),/respaldo de la OC vigente/);
      fixtures.push({company,quote,service});
    }
    await(globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();
    delete(globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(resolve=>listener.listen(0,"127.0.0.1",resolve));
    const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;
    await new Promise<void>(resolve=>listener.close(()=>resolve()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
    server.stdout!.on("data",data=>logs+=data);server.stderr!.on("data",data=>logs+=data);
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",data=>{if(String(data).includes("Ready")){clearTimeout(timer);resolve();}});server!.once("exit",code=>{clearTimeout(timer);reject(new Error("Next terminó "+code));});});
    const html=async(path:string,role:string)=>{
      const response=await fetch(base+path,{redirect:"manual",headers:{Cookie:`rerchar_session=${tokens[role]}`},signal:AbortSignal.timeout(120000)}),body=(await response.text()).replace(/<!--[\s\S]*?-->/g,"");
      assert.equal(response.status,200,path);assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK")&&!body.includes("NEXT_REDIRECT"),path);
      assert.ok(body.includes('id="workspace-content"'),path);return body;
    };
    const sameCompany=(href:string,company:string,pathname:string)=>{const url=new URL(href,base);assert.equal(url.pathname,pathname);assert.equal(url.searchParams.get("empresa"),company);};
    for(const fixture of fixtures){
      const {company,quote,service}=fixture;
      const check=async(role:string,name:string,run:()=>Promise<void>)=>{try{await run();checks.push({company,role,name,ok:true});}catch(error){checks.push({company,role,name,ok:false,error:String(error)});}};
      for(const role of["admin","operaciones","cliente"]){
        const body=await html(`/cotizaciones/${quote}`,role);
        await check(role,"quote-list-return",async()=>{const href=link(body,"← Cotizaciones");sameCompany(href,company,"/cotizaciones");const list=await html(href,role);assert.equal(selected(list,"empresa"),company);assert.ok(links(list).some(item=>item.href===`/cotizaciones/${quote}`));assert.ok(!links(list).some(item=>item.href===`/cotizaciones/${fixtures.find(item=>item.company!==company)!.quote}`));});
        await check(role,"quote-client-context",async()=>{const href=link(body,"Carpeta del cliente");sameCompany(href,company,`/clientes/${client.id}`);const dossier=await html(href,role);if(role==="cliente")assert.equal(link(dossier,"Mi panel"),`/empresa/${company}`);else sameCompany(link(dossier,"Nueva cotización"),company,"/cotizaciones/nueva");});
        if(role!=="cliente")await check(role,"quote-request-context",async()=>{const href=link(body,"Crear solicitud");sameCompany(href,company,"/solicitudes/nueva");assert.equal(new URL(href,base).searchParams.get("cotizacion"),quote);assert.equal(selected(await html(href,role),"operating_company"),company);});
        await check(role,"request-breadcrumb-context",async()=>{const body=await html(`/solicitudes/nueva?cotizacion=${quote}&empresa=${company==="rerchar"?"e_y_j":"rerchar"}`,role);sameCompany(link(body,"Solicitudes"),company,"/solicitudes");assert.equal(selected(body,"operating_company"),company);});
      }
      for(const role of["admin","operaciones","cliente","conductor"]){
        const body=await html(`/solicitudes/${service}`,role);
        await check(role,"service-list-returns",async()=>{for(const label of["Solicitudes","Volver a solicitudes"]){const href=link(body,label);sameCompany(href,company,"/solicitudes");assert.equal(selected(await html(href,role),"empresa"),company);}});
        if(role==="conductor")await check(role,"driver-no-private-client-link",async()=>{assert.ok(!links(body).some(item=>item.href.startsWith(`/clientes/${client.id}`)));});
        else await check(role,"service-client-context",async()=>sameCompany(link(body,"Cliente trazabilidad sintético"),company,`/clientes/${client.id}`));
        if(role==="admin"||role==="operaciones")await check(role,"stale-order-warning",async()=>{assert.match(text(body),/Para programar este servicio puntual, registre la OC con su respaldo/);});
      }
      await check("admin","current-order-document-clears-warning",async()=>{
        const body=await html(`/cotizaciones/${quote}`,"admin"),form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(tag=>tag.includes("Adjuntar a cotización"));assert.ok(form);
        const data=new FormData();
        for(const tag of form.match(/<input\b[^>]*>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(tag.match(/\bvalue="([^"]*)"/)?.[1]??""));}
        data.set("quote_id",quote);data.set("kind","orden_compra");data.set("file",new File([Buffer.from("%PDF-1.4\n%%EOF")],"oc-vigente.pdf",{type:"application/pdf"}));
        const target=new URL(decode(form.match(/\baction="([^"]*)"/)?.[1]??"")||`/cotizaciones/${quote}`,base);assert.equal(target.origin,base);
        const response=await fetch(target,{method:"POST",body:data,redirect:"manual",headers:{Origin:base,Cookie:`rerchar_session=${tokens.admin}`},signal:AbortSignal.timeout(120000)});
        assert.equal(response.status,303);const destination=new URL(response.headers.get("location")!,base);assert.equal(destination.pathname,`/cotizaciones/${quote}`);assert.equal(destination.searchParams.get("error"),null);
        for(const role of["admin","operaciones"])assert.doesNotMatch(text(await html(`/solicitudes/${service}`,role)),/Para programar este servicio puntual, registre la OC con su respaldo/);
      });
      console.log(JSON.stringify({phase:"company",company,checks:checks.length,failures:checks.filter(item=>!item.ok).length}));
    }
    const failures=checks.filter(item=>!item.ok),result={ok:failures.length===0,checks,failures,companies:2,roles:4,backendBlocksStaleOrder:true,productionMutations:false,emailsSent:false,evidenceDirectory:work};
    await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert.equal(failures.length,0);
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
