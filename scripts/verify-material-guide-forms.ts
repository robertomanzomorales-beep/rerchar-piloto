import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-guide-forms-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");
  const guides=await import("../lib/material-guides"),stock=await import("../lib/material-stock");
  let server:ChildProcess|undefined,logs="";
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const labels={create:"Registrar guía y material",item:"Guardar cambios del material",header:"Guardar datos generales",billing:"Vincular a Cobranza",add:"Agregar material"};
  function formFrom(body:string,kind:keyof typeof labels){
    const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes(labels[kind]));assert.ok(form,kind);
    const data=new FormData();
    for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name&&!/\bdisabled(?:=|\s|>)/.test(input))data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||""));}
    for(const tag of form.match(/<select\b[\s\S]*?<\/select>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name&&!/^[^>]*\bdisabled/.test(tag)){const options=tag.match(/<option\b[^>]*>/g)||[];const option=options.find(x=>x.includes('selected=""'))??options[0];data.set(name,decode(option?.match(/\bvalue="([^"]*)"/)?.[1]||""));}}
    for(const tag of form.match(/<textarea\b[\s\S]*?<\/textarea>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(name,decode(tag.slice(tag.indexOf('>')+1,tag.indexOf('</textarea>'))));}
    return {form,data};
  }
  function assertValues(body:string,kind:keyof typeof labels,values:Record<string,string>){const parsed=formFrom(body,kind);for(const [key,value] of Object.entries(values))assert.equal(parsed.data.get(key),value,`${kind}.${key}`);return parsed;}
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");
      await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const clients=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente HTTP A'),('Cliente HTTP B') RETURNING id");
    const users=await db.query<{id:string;role:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin'),('driver@example.invalid','Conductor','h','conductor') RETURNING id,role");
    const admin=users.find(u=>u.role==="admin")!,tokens:Record<string,string>={};
    for(const user of users){const token=randomBytes(32).toString("hex");tokens[user.role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);}
    const actor={id:admin.id,name:"Admin",email:"admin@example.invalid",role:"admin" as const,client_id:null};
    const [materialA,materialB]=await db.query<{id:string}>("INSERT INTO material_catalog(name) VALUES('Material HTTP A'),('Material HTTP B') RETURNING id");
    for(const material of [materialA,materialB])await stock.recordMaterialStockAdjustment(actor,{material_id:material.id,kind:"saldo_inicial",quantity_kg:"100",occurred_on:"2026-11-01",reference:"CONTEO-HTTP",reason:"Conteo físico temporal de prueba"});
    const seed=await guides.createMaterialGuide(actor,{submission_key:randomUUID(),guide_number:"GUIA-HTTP-EDICION",movement_on:"2026-11-01",movement_type:"venta",counterparty_id:clients[0].id,origin:"Origen HTTP",destination:"Destino HTTP",line_number:"1",material_id:materialA.id,stock_kg:"20"});
    await guides.saveMaterialGuideItem(actor,seed,{line_number:"3",material_name:"Material adicional HTTP",origin_kg:"1"});
    const item=(await guides.getMaterialGuide(actor,seed)).items[0];
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();
    delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
    const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
    server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);return clean(await r.text());};
    const post=(path:string,data:FormData,role="admin")=>request(path,{method:"POST",body:data,headers:{Origin:base}},role);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
    const path=`/control-guias/${seed}`,editPath=`${path}?editar=${item.id}`;
    const itemValues={item_id:item.id,line_number:"1",material_id:materialB.id,material_name:"",origin_ticket:"O-HTTP",origin_kg:"10.50",stock_kg:"250",departure_ticket:"S-HTTP",destination_ticket:"D-HTTP",arrival_kg:"48.50",returned_kg:"2",return_ticket:"R-HTTP",return_kg:"1.50",destination_impurity_kg:"0.50",invoice_kg:"48",agreed_price_clp:"123.45",invoice_price_clp:"123.40",invoice_number:"F-HTTP-ITEM",invoice_issued_on:"2026-11-05",invoice_status:"pendiente",payment_on:"",valued_guide_number:"GV-HTTP",notes:"Notas del material <revisar> & confirmar"};
    let original=formFrom(await html(editPath),"item");for(const [key,value] of Object.entries(itemValues))original.data.set(key,value);
    let response=await post(editPath,original.data);assert.equal(response.status,200,"un error de edición conserva el formulario y el ítem seleccionado");
    let body=clean(await response.text());assert.match(body,/Stock insuficiente/);assert.match(body,/Los datos ingresados se conservan/);
    let failed=assertValues(body,"item",itemValues);assert.match(failed.form,/<input[^>]*readOnly=""[^>]*name="line_number"|<input[^>]*name="line_number"[^>]*readOnly=""/i);
    assert.equal(formFrom(await html(editPath),"item").data.get("stock_kg"),"20.00","el rechazo no escribe pesos parciales");
    failed.data.set("stock_kg","40");response=await post(editPath,failed.data);assert.equal(response.status,303);assert.equal(response.headers.get("location"),`${path}?ok=1&editar=${item.id}#material`);
    body=await html(editPath);assertValues(body,"item",{...itemValues,stock_kg:"40.00",origin_kg:"10.50",returned_kg:"2.00",return_kg:"1.50",invoice_kg:"48.00",agreed_price_clp:"123.45",invoice_price_clp:"123.40"});
    assert.match(body,/<small>Complemento desde stock \/ descontado<\/small><strong>40 kg \/ 40 kg<\/strong>/,"la reversa del material anterior no tapa el descuento vigente");
    assert.ok(!body.includes("Salida desde stock aún sin conciliar"));outcomes.push({kind:"item",itemPreserved:true,errorRecovered:true,stockAfterMaterialChange:true});
    assert.equal(formFrom(await html(path),"add").data.get("line_number"),"4","la numeración 1,3 propone el ítem 4 en vez de repetir el 3");
    const lastLine=formFrom(await html(path),"add");lastLine.data.set("line_number","100");lastLine.data.set("material_name","Material de posición 100 HTTP");lastLine.data.set("origin_kg","1");
    assert.equal((await post(path,lastLine.data)).status,303);
    assert.equal(formFrom(await html(path),"add").data.get("line_number"),"2","si existe el ítem 100, propone un hueco libre dentro del rango permitido");

    const createPath="/control-guias/nueva";
    original=formFrom(await html(createPath),"create");const submission=String(original.data.get("submission_key"));
    const headerValues={guide_number:"GUIA-HTTP-NUEVA",movement_on:"2026-11-02",movement_type:"venta",counterparty_id:clients[0].id,movement_detail:"Venta HTTP",origin:"Origen nuevo",destination:"Destino nuevo",driver_name:"Conductor HTTP",truck_plate:"ABCD12",trailer_plate:"EFGH34",freight_company:"Transportista HTTP",freight_cost_clp:"1000.50",freight_invoice_number:"FT-HTTP",freight_guide_reference:"GT-HTTP",freight_payment_required:"si",freight_invoice_status:"parcial",guide_notes:"Notas de la guía <revisar> & confirmar"};
    const creationValues={...headerValues,...itemValues,item_id:"",material_id:materialA.id,stock_kg:"250",invoice_number:"",invoice_issued_on:"",invoice_status:"",submission_key:submission};
    for(const [key,value] of Object.entries(creationValues))original.data.set(key,value);
    response=await post(createPath,original.data);assert.equal(response.status,200);body=clean(await response.text());assert.match(body,/Stock insuficiente/);failed=assertValues(body,"create",creationValues);
    failed.data.set("stock_kg","10");response=await post(createPath,failed.data);assert.equal(response.status,303);const createdLocation=response.headers.get("location")!;assert.match(createdLocation,/^\/control-guias\/[0-9a-f-]+\?ok=1$/);
    assert.equal((await post(createPath,failed.data)).headers.get("location"),createdLocation,"la clave conservada evita duplicar guía y stock en el reintento");outcomes.push({kind:"create",allFieldsRetained:true,submissionPreserved:true,retryWithoutDuplicate:true});

    const generalPath=`${path}?general=1`;
    original=formFrom(await html(generalPath),"header");
    const editedHeader={...headerValues,origin:"R",counterparty_id:clients[1].id};delete (editedHeader as Partial<typeof headerValues>).guide_number;delete (editedHeader as Partial<typeof headerValues>).movement_type;
    for(const [key,value] of Object.entries(editedHeader))original.data.set(key,value);
    response=await post(generalPath,original.data);assert.equal(response.status,200);body=clean(await response.text());failed=assertValues(body,"header",editedHeader);
    assert.match(body,/<details[^>]*open/);failed.data.set("origin","Origen corregido");response=await post(generalPath,failed.data);assert.equal(response.status,303);assert.equal(response.headers.get("location"),`${path}?ok=1&general=1#datos-generales`);outcomes.push({kind:"header",allFieldsRetained:true,editorStaysOpen:true});

    original=formFrom(await html(path),"billing");
    const billingValues={invoice_number:"F-HTTP-ITEM",issued_on:"2026-11-05",due_on:"2026-11-04",total_clp:"119.50"};for(const [key,value] of Object.entries(billingValues))original.data.set(key,value);
    response=await post(path,original.data);assert.equal(response.status,200);body=clean(await response.text());assert.match(body,/vencimiento no puede anteceder/);failed=assertValues(body,"billing",billingValues);
    failed.data.set("due_on","2026-11-06");response=await post(path,failed.data);assert.equal(response.status,303);assert.equal(response.headers.get("location"),`${path}?ok=1#cobranza`);
    body=await html(editPath);const linked=formFrom(body,"item");
    for(const field of ["invoice_number","invoice_issued_on","payment_on"]){const tag=(linked.form.match(/<input\b[^>]*>/g)||[]).find(x=>x.includes(`name="${field}"`));assert.match(tag||"",/readOnly/i,field);}
    assert.ok(linked.data.has("invoice_status"),"la factura vinculada conserva el estado aunque su selector esté bloqueado");
    linked.data.set("notes","Peso conciliado sin modificar la factura vinculada");response=await post(editPath,linked.data);assert.equal(response.status,303);assert.equal(response.headers.get("location"),`${path}?ok=1&editar=${item.id}#material`);outcomes.push({kind:"billing",fieldsRetained:true,linkedInvoiceProtected:true,otherItemChangesAllowed:true});
    const denied=await post(editPath,linked.data,"conductor");assert.match(await denied.text(),/Sólo administración y operaciones/);assert.equal((await post(editPath,linked.data,"")).status,303);
    const result={ok:true,cases:outcomes,nextLineAfterGaps:true,permissions:true,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
