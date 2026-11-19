import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-financial-detail-http-"));
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
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name,email) VALUES('Cliente de revisión financiera HTTP','contacto@example.invalid') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena de revisión HTTP') RETURNING id",[client.id]);
    const tokens:Record<string,string>={},users:Record<string,{id:string}>={};
    for(const role of ["admin","operaciones","conductor","cliente"] as const){
      const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id",[role+"@detail.example.invalid","Revisión "+role,role,client.id]);users[role]=user;
      const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
    }
    const finance=await import("../lib/finance"),actor={...users.admin,name:"Admin HTTP",email:"admin@detail.example.invalid",role:"admin" as const,client_id:null};
    const fixtures:Record<string,{fresh:string;history:string;open:string;invoice:string;tariff:string;costs:string[];payments:string[];voided:string[]}>= {};
    for(const company of ["rerchar","e_y_j"]){
      const material="Metal HTTP "+company,contract=await finance.createContract(actor,{client_id:client.id,site_id:site.id,operating_company:company,code:"HTTP-DET-"+company,starts_on:"2020-01-01",ends_on:"",notes:""});
      const tariff=await finance.createTariff(actor,{contract_id:contract,service_type:"retiro",waste_type:material,unit:"servicio",unit_price_clp:"1000.50",valid_from:"2020-01-01",valid_until:""});
      const services=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,closed_at,created_by)
        SELECT gen_random_uuid(),$1,$2,$3,'retiro',$4,'Faena','Patio','completada','2020-02-01T15:00:00Z',$5 FROM generate_series(1,3) n RETURNING id`,[client.id,site.id,company,material,actor.id]);
      const valuation=await finance.valueService(actor,services[1].id,{tariff_id:tariff,client_order_reference:"OC-ANTERIOR"});
      const invoice=await finance.registerInvoice(actor,services[1].id,{invoice_number:"HTTP-HIST-"+company,issued_on:"2020-02-01",due_on:"2020-03-01",total_clp:"10000.25"});
      await db.query("UPDATE service_invoices SET total_verified=false WHERE id=$1",[invoice]);
      await db.query(`INSERT INTO service_costs(submission_key,service_id,category,amount_clp,description,created_by,created_at)
        SELECT gen_random_uuid(),$1,'peajes',0.10,'Costo histórico HTTP '||n,$2,'2020-02-01' FROM generate_series(1,217) n`,[services[1].id,actor.id]);
      await db.query(`INSERT INTO invoice_payments(submission_key,invoice_id,amount_clp,paid_on,method,reference,created_by,created_at)
        SELECT gen_random_uuid(),$1,0.25,'2020-02-01','transferencia','Abono histórico HTTP '||n,$2,'2020-02-01' FROM generate_series(1,213) n`,[invoice,actor.id]);
      await db.query(`INSERT INTO service_invoices(valuation_id,invoice_number,issued_on,due_on,total_clp,status,created_by,created_at)
        SELECT $1,$3||'-ANULADA-HTTP-'||n,'2020-01-01','2020-02-01',1,'anulada',$2,'2020-01-01' FROM generate_series(1,207) n`,[valuation,actor.id,company]);
      await db.query("UPDATE service_requests SET status='solicitada' WHERE id=$1",[services[2].id]);
      const data=await finance.getFinancialService(actor,services[1].id);fixtures[company]={fresh:services[0].id,history:services[1].id,open:services[2].id,invoice,tariff,costs:data.costs.map(x=>x.id),payments:data.payments.map(x=>x.id),voided:data.voidedInvoices.map(x=>x.id)};
    }
    console.log(JSON.stringify({phase:"fixtures",bothCompanies:true,costs:217,payments:213,voided:207}));
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(120000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,{},role);assert.equal(r.status,200);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const post=(path:string,data:FormData,role="admin")=>request(actions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
    const form=(body:string,kind:string)=>formFrom(body,`data-financial-form="${kind}"`);
    const keep=(body:string,kind:string,values:Record<string,string>)=>retained(body,`data-financial-form="${kind}"`,values);
    const ids=(body:string,attribute:string)=>[...body.matchAll(new RegExp(`${attribute}="([^"]+)"`,"g"))].map(x=>x[1]);
    const hasForm=(body:string,kind:string)=>body.includes(`data-financial-form="${kind}"`);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
    for(const company of ["rerchar","e_y_j"]){
      const fixture=fixtures[company],path="/finanzas/"+fixture.fresh,histBase="/finanzas/"+fixture.history,context={pagina_costos:"3",pagina_abonos:"3",pagina_anuladas:"3"},hist=histBase+"?"+new URLSearchParams(context);
      const target=(r:Response,expectedPath:string,anchor:string,retainPages=false)=>{assert.equal(r.status,303);const url=new URL(r.headers.get("location")!,base);assert.equal(url.pathname,expectedPath);assert.equal(url.hash,"#"+anchor);assert.equal(url.searchParams.get("formulario"),null);if(retainPages)for(const [key,value]of Object.entries(context))assert.equal(url.searchParams.get(key),value,key);return url.pathname+url.search+url.hash;};
      const costIds:string[]=[],paymentIds:string[]=[],voidIds:string[]=[];
      for(let page=1;page<=3;page++){const body=await html(histBase+`?pagina_costos=${page}&pagina_abonos=${page}&pagina_anuladas=${page}`);costIds.push(...ids(body,"data-financial-cost"));paymentIds.push(...ids(body,"data-financial-payment"));voidIds.push(...ids(body,"data-financial-voided"));assert.ok(body.includes('data-financial-invoice-state="unconfirmed"'));assert.ok(/data-financial-balance[^>]*>Por confirmar</.test(body));assert.ok(!hasForm(body,"payment"));}
      assert.deepEqual(costIds,fixture.costs);assert.deepEqual(paymentIds,fixture.payments);assert.deepEqual(voidIds,fixture.voided);
      let current=form(await html(path),"value"),values={tariff_id:fixtures[company==="rerchar"?"e_y_j":"rerchar"].tariff,client_order_reference:"OC & HTTP "+company};fill(current.data,values);let r=await post(path,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"value",values);current.data.set("tariff_id",fixture.tariff);let saved=target(await post(path,current.data),path,"tarifa-servicio");assert.ok((await html(saved)).includes("1.000,5"));
      current=form(await html(path),"reference");const reference={client_order_reference:"OC-CORREGIDA-"+company,reason:"x"};fill(current.data,reference);r=await post(path,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"reference",reference);current.data.set("reason","Referencia corregida contra respaldo");target(await post(path,current.data),path,"referencia-cliente");
      current=form(await html(path),"invoice");const invoice={invoice_number:"HTTP-NUEVA-"+company,issued_on:"2020-02-01",due_on:"2020-01-01",total_clp:"1190.75"};fill(current.data,invoice);r=await post(path,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"invoice",invoice);current.data.set("due_on","2020-03-01");target(await post(path,current.data),path,"factura-servicio");
      current=form(await html(path),"void");const sourceInvoice=String(current.data.get("invoice_id")),voidValues={invoice_id:sourceInvoice,reason:"x"};fill(current.data,voidValues);r=await post(path,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"void",voidValues);current.data.set("reason","Documento anulado antes del primer cobro");target(await post(path,current.data),path,"factura-servicio");assert.ok((await html(path)).includes("Facturas anuladas"));
      const staleVoid=await html(path+"?formulario=void&factura="+sourceInvoice);assert.ok(form(staleVoid,"void").form.includes('disabled=""'));assert.equal(form(staleVoid,"void").data.get("invoice_id"),sourceInvoice);
      current=form(await html(hist),"confirm");const confirm={invoice_id:fixture.invoice,total_clp:"1.25",reason:"Total revisado & documentado\ncontra factura"};fill(current.data,confirm);r=await post(hist,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"confirm",confirm);current.data.set("total_clp","10000.25");target(await post(hist,current.data),histBase,"factura-servicio",true);assert.ok((await html(hist)).includes('data-financial-invoice-state="confirmed"'));
      current=form(await html(hist),"payment");const nonce=String(current.data.get("submission_key")),payment={invoice_id:fixture.invoice,submission_key:nonce,amount_clp:"999999",paid_on:"2020-02-01",method:"efectivo",reference:"Comprobante & HTTP "+company};fill(current.data,payment);r=await post(hist,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"payment",payment);current.data.set("paid_on","2099-01-01");current.data.set("amount_clp","1.25");r=await post(hist,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"payment",{...payment,amount_clp:"1.25",paid_on:"2099-01-01"});current.data.set("paid_on","2020-02-01");const postedPayment=target(await post(hist,current.data),histBase,"historial-abonos",true);assert.ok((await html(postedPayment)).includes("Abono seleccionado fuera de esta página"));target(await post(hist,current.data),histBase,"historial-abonos",true);current.data.set("amount_clp","1.50");r=await post(hist,current.data);assert.equal(r.status,200);let body=clean(await r.text());assert.ok(body.includes("ya registró un abono con otros datos"));keep(body,"payment",{...payment,amount_clp:"1.50"});
      current=form(await html(hist),"cost");const cost={submission_key:String(current.data.get("submission_key")),category:"otros",amount_clp:"0",description:"Costo & detalle\nconservado "+company};fill(current.data,cost);r=await post(hist,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"cost",cost);current.data.set("amount_clp","10.25");const postedCost=target(await post(hist,current.data),histBase,"historial-costos",true);assert.ok((await html(postedCost)).includes("Costo seleccionado fuera de esta página"));target(await post(hist,current.data),histBase,"historial-costos",true);current.data.set("description","Registro de otro costo distinto");r=await post(hist,current.data);assert.equal(r.status,200);body=clean(await r.text());assert.ok(body.includes("ya registró un costo con otros datos"));keep(body,"cost",{...cost,amount_clp:"10.25",description:"Registro de otro costo distinto"});
      const stale=form(await html(hist),"payment"),closer=form(await html(hist),"payment"),maximum=closer.form.match(/<input\b(?=[^>]*name="amount_clp")(?=[^>]*max="([^"]+)")[^>]*>/)?.[1];assert.ok(maximum);fill(closer.data,{amount_clp:maximum,paid_on:"2020-02-01",reference:"Saldo final de factura HTTP"});target(await post(hist,closer.data),histBase,"historial-abonos",true);fill(stale.data,{amount_clp:"1",paid_on:"2020-02-01",reference:"Formulario anterior al saldo final"});r=await post(hist,stale.data);assert.equal(r.status,200);body=clean(await r.text());const retainedStale=keep(body,"payment",{amount_clp:"1",reference:"Formulario anterior al saldo final",submission_key:String(stale.data.get("submission_key"))});assert.ok(retainedStale.form.includes('disabled=""'));assert.ok(!hasForm(await html(hist),"payment"));
      const open=await html("/finanzas/"+fixture.open);assert.ok(form(open,"value").form.includes('disabled=""'));assert.ok(form(open,"invoice").form.includes('disabled=""'));assert.ok(form(open,"cost").form.includes('disabled=""'));
      for(const role of ["operaciones","conductor","cliente",""]){const denied=await request(hist,{},role),body=await denied.text();assert.ok(denied.status>=300&&denied.status<400||body.includes("NEXT_REDIRECT"));assert.ok(!body.includes("data-financial-form"));}
      outcomes.push({company,sevenFormsRetainDrafts:true,historyPagesPreserved:true,exactRetriesSafe:true,changedPayloadRejected:true,stalePaidFormRetained:true,unconfirmedBalanceProtected:true});console.log(JSON.stringify({phase:"forms",company,ok:true}));
    }
    const result={ok:true,cases:outcomes,historiesPerCompany:{costs:217,payments:213,voided:207},stablePagination:true,sevenForms:true,noncesRetained:true,rolesRestricted:true,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
