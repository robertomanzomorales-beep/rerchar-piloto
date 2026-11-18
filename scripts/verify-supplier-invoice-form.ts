import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
const work=await mkdtemp(join(tmpdir(),"rerchar-invoice-entry-http-"));
Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
const {db,transaction}=await import("../lib/db");
let server:ChildProcess|undefined,logs="";
const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
function formFrom(body:string){
  const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes("supplier-invoice-form"));assert.ok(form);
  const data=new FormData();
  for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||""));}
  return {form,data};
}
function inputValue(form:string,name:string){const input=(form.match(/<input\b[^>]*>/g)||[]).find(x=>x.includes(`name="${name}"`));assert.ok(input,name);return decode(input.match(/\bvalue="([^"]*)"/)?.[1]||"");}
function selected(form:string,name:string){const select=form.match(new RegExp('<select[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))?.[1];assert.ok(select,name);return select.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1]||"";}

try{
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(join("db",name),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente revisión EDP') RETURNING id");
  const actors=await db.query<{id:string;role:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin'),('driver@example.invalid','Conductor','h','conductor') RETURNING id,role");
  const tokens:Record<string,string>={};
  for(const actor of actors){const token=randomBytes(32).toString("hex");tokens[actor.role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);}
  const admin=actors.find(actor=>actor.role==="admin")!.id;
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena HTTP') RETURNING id",[client.id]);
  const services=await db.query<{id:string;operating_company:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by)
    SELECT gen_random_uuid(),$1,$2,company,'traslado','Material HTTP','Origen','Destino',$3 FROM unnest(ARRAY['rerchar','e_y_j']) company RETURNING id,operating_company`,[client.id,site.id,admin]);
  const purchases=await db.query<{id:string;issuer:string}>(`INSERT INTO purchase_requests(submission_key,title,category,priority,issuer,requested_by,created_at)
    SELECT gen_random_uuid(),'Solicitud histórica HTTP '||n,'insumos','normal',CASE WHEN n<=251 THEN 'rerchar' ELSE 'e_y_j' END,$1,'2025-01-01' FROM generate_series(1,252) n RETURNING id,issuer`,[admin]);
  const [profile]=await db.query<{id:string}>(`INSERT INTO counterparty_profiles(kind,legal_name,tax_id,business_activity,legal_address,locality,phone,general_email,tax_status,legal_representative,invoice_email,payment_terms,bank_name,account_type,account_number,account_holder,account_holder_tax_id,proof_email,status,created_by,updated_by)
    VALUES('proveedor','Proveedor HTTP verificado','76347909-9','Insumos','Dirección de prueba','Calama','0000','proveedor@example.invalid','afecto','Contacto de prueba','facturas@example.invalid','30','BANCO-SOLO-FIXTURE','corriente','CUENTA-SOLO-FIXTURE','Proveedor HTTP verificado','76347909-9','pagos@example.invalid','verificada',$1,$1) RETURNING id`,[admin]);
  const [linked]=await db.query<{id:string}>(`INSERT INTO purchase_requests(submission_key,title,category,priority,issuer,status,supplier_profile_id,supplier_tax_id,requested_by)
    VALUES(gen_random_uuid(),'OC con proveedor HTTP','insumos','normal','rerchar','ordenada',$1,'76347909-9',$2) RETURNING id`,[profile.id,admin]);
  const [nightInvoice]=await db.query<{id:string}>(`INSERT INTO supplier_invoices(issuer,supplier_tax_id,supplier_name,invoice_number,issued_on,description,total_clp,recorded_by)
    VALUES('e_y_j','76347909-9','Proveedor de prueba','HTTP-FECHA','2026-11-01','Revisión de fecha local',119,$1) RETURNING id`,[admin]);
  await db.query(`INSERT INTO supplier_transfer_requests(submission_key,invoice_id,amount_clp,bank_name,account_type,account_number,requested_by,created_at)
    VALUES(gen_random_uuid(),$1,119,'BANCO-SOLO-FIXTURE','corriente','CUENTA-SOLO-FIXTURE',$2,'2026-11-19T02:30:00Z')`,[nightInvoice.id,admin]);
  await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();
  delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
  const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));
  const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
  const base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
  server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
  const request=(path:string,role="admin",options:RequestInit={})=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
  const html=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);return (await r.text()).replace(/<!--[\s\S]*?-->/g,"");};
  await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
  const outcomes=[];
  for(const [index,company] of ["rerchar","e_y_j","rerchar"].entries()){
    const path=`/facturas-recibidas?empresa=${company}&estado=todas`;
    const post=(data:FormData,role="admin")=>request(path,role,{method:"POST",body:data,headers:{Origin:base}});
    const initialBody=await html(path),original=formFrom(initialBody);
    assert.ok(!initialBody.includes("CUENTA-SOLO-FIXTURE"));
    const purchaseOptions=original.form.match(/<select[^>]*name="purchase_id"[^>]*>([\s\S]*?)<\/select>/)?.[1];assert.ok(purchaseOptions);
    assert.equal((purchaseOptions.match(/<option/g)||[]).length,company==="rerchar"?253:2,"todas las compras de la empresa, sin recorte de las primeras 250");
    const purchaseId=index===2?linked.id:purchases.find(p=>p.issuer===company)!.id;
    const serviceId=services.find(s=>s.operating_company===company)!.id;
    const values={issuer:company,supplier_profile_id:index===2?profile.id:"",supplier_tax_id:index===2?"":"76.123.456-7",supplier_name:index===2?"":"Proveedor HTTP manual",
      invoice_number:`HTTP-INV-${index}`,issued_on:"2026-11-01",due_on:"2026-12-01",description:"Descripción conservada <revisar> & confirmar",net_clp:"100",vat_clp:"19",total_clp:"118",cost_area:"Centro HTTP",purchase_id:purchaseId,service_id:serviceId,notes:"Observaciones conservadas <revisar> & confirmar"};
    for(const [k,v] of Object.entries(values))original.data.set(k,v);
    let response=await post(original.data);assert.equal(response.status,200);
    let body=(await response.text()).replace(/<!--[\s\S]*?-->/g,"");assert.match(body,/No se pudo registrar la factura/);assert.match(body,/Neto más IVA no coincide/);
    const failed=formFrom(body);
    for(const name of ["issued_on","due_on","invoice_number","net_clp","vat_clp","total_clp","cost_area"] as const)assert.equal(inputValue(failed.form,name),values[name],name);
    for(const name of ["issuer","purchase_id","service_id"] as const)assert.equal(selected(failed.form,name),values[name],name);
    assert.match(failed.form,/Descripción conservada &lt;revisar&gt; &amp; confirmar/);assert.match(failed.form,/Observaciones conservadas &lt;revisar&gt; &amp; confirmar/);
    if(index===2){assert.equal(inputValue(failed.form,"supplier_profile_id"),profile.id);const nameInput=(failed.form.match(/<input\b[^>]*>/g)||[]).find(input=>input.includes('name="supplier_name"'));assert.ok(nameInput);assert.match(nameInput,/disabled/);assert.match(failed.form,/Proveedor HTTP verificado/);}
    else {assert.equal(inputValue(failed.form,"supplier_tax_id"),values.supplier_tax_id);assert.equal(inputValue(failed.form,"supplier_name"),values.supplier_name);}
    assert.ok(!(await html(path)).includes(`>${values.invoice_number}<`),"el fallo no crea factura");
    for(const [k,v] of Object.entries(values))failed.data.set(k,v);failed.data.set("total_clp","119");
    if(index===0){
      failed.data.set("service_id",services.find(s=>s.operating_company!==company)!.id);
      response=await post(failed.data);assert.equal(response.status,200);body=await response.text();assert.match(body,/misma empresa receptora/);assert.equal(inputValue(formFrom(body).form,"total_clp"),"119");
      failed.data.set("service_id",serviceId);
    }
    response=await post(failed.data);assert.equal(response.status,303);const target=response.headers.get("location");assert.match(target||"",/^\/facturas-recibidas\/[0-9a-f-]+\?ok=1$/);
    const repeated=await post(failed.data);assert.equal(repeated.status,200);assert.match(await repeated.text(),/ya está registrada/);
    assert.ok((await html(target!)).includes(values.invoice_number));
    const denied=await post(failed.data,"conductor");assert.equal(denied.status,200);assert.match(await denied.text(),/de administración/);
    assert.equal((await post(failed.data,"")).status,303);
    outcomes.push({company,verifiedSupplier:index===2,allFieldsRetained:true,retryCreatesOnce:true,duplicateBlocked:true});
  }
  const transfers=await html("/transferencias?empresa=e_y_j");assert.match(transfers,/<td>2026-11-18<\/td>/,"la transferencia muestra el día de Chile cuando UTC ya cambió de día");
  const result={ok:true,cases:outcomes,oldPurchaseAvailable:true,companyScope:true,bankDataNotSerialized:true,localTransferDate:true,productionMutations:false,evidenceDirectory:work};
  await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
  if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}
  await writeFile(join(work,"server.log"),logs);
}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
