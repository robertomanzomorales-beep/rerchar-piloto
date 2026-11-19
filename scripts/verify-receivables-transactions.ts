import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-receivables-transactions-http-"));
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
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name,email) VALUES('Cliente revisión de cobranzas HTTP','contacto@example.invalid') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena revisión HTTP') RETURNING id",[client.id]),[asset]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES('CAM-COB-HTTP','Camión revisión HTTP','camion') RETURNING id");
    const tokens:Record<string,string>={},users:Record<string,{id:string}>={};
    for(const role of ["admin","operaciones","conductor","cliente"] as const){
      const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id",[role+"@receivables.example.invalid","Revisión "+role,role,client.id]);users[role]=user;
      const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
    }
    const finance=await import("../lib/finance"),charges=await import("../lib/extra-charges"),receivables=await import("../lib/receivables"),transactions=await import("../lib/financial-transactions"),actor={...users.admin,name:"Admin HTTP",email:"admin@receivables.example.invalid",role:"admin" as const,client_id:null};
    const today=receivables.todayChile(),date=new Date(today+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+7);const seven=date.toISOString().slice(0,10);
    const fixtures:Record<string,{decimal:string;voidable:string;staleVoid:string;upcoming:string;tinyService:string;legacy:string;legacyFolio:string;invoices:string[];legacyIds:string[];transactions:string[]}>= {};
    for(const company of ["rerchar","e_y_j"] as const){
      const contract=await finance.createContract(actor,{client_id:client.id,site_id:site.id,operating_company:company,code:"COB-HTTP-"+company,starts_on:"2020-01-01",ends_on:"",notes:""});
      const largeRate=await finance.createTariff(actor,{contract_id:contract,service_type:"retiro",waste_type:"Metal",unit:"servicio",unit_price_clp:"100.25",valid_from:"2020-01-01",valid_until:""}),tinyRate=await finance.createTariff(actor,{contract_id:contract,service_type:"retiro",waste_type:"Pequeño",unit:"servicio",unit_price_clp:"0.25",valid_from:"2020-01-01",valid_until:""});
      const services=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,closed_at,created_by)
        SELECT gen_random_uuid(),$1,$2,$3,'retiro',CASE WHEN n=2 THEN 'Pequeño' ELSE 'Metal' END,'Faena','Patio','completada','2020-01-02T15:00:00Z',$4 FROM generate_series(1,3) n RETURNING id`,[client.id,site.id,company,actor.id]);
      for(let n=0;n<3;n++)await finance.valueService(actor,services[n].id,{tariff_id:n===1?tinyRate:largeRate,client_order_reference:""});
      const largeInvoice=await finance.registerInvoice(actor,services[0].id,{invoice_number:"LARGE-COB-"+company,issued_on:"2020-01-02",due_on:"2020-02-01",total_clp:"100000"}),tinyInvoice=await finance.registerInvoice(actor,services[1].id,{invoice_number:"TINY-COB-"+company,issued_on:"2020-01-02",due_on:"2020-02-01",total_clp:"0.30"}),unverified=await finance.registerInvoice(actor,services[2].id,{invoice_number:"OLD-COB-"+company,issued_on:"2020-01-02",due_on:"2020-02-01",total_clp:"100.25"});
      await db.query("UPDATE service_invoices SET total_verified=false WHERE id=$1",[unverified]);
      await db.query(`INSERT INTO invoice_payments(submission_key,invoice_id,amount_clp,paid_on,method,reference,created_by,created_at)
        SELECT gen_random_uuid(),$1,0.10,'2020-01-02','transferencia','Ingreso histórico HTTP '||n,$2,'2020-01-02' FROM generate_series(1,317) n`,[largeInvoice,actor.id]);
      await finance.registerPayment(actor,tinyInvoice,{submission_key:randomUUID(),amount_clp:"0.10",paid_on:"2020-01-02",method:"transferencia",reference:"Primer abono decimal HTTP"});
      const bulk=await db.query<{id:string}>(`INSERT INTO extra_receivable_invoices(issuer,client_id,invoice_number,issued_on,due_on,total_clp,created_by,created_at)
        SELECT $1,$2,'BULK-COB-'||$1||'-'||lpad(n::text,3,'0'),'2020-01-02','2020-02-01',1000.25,$3,'2020-01-02' FROM generate_series(1,521) n RETURNING id`,[company,client.id,actor.id]);
      await db.query(`INSERT INTO extra_receivable_payments(submission_key,invoice_id,amount_clp,paid_on,reference,created_by,created_at)
        SELECT gen_random_uuid(),$1,0.20,'2020-01-02','Cobro histórico HTTP '||n,$2,'2020-01-02' FROM generate_series(1,211) n`,[bulk[0].id,actor.id]);
      await charges.registerExtraReceivablePayment(actor,bulk[520].id,{submission_key:randomUUID(),amount_clp:"1000.25",paid_on:"2020-01-02",reference:"Factura histórica saldada"});
      const [decimal,upcoming]=await db.query<{id:string}>(`INSERT INTO extra_receivable_invoices(issuer,client_id,invoice_number,issued_on,due_on,total_clp,created_by)
        VALUES($1,$2,'A-DEC-COB-'||$1,'2020-01-02','2020-02-01',0.30,$3),($1,$2,'UPCOMING-COB-'||$1,'2020-01-02',$4,12.25,$3) RETURNING id`,[company,client.id,actor.id,seven]);
      await charges.registerExtraReceivablePayment(actor,decimal.id,{submission_key:randomUUID(),amount_clp:"0.10",paid_on:"2020-01-02",reference:"Primer abono decimal"});
      const [supplier]=await db.query<{id:string}>(`INSERT INTO supplier_invoices(issuer,supplier_tax_id,supplier_name,invoice_number,issued_on,description,total_clp,recorded_by)
        VALUES($1,'RUT-HTTP','Proveedor revisión HTTP','SUPPLIER-COB-'||$1,'2020-01-02','Historial HTTP',100000,$2) RETURNING id`,[company,actor.id]);
      await db.query(`INSERT INTO supplier_invoice_payments(submission_key,invoice_id,amount_clp,paid_on,reference,recorded_by,created_at)
        SELECT gen_random_uuid(),$1,0.25,'2020-01-02','Salida histórica HTTP '||n,$2,'2020-01-02' FROM generate_series(1,239) n`,[supplier.id,actor.id]);
      await db.query("INSERT INTO service_day_reports(service_id,day,asset_id,outcome,observation,recorded_by) VALUES($1,'2020-01-02',$2,'incompleto','Espera documentada HTTP',$3)",[services[0].id,asset.id,actor.id]);
      await db.query(`INSERT INTO service_extra_charges(submission_key,service_id,service_day,kind,reason,source_outcome,source_observation,amount_clp,status,decision_note,invoice_number,invoiced_on,created_by,decided_by,decided_at,created_at)
        SELECT gen_random_uuid(),$1,'2020-01-02','sobrestadia','Espera anterior HTTP '||n,'incompleto','Espera documentada',10,'facturado','Autorizado', 'LEG-COB-'||$3||'-'||n,'2020-01-02',$2,$2,'2020-01-02','2020-01-02' FROM generate_series(1,205) n`,[services[0].id,actor.id,company]);
      const invoiceRows=(await receivables.listReceivablesPage(actor,company,"todas",today,1000,0)).items,legacyRows=[];
      for(let offset=0;offset<300;offset+=100)legacyRows.push(...await receivables.listLegacyReconciliation(actor,company,100,offset));
      const source=legacyRows.find(x=>x.source==="cargo")!;
      fixtures[company]={decimal:decimal.id,voidable:bulk[1].id,staleVoid:bulk[2].id,upcoming:upcoming.id,tinyService:services[1].id,legacy:source.id,legacyFolio:source.invoice_number,invoices:invoiceRows.map(x=>x.id),legacyIds:legacyRows.map(x=>x.id),transactions:(await transactions.listFinancialTransactions(actor,company)).map(x=>x.source+":"+x.id)};
      assert.equal(invoiceRows.length,525);assert.equal(legacyRows.length,206);assert.equal(fixtures[company].transactions.length,770);
    }
    console.log(JSON.stringify({phase:"fixtures",companies:2,invoicesPerCompany:525,legacyPerCompany:206,transactionsPerCompany:770}));
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(120000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,{},role);assert.equal(r.status,200);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const post=(path:string,data:FormData,role="admin")=>request(actions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
    const form=(body:string,kind:string,id:string)=>formFrom(body,`data-receivable-form="${kind}"`,id);
    const keep=(body:string,kind:string,values:Record<string,string>,id:string)=>retained(body,`data-receivable-form="${kind}"`,values,id);
    const ids=(body:string,attribute:string)=>[...body.matchAll(new RegExp(`${attribute}="([^"]+)"`,"g"))].map(x=>x[1]);
    const hasForm=(body:string,kind:string,id:string)=>(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).some(x=>x.includes(`data-receivable-form="${kind}"`)&&x.includes(`data-source-id="${id}"`));
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
    for(const company of ["rerchar","e_y_j"] as const){
      const fixture=fixtures[company],invoiceIds:string[]=[],legacyIds:string[]=[],transactionIds:string[]=[];
      for(let page=1;page<=8;page++){
        const body=await html(`/transacciones?empresa=${company}&pagina=${page}`);transactionIds.push(...ids(body,"data-financial-transaction"));assert.ok(body.includes("1.074,35"));assert.ok(body.includes("59,75"));
        if(page<=6)invoiceIds.push(...ids(await html(`/cobranzas?empresa=${company}&estado=todas&pagina=${page}`),"data-receivable-invoice"));
        if(page<=3)legacyIds.push(...ids(await html(`/cobranzas?empresa=${company}&estado=conciliar&pagina=${page}`),"data-reconciliation-record"));
      }
      assert.deepEqual(invoiceIds,fixture.invoices);assert.deepEqual(legacyIds,fixture.legacyIds);assert.deepEqual(transactionIds,fixture.transactions);assert.equal(new Set(transactionIds).size,770);
      const paid=await html(`/cobranzas?empresa=${company}&estado=pagadas`),upcoming=await html(`/cobranzas?empresa=${company}&estado=proximas`);assert.equal(ids(paid,"data-receivable-invoice").length,1);assert.deepEqual(ids(upcoming,"data-receivable-invoice"),[fixture.upcoming]);
      const incoming=await html(`/transacciones?empresa=${company}&tipo=entrada&pagina=6`),outgoing=await html(`/transacciones?empresa=${company}&tipo=salida&pagina=3`);assert.equal(ids(incoming,"data-financial-transaction").length,31);assert.equal(ids(outgoing,"data-financial-transaction").length,39);
      const csvResponse=await request(`/api/cobranzas/exportar?empresa=${company}&estado=todas`);assert.equal(csvResponse.status,200);const csv=await csvResponse.text();assert.equal(csv.trim().split("\r\n").length,526);assert.ok(csv.includes(company==="rerchar"?'"RERCHAR";':'"E y J";'));
      console.log(JSON.stringify({phase:"histories",company,rows:770,csvInvoices:525}));
      const context={empresa:company,estado:"pendientes",pagina:"6"},path="/cobranzas?"+new URLSearchParams(context),edit=(kind:string,id:string)=>path+"&formulario="+kind+"&registro="+id;
      const target=(r:Response,id:string,expected=context)=>{assert.equal(r.status,303);const url=new URL(r.headers.get("location")!,base);assert.equal(url.pathname,"/cobranzas");for(const [key,value]of Object.entries(expected))if(key!=="pagina"||value!=="1")assert.equal(url.searchParams.get(key),value,key);assert.equal(url.searchParams.get("registro"),id);assert.equal(url.searchParams.get("formulario"),null);return url.pathname+url.search+url.hash;};
      const paymentPath=edit("payment",fixture.decimal);let current=form(await html(paymentPath),"payment",fixture.decimal),stale=form(await html(paymentPath),"payment",fixture.decimal);assert.ok(current.form.match(/<input\b(?=[^>]*name="amount_clp")(?=[^>]*max="0.2")[^>]*>/));
      const values={invoice_id:fixture.decimal,submission_key:String(current.data.get("submission_key")),amount_clp:"1.25",paid_on:"2020-01-02",reference:"Abono & respaldo "+company};fill(current.data,values);let r=await post(paymentPath,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"payment",values,fixture.decimal);current.data.set("amount_clp","0.20");current.data.set("paid_on","2099-01-01");r=await post(paymentPath,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"payment",{...values,amount_clp:"0.20",paid_on:"2099-01-01"},fixture.decimal);current.data.set("paid_on","2020-01-02");const saved=target(await post(paymentPath,current.data),fixture.decimal),savedBody=await html(saved);assert.ok(savedBody.includes('data-receivable-status="Pagada"'));assert.ok(savedBody.includes("Factura seleccionada fuera del filtro o página actual"));target(await post(paymentPath,current.data),fixture.decimal);current.data.set("reference","Otro respaldo distinto");r=await post(paymentPath,current.data);assert.equal(r.status,200);keep(clean(await r.text()),"payment",{...values,amount_clp:"0.20",reference:"Otro respaldo distinto"},fixture.decimal);
      fill(stale.data,{amount_clp:"0.20",paid_on:"2020-01-02",reference:"Formulario anterior al saldo final"});r=await post(paymentPath,stale.data);assert.equal(r.status,200);const staleBody=clean(await r.text());assert.ok(keep(staleBody,"payment",{amount_clp:"0.20",reference:"Formulario anterior al saldo final",submission_key:String(stale.data.get("submission_key"))},fixture.decimal).form.includes('disabled=""'));
      const voidPath=edit("void",fixture.voidable);current=form(await html(voidPath),"void",fixture.voidable);fill(current.data,{reason:"x"});r=await post(voidPath,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"void",{invoice_id:fixture.voidable,reason:"x"},fixture.voidable);current.data.set("reason","Folio registrado por error y revisado");const voided=target(await post(voidPath,current.data),fixture.voidable),voidedBody=await html(voided);assert.ok(voidedBody.includes('data-receivable-status="Anulada"'));assert.ok(!hasForm(voidedBody,"payment",fixture.voidable)&&!hasForm(voidedBody,"void",fixture.voidable));
      const staleVoidPath=edit("void",fixture.staleVoid),beforePayment=form(await html(staleVoidPath),"void",fixture.staleVoid),newPaymentPath=edit("payment",fixture.staleVoid),newPayment=form(await html(newPaymentPath),"payment",fixture.staleVoid);fill(newPayment.data,{amount_clp:"0.25",paid_on:"2020-01-02",reference:"Abono previo a revisión de anulación"});target(await post(newPaymentPath,newPayment.data),fixture.staleVoid);beforePayment.data.set("reason","Revisión con abono registrado después");r=await post(staleVoidPath,beforePayment.data);assert.equal(r.status,200);assert.ok(keep(clean(await r.text()),"void",{invoice_id:fixture.staleVoid,reason:"Revisión con abono registrado después"},fixture.staleVoid).form.includes('disabled=""'));
      const legacyContext={empresa:company,estado:"conciliar",pagina:"3"},legacyPath="/cobranzas?"+new URLSearchParams(legacyContext)+"&formulario=reconcile&registro="+fixture.legacy;current=form(await html(legacyPath),"reconcile",fixture.legacy);const reconcileValues={id:fixture.legacy,invoice_number:fixture.legacyFolio,invoiced_on:"2020-01-02",due_on:"2020-01-01",total_clp:"12.25"};fill(current.data,reconcileValues);r=await post(legacyPath,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"reconcile",reconcileValues,fixture.legacy);current.data.set("due_on","2020-02-01");const reconciled=target(await post(legacyPath,current.data),fixture.legacy,legacyContext),reconciledBody=await html(reconciled);assert.ok(reconciledBody.includes("Factura conciliada"));assert.ok(reconciledBody.includes("Registro seleccionado fuera de la cola o página actual"));assert.ok(!hasForm(reconciledBody,"reconcile",fixture.legacy));
      const tinyPath="/finanzas/"+fixture.tinyService,tinyForm=formFrom(await html(tinyPath),'data-financial-form="payment"');assert.ok(tinyForm.form.match(/<input\b(?=[^>]*name="amount_clp")(?=[^>]*max="0.2")[^>]*>/));fill(tinyForm.data,{amount_clp:"0.20",paid_on:"2020-01-02",reference:"Saldo exacto en ficha financiera"});assert.equal((await post(tinyPath,tinyForm.data)).status,303);assert.ok(!(await html(tinyPath)).includes('data-financial-form="payment"'));
      outcomes.push({company,threeFormsRetainDrafts:true,noncesRetained:true,changedPayloadRejected:true,staleFormsSafe:true,filterAndPageRetained:true,sourceVisibleAfterPaidVoidReconcile:true,exactCents:true});console.log(JSON.stringify({phase:"forms",company,ok:true}));
    }
    for(const path of ["/cobranzas","/transacciones"]){for(const role of ["operaciones","conductor","cliente",""]){const r=await request(path,{},role),body=await r.text();assert.ok(r.status>=300&&r.status<400||body.includes("NEXT_REDIRECT"));assert.ok(!body.includes("data-receivable-invoice")&&!body.includes("data-financial-transaction"));}}
    const result={ok:true,cases:outcomes,historiesPerCompany:{invoices:525,reconciliation:206,transactions:770},csvBeyond500:true,completeTotals:true,stablePagination:true,rolesRestricted:true,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
