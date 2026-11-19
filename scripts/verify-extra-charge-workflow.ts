import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-extra-charge-workflow-http-"));
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
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name,email) VALUES('Cliente revisión de cargos HTTP','contacto@example.invalid') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena revisión HTTP') RETURNING id",[client.id]),[asset]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES('CAM-CARGO-HTTP','Camión revisión HTTP','camion') RETURNING id");
    const tokens:Record<string,string>={},users:Record<string,{id:string}>={};
    for(const role of ["admin","operaciones","conductor","cliente"] as const){
      const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id",[role+"@charges.example.invalid","Revisión "+role,role,client.id]);users[role]=user;
      const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
    }
    const charges=await import("../lib/extra-charges"),actor={...users.admin,name:"Admin HTTP",email:"admin@charges.example.invalid",role:"admin" as const,client_id:null};
    const fixtures:Record<string,{service:string;sourceIds:string[];allIds:string[];proposedIds:string[];approvedIds:string[]}>={};
    for(const company of ["rerchar","e_y_j"] as const){
      const [service]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,scheduled_for,assigned_asset_id,driver_id,closed_at,created_by)
        VALUES(gen_random_uuid(),$1,$2,$3,'traslado','Material','Faena','Patio','completada','2020-01-01T15:00:00Z',$4,$5,'2020-01-02T15:00:00Z',$6) RETURNING id`,[client.id,site.id,company,asset.id,users.conductor.id,actor.id]);
      await db.query(`INSERT INTO service_day_reports(service_id,day,asset_id,outcome,observation,recorded_by)
        SELECT $1,'2020-01-01'::date+n,$2,'incompleto','Antecedente original del parte HTTP '||n,$3 FROM generate_series(0,216) n`,[service.id,asset.id,actor.id]);
      for(const [status,total]of [["propuesto",213],["aprobado",205],["facturado",7],["descartado",3]] as const){
        await db.query(`INSERT INTO service_extra_charges(submission_key,service_id,service_day,kind,reason,source_outcome,source_observation,amount_clp,status,created_by,created_at,decided_by,decided_at,decision_note,invoice_number,invoiced_on)
          SELECT gen_random_uuid(),$1,'2020-01-01','sobrestadia','Cargo histórico HTTP '||$3||' '||n,'incompleto','Antecedente original del parte HTTP',1.25,$3,$2,'2020-01-02',
          CASE WHEN $3='propuesto' THEN NULL ELSE $2::uuid END,CASE WHEN $3='propuesto' THEN NULL ELSE '2020-01-02'::timestamptz END,
          CASE WHEN $3='propuesto' THEN NULL ELSE 'Decisión histórica HTTP' END,CASE WHEN $3='facturado' THEN 'LEG-CHARGE-'||$4||'-'||n ELSE NULL END,
          CASE WHEN $3='facturado' THEN '2020-01-02'::date ELSE NULL END FROM generate_series(1,$5::int) n`,[service.id,actor.id,status,company,total]);
      }
      const allIds:string[]=[],proposedIds:string[]=[],approvedIds:string[]=[];
      for(let offset=0;offset<500;offset+=100){allIds.push(...(await charges.listExtraCharges(actor,company,"",100,offset)).map(x=>x.id));proposedIds.push(...(await charges.listExtraCharges(actor,company,"propuesto",100,offset)).map(x=>x.id));approvedIds.push(...(await charges.listExtraCharges(actor,company,"aprobado",100,offset)).map(x=>x.id));}
      fixtures[company]={service:service.id,sourceIds:(await charges.serviceExtraCharges(actor,service.id)).map(x=>x.id),allIds,proposedIds,approvedIds};assert.equal(allIds.length,428);assert.equal(proposedIds.length,213);assert.equal(approvedIds.length,205);
    }
    console.log(JSON.stringify({phase:"fixtures",companies:2,chargesPerCompany:428,dayReportsPerService:217}));
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(120000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,{},role);assert.equal(r.status,200,path);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const post=(path:string,data:FormData,role="admin")=>request(actions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
    const form=(body:string,kind:string,id?:string)=>formFrom(body,`data-extra-charge-form="${kind}"`,id);
    const keep=(body:string,kind:string,values:Record<string,string>,id?:string)=>retained(body,`data-extra-charge-form="${kind}"`,values,id);
    const ids=(body:string,attribute:string)=>[...body.matchAll(new RegExp(`${attribute}="([^"]+)"`,"g"))].map(x=>x[1]);
    const hasForm=(body:string,kind:string,id:string)=>(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).some(x=>x.includes(`data-extra-charge-form="${kind}"`)&&x.includes(`data-source-id="${id}"`));
    const status=(body:string,id:string)=>body.match(new RegExp(`data-extra-charge="${id}"[^>]*data-charge-status="([^"]+)"`))?.[1];
    const target=(r:Response,path:string,context:Record<string,string>,id?:string)=>{assert.equal(r.status,303);const url=new URL(r.headers.get("location")!,base);assert.equal(url.pathname,path);for(const [key,value]of Object.entries(context))assert.equal(url.searchParams.get(key),value,key);assert.equal(url.searchParams.get("formulario_cargo"),null);if(id){assert.equal(url.searchParams.get("cargo"),id);assert.equal(url.hash,"#cargo-"+id);}return url.pathname+url.search+url.hash;};
    const clamp=async(path:string,param:string,last:string)=>{const r=await request(path),body=await r.text(),location=r.headers.get("location")??decode(body.match(/<meta\b[^>]*http-equiv="refresh"[^>]*content="[^;]*;url=([^"]*)"/)?.[1]??"");assert.ok(location,"redirect "+path);assert.equal(new URL(location,base).searchParams.get(param),last);};
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
    for(const company of ["rerchar","e_y_j"] as const){
      const fixture=fixtures[company],allIds:string[]=[],sourceIds:string[]=[],proposedIds:string[]=[],approvedIds:string[]=[],servicePath="/solicitudes/"+fixture.service;
      for(let page=1;page<=5;page++){
        allIds.push(...ids(await html(`/cobros-extraordinarios?empresa=${company}&estado=todos&pagina=${page}`),"data-extra-charge"));
        sourceIds.push(...ids(await html(servicePath+"?pagina_cargos="+page),"data-service-extra-charge"));
        if(page<=3){proposedIds.push(...ids(await html(`/cobros-extraordinarios?empresa=${company}&estado=propuestos&pagina=${page}`),"data-extra-charge"));approvedIds.push(...ids(await html(`/cobros-extraordinarios?empresa=${company}&estado=aprobados&pagina=${page}`),"data-extra-charge"));}
      }
      assert.deepEqual(allIds,fixture.allIds);assert.deepEqual(sourceIds,fixture.sourceIds);assert.deepEqual(proposedIds,fixture.proposedIds);assert.deepEqual(approvedIds,fixture.approvedIds);assert.equal(new Set(allIds).size,428);
      await clamp(`/cobros-extraordinarios?empresa=${company}&estado=propuestos&pagina=999`,"pagina","3");await clamp(servicePath+"?pagina_cargos=999","pagina_cargos","5");
      const operations=await html(`/cobros-extraordinarios?empresa=${company}&estado=todos`,"operaciones");assert.ok(!operations.includes('data-extra-charge-form="decide"')&&!operations.includes('data-extra-charge-form="invoice"'));
      console.log(JSON.stringify({phase:"histories",company,board:allIds.length,source:sourceIds.length,stablePagination:true}));
      const proposalRole=company==="rerchar"?"operaciones":"admin",proposalPath=servicePath+"?pagina_cargos=5&formulario_cargo=propose";
      let current=form(await html(proposalPath,proposalRole),"propose");assert.equal((current.form.match(/<option\b/g)||[]).length,221);assert.ok(current.form.includes('value="2020-01-01"'));
      const proposal={submission_key:String(current.data.get("submission_key")),service_day:"2019-12-31",kind:"flete_falso",reason:'Respaldo & acuerdo "cliente"\nSegundo antecedente '+company,amount_clp:"10.25",quote_reference:"COT-HTTP-"+company,client_order_reference:"OC-HTTP-"+company};fill(current.data,proposal);
      let r=await post(proposalPath,current.data,proposalRole);assert.equal(r.status,200);current=keep(clean(await r.text()),"propose",proposal);current.data.set("service_day","2020-01-01");current.data.set("reason","x");r=await post(proposalPath,current.data,proposalRole);assert.equal(r.status,200);current=keep(clean(await r.text()),"propose",{...proposal,service_day:"2020-01-01",reason:"x"});current.data.set("reason",proposal.reason);
      const savedResponse=await post(proposalPath,current.data,proposalRole);assert.equal(savedResponse.status,303);const newId=new URL(savedResponse.headers.get("location")!,base).searchParams.get("cargo")!;assert.match(newId,/^[0-9a-f-]{36}$/);
      const saved=target(savedResponse,servicePath,{pagina_cargos:"5"},newId),savedBody=await html(saved);assert.ok(ids(savedBody,"data-service-extra-charge").includes(newId));assert.ok(savedBody.includes("Cargo seleccionado fuera de esta página"));assert.equal((await html(servicePath)).includes("429</span>"),true);
      const decisionContext={empresa:company,estado:"propuestos",pagina:"3"},boardPath="/cobros-extraordinarios?"+new URLSearchParams(decisionContext),decisionPath=boardPath+"&formulario_cargo=decide&cargo="+newId;
      current=form(await html(decisionPath),"decide",newId);const staleDecision=form(await html(decisionPath),"decide",newId);fill(current.data,{amount_clp:"",decision_note:"Acordado con el cliente HTTP",status:"aprobado"});r=await post(decisionPath,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"decide",{id:newId,amount_clp:"",decision_note:"Acordado con el cliente HTTP",status:"aprobado"},newId);current.data.set("amount_clp","12.75");current.data.set("decision_note","x");r=await post(decisionPath,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"decide",{id:newId,amount_clp:"12.75",decision_note:"x",status:"aprobado"},newId);current.data.set("decision_note","Monto revisado y acordado HTTP");
      const approved=target(await post(decisionPath,current.data),"/cobros-extraordinarios",decisionContext,newId),approvedBody=await html(approved);assert.equal(status(approvedBody,newId),"aprobado");assert.ok(approvedBody.includes("Cargo seleccionado fuera del filtro o página actual"));
      const replay=form(await html(proposalPath,proposalRole),"propose");fill(replay.data,{...proposal,service_day:"2020-01-01"});target(await post(proposalPath,replay.data,proposalRole),servicePath,{pagina_cargos:"5"},newId);replay.data.set("reason","Otro antecedente que no es el original");r=await post(proposalPath,replay.data,proposalRole);assert.equal(r.status,200);keep(clean(await r.text()),"propose",{...proposal,service_day:"2020-01-01",reason:"Otro antecedente que no es el original"});
      fill(staleDecision.data,{status:"aprobado",amount_clp:"10.25",decision_note:"Decisión anterior al cambio de estado"});r=await post(decisionPath,staleDecision.data);assert.equal(r.status,200);assert.ok(keep(clean(await r.text()),"decide",{id:newId,amount_clp:"10.25",decision_note:"Decisión anterior al cambio de estado"},newId).form.includes('disabled=""'));
      const invoiceContext={empresa:company,estado:"aprobados",pagina:"3"},invoicePath="/cobros-extraordinarios?"+new URLSearchParams(invoiceContext)+"&formulario_cargo=invoice&cargo="+newId;current=form(await html(invoicePath),"invoice",newId);
      const invoice={id:newId,invoice_number:"EX-HTTP-"+company,invoiced_on:"2020-01-02",due_on:"2020-01-01",total_clp:"15.17"};fill(current.data,invoice);r=await post(invoicePath,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"invoice",invoice,newId);current.data.set("due_on","2020-02-01");const invoiced=target(await post(invoicePath,current.data),"/cobros-extraordinarios",invoiceContext,newId),invoicedBody=await html(invoiced);assert.equal(status(invoicedBody,newId),"facturado");assert.ok(invoicedBody.includes("Revisar factura y saldo"));assert.ok(!hasForm(invoicedBody,"invoice",newId));
      r=await post(invoicePath,current.data);assert.equal(r.status,200);assert.ok(keep(clean(await r.text()),"invoice",{...invoice,due_on:"2020-02-01"},newId).form.includes('disabled=""'));
      const noCharge=fixture.proposedIds[0],declinePath=boardPath+"&formulario_cargo=decide&cargo="+noCharge;current=form(await html(declinePath),"decide",noCharge);fill(current.data,{status:"descartado",amount_clp:"no se utiliza",decision_note:"x"});r=await post(declinePath,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"decide",{id:noCharge,status:"descartado",amount_clp:"no se utiliza",decision_note:"x"},noCharge);current.data.set("decision_note","Cliente no debe asumir este cobro");const declined=target(await post(declinePath,current.data),"/cobros-extraordinarios",decisionContext,noCharge),declinedBody=await html(declined);assert.equal(status(declinedBody,noCharge),"descartado");assert.ok(declinedBody.includes("Neto propuesto · sin cobro"));assert.ok(!hasForm(declinedBody,"invoice",noCharge));
      const balances=ids(await html(`/cobranzas?empresa=${company}&estado=todas`),"data-receivable-invoice");assert.equal(balances.length,1);assert.equal(ids(await html(servicePath),"data-service-extra-charge").length,100);
      const other=company==="rerchar"?"e_y_j":"rerchar",foreign=await html(`/cobros-extraordinarios?empresa=${other}&estado=todos&origen_cargo=decide&cargo=${newId}`);assert.ok(!ids(foreign,"data-extra-charge").includes(newId));
      for(const role of ["cliente","conductor"]){const response=await request(servicePath,{},role),body=await response.text();assert.ok(response.status===200||response.status===404);assert.ok(!body.includes('data-extra-charge-form=')&&!body.includes('data-service-extra-charge='));}
      outcomes.push({company,threeFormsRetainDrafts:true,noncesRetained:true,replayAfterApprovalSafe:true,staleFormsSafe:true,filterAndPageRetained:true,sourceVisibleAfterApprovalInvoiceDecline:true,oldestPartAvailable:true,invoiceReachesReceivables:true});console.log(JSON.stringify({phase:"forms",company,ok:true}));
    }
    for(const role of ["conductor","cliente",""]){const r=await request("/cobros-extraordinarios",{},role),body=await r.text();assert.ok(r.status>=300&&r.status<400||body.includes("NEXT_REDIRECT"));assert.ok(!body.includes('data-extra-charge='));}
    const result={ok:true,cases:outcomes,historiesPerCompany:{charges:428,dayReports:217},stablePagination:true,rolesRestricted:true,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
