import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
const work=await mkdtemp(join(tmpdir(),"rerchar-supply-http-"));
Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
const {db,transaction}=await import("../lib/db");
let server:ChildProcess|undefined,logs="";
const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
function reservationForm(body:string){
  const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes('name="reservation_id"'));assert.ok(form);
  const data=new FormData();for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||""));}return data;
}

try{
  for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
    const sql=await readFile(join("db",name),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente revisión EDP') RETURNING id");
  const actors=await db.query<{id:string;role:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin'),('driver@example.invalid','Conductor','h','conductor') RETURNING id,role");
  const tokens:Record<string,string>={};
  for(const actor of actors){const token=randomBytes(32).toString("hex");tokens[actor.role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);}
  const {createWarehouse,createStockItem,createPurchase,approvePurchase,getPurchase,receivePurchase}=await import("../lib/supply");
  const actor={id:actors.find(a=>a.role==="admin")!.id,role:"admin" as const,name:"Admin",email:"admin@example.invalid",client_id:null};
  const warehouse=await createWarehouse(actor,{code:"HTTP-B",name:"Bodega HTTP"});
  const item=await createStockItem(actor,{code:"HTTP-ART",name:"Artículo HTTP",unit:"kg",minimum_qty:"0"});
  const purchase=await createPurchase(actor,{submission_key:randomUUID(),title:"Recepción HTTP",category:"insumos",priority:"normal",item_id:item,quantity:"2.5",notes:"Revisión aislada"});
  await approvePurchase(actor,purchase);
  const line=(await getPurchase(actor,purchase)).lines[0];
  await receivePurchase(actor,purchase,{submission_key:randomUUID(),line_id:line.id,warehouse_id:warehouse,quantity:"2.5",guide_number:"GUIA-HTTP",invoice_number:"",payment_status:"pendiente",without_order:true,supplier:"Proveedor HTTP",issuer:"rerchar"});
  await db.query(`INSERT INTO purchase_requests(submission_key,title,category,priority,requested_by)
    SELECT gen_random_uuid(),'Solicitud HTTP '||n,'insumos','normal',$1 FROM generate_series(1,235) n`,[actor.id]);
  await db.query(`INSERT INTO supplier_invoices(issuer,supplier_tax_id,supplier_name,invoice_number,issued_on,due_on,description,total_clp,recorded_by)
    SELECT CASE WHEN n<=425 THEN 'rerchar' ELSE 'e_y_j' END,'76347909-9','Proveedor HTTP','HTTP-F-'||n,'2026-11-01','2026-11-10','Documento histórico',1000,$1 FROM generate_series(1,462) n`,[actor.id]);
  await db.query(`INSERT INTO inventory_movements(item_id,warehouse_id,kind,qty_delta,note,created_by)
    SELECT $1,$2,'ajuste_entrada',1,'Movimiento HTTP '||n,$3 FROM generate_series(1,235) n`,[item,warehouse,actor.id]);
  await db.query(`INSERT INTO inventory_reservations(item_id,warehouse_id,quantity,reason,created_by)
    SELECT $1,$2,1,'Reserva HTTP '||n,$3 FROM generate_series(1,135) n`,[item,warehouse,actor.id]);
  await db.query(`INSERT INTO inventory_movements(item_id,warehouse_id,kind,reserved_delta,note,created_by)
    VALUES($1,$2,'reserva',135,'Reservas de la prueba HTTP',$3)`,[item,warehouse,actor.id]);
  await db.query("UPDATE stock_balances SET quantity=quantity+235,reserved=135 WHERE item_id=$1 AND warehouse_id=$2",[item,warehouse]);
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
  let body=await html("/compras?estado=solicitada&pagina=3");
  assert.match(body,/Página 3 de 3/);assert.match(body,/201–235 de 235/);assert.match(body,/estado=solicitada&amp;pagina=2/);
  body=await html(`/compras/${purchase}`);
  const table=(body.match(/<table\b[\s\S]*?<\/table>/g)||[]).find(t=>t.includes("<th>Documento</th>"));assert.ok(table);
  const row=table.match(/<tbody><tr[^>]*>([\s\S]*?)<\/tr>/)?.[1];assert.ok(row);
  const cells=row.match(/<td\b[\s\S]*?<\/td>/g)||[];assert.equal(cells.length,4);assert.match(cells[1],/2,5\s+kg/);assert.match(cells[2],/GUIA-HTTP/);assert.match(cells[3],/Admin/);
  body=await html("/facturas-recibidas?empresa=rerchar&estado=vencidas&pagina=5");assert.match(body,/Página 5 de 5/);assert.match(body,/401–425 de 425/);assert.match(body,/empresa=rerchar&amp;estado=vencidas&amp;pagina=4/);
  assert.equal(new Set([...body.matchAll(/href="\/facturas-recibidas\/([0-9a-f-]+)"/g)].map(match=>match[1])).size,25);
  const inventoryPath=`/inventario?mes=2026-11&articulo=${item}&bodega=${warehouse}&pagina_kardex=3&pagina_reservas=2`;
  body=await html(inventoryPath);assert.match(body,/201–237 de 237/);assert.match(body,/101–135 de 135/);assert.match(body,/pagina_kardex=2&amp;pagina_reservas=2/);
  const data=reservationForm(body);data.set("action","consumir");
  const post=(form:FormData,role="admin")=>request(inventoryPath,role,{method:"POST",body:form,headers:{Origin:base}});
  let response=await post(data);assert.equal(response.status,303);let target=new URL(response.headers.get("location")!,base);
  assert.equal(target.origin,base);assert.equal(target.pathname,"/inventario");assert.equal(target.searchParams.get("mes"),"2026-11");assert.equal(target.searchParams.get("articulo"),item);assert.equal(target.searchParams.get("bodega"),warehouse);assert.equal(target.searchParams.get("pagina_kardex"),"3");assert.equal(target.searchParams.get("pagina_reservas"),"2");assert.equal(target.searchParams.get("ok"),"1");assert.equal(target.hash,"#reservas-stock");
  body=await html(target.pathname+target.search);assert.match(body,/201–238 de 238/);assert.match(body,/101–134 de 134/);
  response=await post(data);assert.equal(response.status,303);target=new URL(response.headers.get("location")!,base);assert.ok(target.searchParams.has("error"));assert.equal(target.searchParams.get("pagina_reservas"),"2");
  const next=reservationForm(body);next.set("return_to","https://example.invalid/externo");response=await post(next);assert.equal(response.status,303);target=new URL(response.headers.get("location")!,base);assert.equal(target.origin,base);assert.equal(target.pathname,"/inventario");
  const denied=await request(inventoryPath,"conductor");
  if(denied.status===200){const deniedBody=await denied.text();assert.match(deniedBody,/NEXT_REDIRECT/);assert.ok(!deniedBody.includes("Artículo HTTP"));}else assert.equal(denied.status,307);
  for(const path of ["/compras?estado=solicitada&pagina=999",inventoryPath.replace("pagina_kardex=3","pagina_kardex=999")+"&ok=1"]){
    const clamped=await request(path);const content=await clamped.text();
    if(clamped.status===200)assert.match(content,/NEXT_REDIRECT/);else assert.equal(clamped.status,307);
    assert.ok((clamped.headers.get("location")??content).includes(path.startsWith("/compras")?"pagina=3":"pagina_kardex=3"));
    if(path.startsWith("/inventario"))assert.ok((clamped.headers.get("location")??content).includes("ok=1"),"la normalización conserva la confirmación del guardado");
  }
  const result={ok:true,purchasePagination:true,supplierPagination:true,receiptFourColumns:true,quantityAndUnit:true,kardexPagination:true,reservationPagination:true,returnKeepsFilters:true,duplicateProtected:true,externalReturnRejected:true,productionMutations:false,evidenceDirectory:work};
  await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
  if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}
  await writeFile(join(work,"server.log"),logs);
}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
