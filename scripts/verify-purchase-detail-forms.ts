import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-purchase-detail-forms-http-"));
  console.log(JSON.stringify({phase:"start",evidenceDirectory:work}));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");let server:ChildProcess|undefined,logs="";
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\r\n?/g,"\n");
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  type Kind="line"|"draft"|"receive"|"approve"|"order";
  const matches:Record<Kind,(f:string)=>boolean>={line:f=>f.includes('name="item_id"'),draft:f=>f.includes('name="vat_rate"'),receive:f=>f.includes('name="line_id"'),approve:f=>f.includes("Aprobar compra"),order:f=>f.includes('name="confirmation"')};
  function field(form:string,name:string){
    const select=form.match(new RegExp('<select[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))?.[1];
    if(select!==undefined)return decode(select.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1]||"");
    const input=(form.match(/<input\b[^>]*>/g)||[]).find(x=>x.includes(`name="${name}"`));assert.ok(input,name);return decode(input.match(/\bvalue="([^"]*)"/)?.[1]||"");
  }
  function formFrom(body:string,kind:Kind,path:string){
    const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(matches[kind]);assert.ok(form,`formulario ${kind}`);const data=new FormData();
    for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||""));}
    return {form,data,target:decode(form.match(/\baction="([^"]*)"/)?.[1]||path)};
  }
  const fill=(data:FormData,values:Record<string,string>)=>{for(const [name,value]of Object.entries(values))data.set(name,value);};
  const prices=(form:string)=>[...form.matchAll(/\bname="price_([0-9a-f-]+)"/g)].map(m=>m[1]);
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(statement);});
    }
    const actors=await db.query<{id:string;role:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin'),('ops@example.invalid','Operaciones','h','operaciones'),('driver@example.invalid','Conductor','h','conductor') RETURNING id,role");
    const tokens:Record<string,string>={};for(const actor of actors){const token=randomBytes(32).toString("hex");tokens[actor.role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);}
    const supply=await import("../lib/supply");const admin={id:actors.find(a=>a.role==="admin")!.id,role:"admin" as const,name:"Admin",email:"admin@example.invalid",client_id:null};
    const warehouse=await supply.createWarehouse(admin,{code:"FORM-BOD",name:"Bodega de recepción de prueba"});
    const item=await supply.createStockItem(admin,{code:"FORM-BASE",name:"Artículo base de prueba",unit:"kg",minimum_qty:"0"});
    const extra=await supply.createStockItem(admin,{code:"FORM-EXTRA",name:"Artículo adicional de prueba",unit:"un",minimum_qty:"0"});
    const requests:Record<string,string>={};
    for(const role of ["admin","operaciones"]){
      requests[role]=await supply.createPurchase(admin,{submission_key:randomUUID(),title:`Compra de prueba ${role}`,category:"insumos",priority:"normal",item_id:item,quantity:"5",notes:"Datos sintéticos"});
      requests[`${role}-without`]=await supply.createPurchase(admin,{submission_key:randomUUID(),title:`Compra sin OC ${role}`,category:"insumos",priority:"normal",item_id:extra,quantity:"2"});
      await supply.approvePurchase(admin,requests[`${role}-without`]);
    }
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
    const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(target:string,role="admin",options:RequestInit={})=>fetch(new URL(target,base),{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,role);assert.equal(r.status,200);return clean(await r.text());};
    const post=(form:{target:string;data:FormData},role="admin")=>request(form.target,role,{method:"POST",body:form.data,headers:{Origin:base}});
    const balance=async()=>{const body=await html(`/inventario?articulo=${item}&bodega=${warehouse}`);const table=(body.match(/<table\b[\s\S]*?<\/table>/g)||[])[0];assert.ok(table);const row=(table.match(/<tr\b[\s\S]*?<\/tr>/g)||[]).find(x=>x.includes("Artículo base de prueba")&&x.includes("Bodega de recepción de prueba"));assert.ok(row);return Number((row.match(/<td\b[\s\S]*?<\/td>/g)||[])[2].replace(/<[^>]*>/g,"").replace(/\./g,"").replace(",","."));};
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
    for(const role of ["admin","operaciones"]){
      const path=`/compras/${requests[role]}`;let body=await html(path,role),form=formFrom(body,"line",path);
      fill(form.data,{item_id:item,quantity:"3.125"});form.data.set("password","NO_DEVOLVER_CLAVE");form.data.set("file",new File(["NO_DEVOLVER_ARCHIVO"],"privado.txt"));
      let response=await post(form,role);await writeFile(join(work,`invalid-${role}-line.json`),JSON.stringify({status:response.status,location:response.headers.get("location")},null,2));
      assert.equal(response.status,200,"agregar artículo: el error debe conservar el formulario");body=clean(await response.text());assert.match(body,/ya está registrado/);form=formFrom(body,"line",path);assert.equal(field(form.form,"item_id"),item);assert.equal(field(form.form,"quantity"),"3.125");assert.doesNotMatch(body,/NO_DEVOLVER_CLAVE|NO_DEVOLVER_ARCHIVO/);
      fill(form.data,{item_id:extra,quantity:"3.125"});response=await post(form,role);assert.equal(response.status,303);body=await html(response.headers.get("location")!,role);assert.ok(body.includes("3,125"));assert.equal(field(formFrom(body,"line",path).form,"quantity"),"");
      response=await post(formFrom(await html(path),"approve",path));assert.equal(response.status,303);body=await html(path,role);
      assert.doesNotMatch(body,/orden-number/);form=formFrom(body,"draft",path);const ids=prices(form.form);assert.equal(ids.length,2);
      const draftValues:Record<string,string>={issuer:role==="admin"?"rerchar":"e_y_j",supplier_profile_id:"",supplier:`Proveedor conservado ${role}`,supplier_tax_id:"76.123.456-7",supplier_address:"Dirección <prueba> & revisión",supplier_contact:"Contacto de compras",cost_center:"Área 20",payment_terms:"Crédito 45 días",expected_date:"2026-12-15",vat_rate:"0.19"};
      ids.forEach((id,i)=>{draftValues[`price_${id}`]=i?"125.50":"10.00";draftValues[`discount_${id}`]=i?"5.25":"11.00";});fill(form.data,draftValues);form.data.set("password","NO_DEVOLVER_PRECIO_AJENO");
      response=await post(form,role);assert.equal(response.status,200,"borrador: conservar todos los valores");body=clean(await response.text());await writeFile(join(work,`draft-error-${role}.html`),body);assert.ok(/descuento unitario/.test(body),"el borrador explica el descuento rechazado");form=formFrom(body,"draft",path);
      for(const [name,value]of Object.entries(draftValues))assert.equal(field(form.form,name),value,name);assert.doesNotMatch(body,/NO_DEVOLVER_PRECIO_AJENO/);
      const unchanged=await html(path,role);assert.match(unchanged,/Sin asignar/);for(const id of ids)assert.equal(field(formFrom(unchanged,"draft",path).form,`price_${id}`),"","el rechazo revierte todos los precios");
      const unavailable=randomUUID();fill(form.data,{...draftValues,[`discount_${ids[0]}`]:"0.00",supplier_profile_id:unavailable});response=await post(form,role);assert.equal(response.status,200);body=clean(await response.text());assert.match(body,/proveedor verificada/);form=formFrom(body,"draft",path);assert.equal(field(form.form,"supplier_profile_id"),unavailable);assert.equal(field(form.form,`price_${ids[1]}`),draftValues[`price_${ids[1]}`]);
      fill(form.data,{...draftValues,[`discount_${ids[0]}`]:"0.00"});response=await post(form,role);assert.equal(response.status,303);body=await html(response.headers.get("location")!,role);assert.ok(body.includes(draftValues.supplier));assert.match(body,/Revisar borrador imprimible/);assert.match(body,/Aún sin emitir/);
      const order=await html(path+"/orden",role);assert.match(order,/BORRADOR · SIN EMITIR/);assert.ok(order.includes(draftValues.supplier));assert.match(order,/125,5/);
      form=formFrom(body,"order",path);fill(form.data,{confirmation:"EMITIR"});response=await post(form,role);assert.equal(response.status,303);body=await html(path,role);assert.match(body,/Orden emitida/);
      form=formFrom(body,"receive",path);const lineId=(form.form.match(/<option value="([0-9a-f-]+)"[^>]*>FORM-BASE/)||[])[1];assert.ok(lineId);const key=field(form.form,"submission_key");
      const receiveValues={line_id:lineId,warehouse_id:warehouse,quantity:"6.000",guide_number:`GUIA-${role}`,invoice_number:`FAC-${role}`,payment_status:"pagada"};fill(form.data,receiveValues);const before=await balance();
      response=await post(form,role);assert.equal(response.status,200,"recepción: conservar los antecedentes rechazados");body=clean(await response.text());assert.match(body,/supera el saldo/);form=formFrom(body,"receive",path);for(const [name,value]of Object.entries(receiveValues))assert.equal(field(form.form,name),value,name);assert.equal(field(form.form,"submission_key"),key);assert.equal(await balance(),before);assert.ok(!(await html(path,role)).includes(`FAC-${role}`));
      fill(form.data,{...receiveValues,quantity:"1.250"});response=await post(form,role);assert.equal(response.status,303);const success=response.headers.get("location")!;body=await html(success,role);assert.match(body,/Recepción parcial/);assert.ok(body.includes(`FAC-${role}`));assert.equal(await balance(),before+1.25);
      const repeated=await post(form,role);assert.equal(repeated.status,303);assert.equal(await balance(),before+1.25,"reenviar la recepción conservada no duplica stock");assert.notEqual(field(formFrom(body,"receive",path).form,"submission_key"),key);assert.equal(field(formFrom(body,"receive",path).form,"quantity"),"");
      const withoutPath=`/compras/${requests[`${role}-without`]}`;form=formFrom(await html(withoutPath,role),"receive",withoutPath);const withoutLine=(form.form.match(/<option value="([0-9a-f-]+)"[^>]*>FORM-EXTRA/)||[])[1];assert.ok(withoutLine);
      const without={issuer:draftValues.issuer,supplier:`Proveedor sin OC ${role}`,line_id:withoutLine,warehouse_id:warehouse,quantity:"3",guide_number:"",invoice_number:`F-SIN-${role}`,payment_status:"pendiente"};fill(form.data,without);response=await post(form,role);assert.equal(response.status,200);body=clean(await response.text());form=formFrom(body,"receive",withoutPath);for(const [name,value]of Object.entries(without))assert.equal(field(form.form,name),value,name);
      assert.match(await html(withoutPath,role),/Aprobada/);fill(form.data,{...without,quantity:"2"});response=await post(form,role);assert.equal(response.status,303);body=await html(response.headers.get("location")!,role);assert.match(body,/Pedido recibido en su totalidad/);assert.match(body,/Sin OC/);assert.ok(body.includes(`F-SIN-${role}`));
      outcomes.push({role,lineRecovery:true,draftAllFieldsAndPrices:true,noPriceWriteOnError:true,unavailableSupplierRetained:true,draftWithoutEmission:true,orderedReceiptRecovery:true,noStockChangeOnError:true,receiptRetryDoesNotDuplicate:true,withoutOrderRecovery:true,completeReceipt:true});console.log(JSON.stringify({phase:"workflow",role,ok:true}));
    }
    const rpcPath=`/compras/${requests.admin}`,rpcForm=formFrom(await html(rpcPath),"receive",rpcPath);const reference=[...rpcForm.data.keys()].find(name=>name.startsWith("$ACTION_REF_"));assert.ok(reference);const metadata=JSON.parse(String(rpcForm.data.get(`$ACTION_${reference.slice("$ACTION_REF_".length)}:0`)));
    const codec=createRequire(import.meta.url)("next/dist/compiled/react-server-dom-webpack/client.node") as {encodeReply:(args:unknown[])=>Promise<FormData|string>};
    const rpcData=new FormData();fill(rpcData,{request_id:requests.admin,submission_key:field(rpcForm.form,"submission_key"),without_order:"false",line_id:(rpcForm.form.match(/<option value="([0-9a-f-]+)"[^>]*>FORM-BASE/)||[])[1],warehouse_id:warehouse,quantity:"0.250",guide_number:"RPC-GUIA",invoice_number:"",payment_status:"pendiente"});const rpcBefore=await balance();
    const rpc=await request(rpcPath,"admin",{method:"POST",body:await codec.encodeReply([{error:"",values:{}},rpcData]),headers:{Origin:base,Accept:"text/x-component","Next-Action":metadata.id}});assert.equal(rpc.status,200);assert.equal(rpc.headers.get("x-action-redirect"),null);assert.match(await rpc.text(),/"ok":true/);assert.equal(await balance(),rpcBefore+0.25);
    for(const [name,value]of rpcData)rpcForm.data.set(name,value);rpcForm.data.set("submission_key",randomUUID());const driver=await post(rpcForm,"conductor");assert.ok(driver.status===303||driver.status===200);assert.equal(await balance(),rpcBefore+0.25);const anonymous=await post(rpcForm,"");assert.equal(anonymous.status,303);assert.match(anonymous.headers.get("location")||"",/^\/ingresar/);
    const result={ok:true,outcomes,rpcReceiptWithoutNavigation:true,nativeSavesRedirect:true,driverNoWrite:true,anonymousDenied:true,productionMutations:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
