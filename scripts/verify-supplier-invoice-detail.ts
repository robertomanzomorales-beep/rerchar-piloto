import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PDFDocument} from "pdf-lib";

async function main(){
 const work=await mkdtemp(join(tmpdir(),"rerchar-supplier-detail-http-"));
 Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
 const {db,transaction}=await import("../lib/db");
 let server:ChildProcess|undefined,logs="";
 const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
 const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
 const actionPaths=new WeakMap<FormData,string>();
 function form(body:string,kind:string,transferId=""){
  const forms=body.match(/<form\b[\s\S]*?<\/form>/g)||[];
  const text=forms.find(x=>x.includes(`data-supplier-invoice-form="${kind}"`)&&(!transferId||x.includes(`data-transfer-id="${transferId}"`)));assert.ok(text,kind+":"+transferId);
  const data=new FormData();
  for(const tag of text.match(/<input\b[^>]*>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name&&!tag.includes('type="file"'))data.set(decode(name),decode(tag.match(/\bvalue="([^"]*)"/)?.[1]||""));}
  for(const tag of text.match(/<select\b[\s\S]*?<\/select>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name){const options=tag.match(/<option\b[^>]*>/g)||[],selected=options.find(x=>x.includes('selected=""'))??options[0];data.set(name,decode(selected?.match(/\bvalue="([^"]*)"/)?.[1]??""));}}
  for(const tag of text.match(/<textarea\b[\s\S]*?<\/textarea>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(name,decode(tag.slice(tag.indexOf(">")+1,tag.indexOf("</textarea>"))));}
  actionPaths.set(data,decode(text.match(/\baction="([^"]*)"/)?.[1]||""));return {text,data};
 }
 const fill=(data:FormData,values:Record<string,string>)=>{for(const[k,v]of Object.entries(values))data.set(k,v);};
 const keep=(body:string,kind:string,values:Record<string,string>,id="")=>{const result=form(body,kind,id);for(const[k,v]of Object.entries(values))assert.equal(String(result.data.get(k)??""),v,kind+":"+k);assert.match(result.text,/Los datos ingresados se conservan/);return result;};
 const has=(body:string,kind:string)=>body.includes(`data-supplier-invoice-form="${kind}"`);
 const transferIds=(body:string)=>[...body.matchAll(/data-supplier-transfer="([^"]+)"/g)].map(x=>x[1]);
 const status=(body:string,id:string)=>body.match(new RegExp(`data-supplier-transfer="${id}"[^>]*data-transfer-status="([^"]+)"`))?.[1];
 try{
  for(const name of (await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
   const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente sintético HTTP') RETURNING id");
  const actors:Record<string,{id:string;name:string;email:string;role:"admin"|"operaciones"|"conductor"|"cliente";client_id:string|null}>={},tokens:Record<string,string>={};
  for(const [key,role]of [["requester","admin"],["reviewer","admin"],["operaciones","operaciones"],["conductor","conductor"],["cliente","cliente"]] as const){
   const [user]=await db.query<{id:string;name:string;email:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id,name,email",[key+"@supplier.example.invalid","Revisión "+key,role,client.id]);actors[key]={...user,role,client_id:role==="cliente"?client.id:null};
   const token=randomBytes(32).toString("hex");tokens[key]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
  }
  const [profile]=await db.query<{id:string}>(`INSERT INTO counterparty_profiles(kind,legal_name,tax_id,business_activity,legal_address,locality,phone,general_email,tax_status,legal_representative,invoice_email,payment_terms,bank_name,account_type,account_number,account_holder,account_holder_tax_id,proof_email,status,created_by,updated_by)
   VALUES('proveedor','Proveedor sintético HTTP','76347909-9','Insumos','Dirección sintética','Calama','0000','proveedor@example.invalid','afecto','Contacto de prueba','facturas@example.invalid','30','BANCO-SOLO-FIXTURE','corriente','CUENTA-SOLO-FIXTURE-9876','Proveedor sintético HTTP','76347909-9','pagos@example.invalid','verificada',$1,$1) RETURNING id`,[actors.requester.id]);
  const supply=await import("../lib/supply"),invoices=await import("../lib/supplier-invoices");
  const warehouse=await supply.createWarehouse(actors.requester,{code:"DET-BOD",name:"Bodega sintética HTTP"});
  const item=await supply.createStockItem(actors.requester,{code:"DET-ART",name:"Artículo sintético HTTP",unit:"un",minimum_qty:"0"});
  const fixtures:Record<string,{invoiceId:string;purchaseId:string;order:string}>={};
  for(const company of ["rerchar","e_y_j"] as const){
   const purchaseId=await supply.createPurchase(actors.requester,{submission_key:randomUUID(),title:"Compra sintética "+company,category:"insumos",priority:"normal",item_id:item,quantity:"2",notes:"Revisión aislada"});
   await supply.approvePurchase(actors.reviewer,purchaseId);const line=(await supply.getPurchase(actors.requester,purchaseId)).lines[0];
   await supply.savePurchaseDraft(actors.requester,purchaseId,{supplier_profile_id:profile.id,supplier:"",supplier_tax_id:"",supplier_address:"",payment_terms:"",issuer:company,expected_date:"",vat_rate:"0.19",prices:{[line.id]:"500"},discounts:{}});
   await supply.issuePurchaseDraft(actors.reviewer,purchaseId,"EMITIR");const order=(await supply.getPurchase(actors.requester,purchaseId)).purchase.order_reference!;
   const receipt={submission_key:randomUUID(),line_id:line.id,warehouse_id:warehouse,quantity:"1",guide_number:"GUIA-HTTP-"+company,invoice_number:"",payment_status:"pendiente",without_order:false};
   const first=await supply.receivePurchase(actors.requester,purchaseId,receipt);assert.equal(await supply.receivePurchase(actors.requester,purchaseId,receipt),first);
   await supply.receivePurchase(actors.requester,purchaseId,{...receipt,submission_key:randomUUID()});assert.equal((await supply.getPurchase(actors.requester,purchaseId)).purchase.status,"recibida");
   const invoiceId=await invoices.createSupplierInvoice(actors.requester,{issuer:company,purchase_id:purchaseId,supplier_tax_id:"",supplier_name:"",invoice_number:"INV-HTTP-"+company,issued_on:"2026-10-01",due_on:"2026-11-01",description:"Factura sintética vinculada a OC",net_clp:"1000",vat_clp:"190",total_clp:"1190"});fixtures[company]={invoiceId,purchaseId,order};
  }
  const nightInvoice=await invoices.createSupplierInvoice(actors.requester,{issuer:"e_y_j",supplier_profile_id:profile.id,supplier_tax_id:"",supplier_name:"",invoice_number:"INV-HTTP-HORA",issued_on:"2026-10-01",description:"Verificación de fecha de Chile",total_clp:"1"});
  await db.query(`INSERT INTO supplier_transfer_requests(submission_key,invoice_id,amount_clp,bank_name,account_type,account_number,requested_by,status,approved_by,created_at,approved_at,decision_note)
   VALUES(gen_random_uuid(),$1,1,'BANCO-SOLO-FIXTURE','corriente','CUENTA-SOLO-FIXTURE-9876',$2,'rechazada',$3,'2026-11-19T02:30:00Z','2026-11-19T03:30:00Z','No se ejecutó')`,[nightInvoice,actors.requester.id,actors.reviewer.id]);
  const pdf=await PDFDocument.create();pdf.addPage().drawText("Documento sintetico para revision HTTP");const pdfBytes=Buffer.from(await pdf.save());
  await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
  const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
  const request=(path:string,options:RequestInit={},role="requester")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
  const html=async(path:string,role="requester")=>{const r=await request(path,{},role);assert.equal(r.status,200,path);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
  const post=(path:string,data:FormData,role="requester")=>request(actionPaths.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
  const target=(r:Response,path:string,anchor:string)=>{assert.equal(r.status,303);const u=new URL(r.headers.get("location")!,base);assert.equal(u.pathname,path);assert.equal(u.searchParams.get("ok"),"1");assert.equal(u.searchParams.get("formulario"),null);assert.equal(u.hash,"#"+anchor);return u.pathname+u.search+u.hash;};
  const fail=async(path:string,current:{data:FormData},kind:string,values:Record<string,string>,role="requester",id="")=>{fill(current.data,values);const r=await post(path,current.data,role);assert.equal(r.status,200,kind);return keep(clean(await r.text()),kind,values,id);};
  const file=(name="factura sintetica.pdf")=>new File([pdfBytes],name,{type:"application/pdf"});
  await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
  const outcomes=[];
  for(const company of ["rerchar","e_y_j"] as const){
   const fixture=fixtures[company],path="/facturas-recibidas/"+fixture.invoiceId;let body=await html(path);
   assert.ok(body.includes(`href="/facturas-recibidas?empresa=${company}"`));assert.ok(body.includes(fixture.order));assert.ok(body.includes(`href="/compras/${fixture.purchaseId}"`));assert.ok(!body.includes("CUENTA-SOLO-FIXTURE-9876"));
   const purchase=await html("/compras/"+fixture.purchaseId),order=await html("/compras/"+fixture.purchaseId+"/orden");assert.ok(purchase.includes(fixture.order)&&order.includes(fixture.order));assert.match(order,/1\.190/);
   let current=form(body,"due");const due={due_on:"2026-09-30",reason:'Corrección <documentada> & confirmada "HTTP"'};current=await fail(path,current,"due",due);fill(current.data,{due_on:"2026-12-01"});target(await post(path,current.data),path,"vencimiento-factura");assert.match(await html(path),/2026-12-01/);
   current=form(await html(path),"review");current=await fail(path,current,"review",{decision:"disputada",note:"x"});current=await fail(path,current,"review",{decision:"aceptada",note:'Factura <original> & monto "contrastados"'},"reviewer");assert.match(current.text,/factura original/);
   current=form(await html(path),"attachment");current.data.set("kind","comprobante");current.data.set("file",new File(["archivo invalido"],"invalido.pdf",{type:"application/pdf"}));let r=await post(path,current.data);assert.equal(r.status,200);current=keep(clean(await r.text()),"attachment",{kind:"comprobante"});assert.match(current.text,/Vuelva a seleccionar el archivo/);
   current.data.set("kind","factura");current.data.set("file",file());target(await post(path,current.data),path,"adjuntar-factura");body=await html(path);const document=body.match(/href="(\/api\/archivos-operacion\/[^\"]+)"/)?.[1];assert.ok(document);const download=await request(document);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdfBytes);
   current=form(await html(path,"reviewer"),"review");fill(current.data,{decision:"aceptada",note:'Factura <original> & monto "contrastados"'});target(await post(path,current.data,"reviewer"),path,"revision-factura");
   body=await html(path);const manualBefore=form(body,"payment");current=form(body,"request");const nonce=String(current.data.get("submission_key"));current=await fail(path,current,"request",{submission_key:nonce,amount_clp:"1190.01"});current.data.set("amount_clp","600.10");target(await post(path,current.data),path,"transferencias");target(await post(path,current.data),path,"transferencias");
   body=await html(path);assert.equal(transferIds(body).length,1);const transferId=transferIds(body)[0];assert.equal(status(body,transferId),"solicitada");
   const blockedManual={submission_key:String(manualBefore.data.get("submission_key")),amount_clp:"100",paid_on:"2026-10-13",reference:'Respaldo <manual> & "HTTP"'};const blocked=await fail(path,manualBefore,"payment",blockedManual);assert.match(blocked.text,/transferencias pendientes/);assert.match(blocked.text,/disabled/);
   current=form(await html(path,"reviewer"),"approve",transferId);fill(current.data,{note:'Revisión <aprobada> & "HTTP"'});const staleApproval=current;target(await post(path,current.data,"reviewer"),path,"transferencia-"+transferId);
   r=await post(path,staleApproval.data,"reviewer");assert.equal(r.status,200);const stale=keep(clean(await r.text()),"approve",{note:'Revisión <aprobada> & "HTTP"'},transferId);assert.match(stale.text,/ya fue resuelta/);assert.match(stale.text,/disabled/);
   body=await html(path);current=form(body,"execute",transferId);current.data.set("proof",file("comprobante.pdf"));const execution={paid_on:"2099-01-01",bank_reference:'BANCO-HTTP & "'+company+'"'};current=await fail(path,current,"execute",execution,"requester",transferId);assert.match(current.text,/fecha futura/);assert.match(current.text,/Vuelva a seleccionar el archivo/);
   current.data.set("paid_on","2026-10-13");current.data.set("proof",file("comprobante.pdf"));target(await post(path,current.data),path,"transferencia-"+transferId);body=await html(path);assert.equal(status(body,transferId),"ejecutada");assert.ok(body.includes("Sin pagos registrados."));assert.ok(!has(body,"verify"));
   current=form(await html(path,"reviewer"),"verify",transferId);const checked={checked_amount_clp:"600.10",checked_reference:"INCORRECTA",verification_note:'Comprobante <revisado> & monto "HTTP"'};current=await fail(path,current,"verify",checked,"reviewer",transferId);assert.match(current.text,/no coinciden/);current.data.set("checked_reference",execution.bank_reference);target(await post(path,current.data,"reviewer"),path,"transferencia-"+transferId);target(await post(path,current.data,"reviewer"),path,"transferencia-"+transferId);
   body=await html(path);assert.equal(status(body,transferId),"verificada");assert.ok(body.includes("600,1")&&body.includes("589,9"));
   const proof=await request("/api/transferencias/"+transferId+"/comprobante");assert.equal(proof.status,200);assert.deepEqual(Buffer.from(await proof.arrayBuffer()),pdfBytes);assert.match(proof.headers.get("cache-control")||"",/private|no-store/);
   current=form(body,"request");current.data.set("amount_clp","100");target(await post(path,current.data),path,"transferencias");body=await html(path,"reviewer");const rejectedId=transferIds(body).find(id=>id!==transferId)!;assert.ok(rejectedId);current=form(body,"reject",rejectedId);current=await fail(path,current,"reject",{note:"x"},"reviewer",rejectedId);current.data.set("note",'Solicitud duplicada <descartada> & "HTTP"');target(await post(path,current.data,"reviewer"),path,"transferencia-"+rejectedId);assert.equal(status(await html(path),rejectedId),"rechazada");
   current=form(await html(path),"payment");const manual={submission_key:String(current.data.get("submission_key")),amount_clp:"589.91",paid_on:"2026-10-14",reference:'Saldo <manual> & "HTTP"'};current=await fail(path,current,"payment",manual);assert.match(current.text,/supera el saldo/);current.data.set("amount_clp","589.90");target(await post(path,current.data),path,"pago-manual");target(await post(path,current.data),path,"pago-manual");body=await html(path);assert.ok(!has(body,"payment")&&!has(body,"request"));assert.match(body,/La factura no tiene saldo pendiente/);
   for(const role of ["operaciones","conductor","cliente",""]){const denied=await request(path,{},role),content=await denied.text();assert.ok(denied.status===404||denied.status===303||denied.status===307||content.includes("NEXT_HTTP_ERROR_FALLBACK;404")||content.includes("NEXT_REDIRECT"));assert.ok(!has(content,"due"));const deniedFile=await request(document,{},role);assert.notEqual(deniedFile.status,200);const deniedProof=await request("/api/transferencias/"+transferId+"/comprobante",{},role);assert.notEqual(deniedProof.status,200);}
   const adminForm=form(await html(path),"due");fill(adminForm.data,{due_on:"2026-12-02",reason:"Prueba de permiso administrativo"});const deniedPost=await post(path,adminForm.data,"operaciones");assert.equal(deniedPost.status,200);assert.match(await deniedPost.text(),/de administración/);
   outcomes.push({company,invoiceId:fixture.invoiceId,purchaseId:fixture.purchaseId,order:fixture.order,transferId,rejectedId,formsRetainRejectedDrafts:true,attachmentsRequireReselection:true,requestRetryWithoutDuplicate:true,paymentOnlyAfterVerification:true,verifyAndManualRetryWithoutDuplicate:true,staleApprovalBlockedWithDraft:true,companyReturnPreserved:true,privateFilesProtected:true});console.log(JSON.stringify({phase:"workflow",company,ok:true}));
  }
  const midnight=await html("/facturas-recibidas/"+nightInvoice);assert.ok(midnight.includes("2026-11-18 23:30"));assert.ok(midnight.includes("2026-11-19 00:30"));
  if(server?.pid){process.kill(-server.pid,"SIGTERM");await new Promise<void>(r=>server!.once("exit",()=>r()));server=undefined;}
  const {PGlite}=await import("@electric-sql/pglite");const check=new PGlite(join(work,"db"));
  const invoiceRows=await check.query<{id:string;total_clp:string;paid_clp:string;status:string;payments:number}>("SELECT i.id,i.total_clp::text,i.paid_clp::text,i.status,(SELECT count(*)::int FROM supplier_invoice_payments p WHERE p.invoice_id=i.id) AS payments FROM supplier_invoices i WHERE i.id=ANY($1::uuid[])",[Object.values(fixtures).map(x=>x.invoiceId)]);
  assert.equal(invoiceRows.rows.length,2);for(const row of invoiceRows.rows){assert.equal(Number(row.total_clp),1190);assert.equal(Number(row.paid_clp),1190);assert.equal(row.status,"pagada");assert.equal(row.payments,2);}
  const balances=await check.query<{quantity:string}>("SELECT quantity::text FROM stock_balances WHERE item_id=$1 AND warehouse_id=$2",[item,warehouse]);assert.equal(Number(balances.rows[0].quantity),4);
  const counts=await check.query<{receipts:number;proofs:number;transfers:number}>("SELECT (SELECT count(*)::int FROM purchase_receipts) AS receipts,(SELECT count(*)::int FROM supplier_transfer_proofs) AS proofs,(SELECT count(*)::int FROM supplier_transfer_requests WHERE status='verificada') AS transfers");assert.deepEqual(counts.rows[0],{receipts:4,proofs:2,transfers:2});await check.close();
  const result={ok:true,cases:outcomes,finalInvoices:invoiceRows.rows,receipts:4,stockUnits:4,verifiedTransfers:2,proofs:2,localAuditDates:true,productionMutations:false,emailsSent:false,browserVisualTested:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
