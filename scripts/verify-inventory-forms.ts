import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-inventory-forms-http-"));
  console.log(JSON.stringify({phase:"start",evidenceDirectory:work}));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");let server:ChildProcess|undefined,logs="";
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\r\n?/g,"\n");
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  type Kind="adjust"|"transfer"|"reserve"|"warehouse"|"item"|"sku_rule"|"valuation";
  const signatures:Record<Kind,(form:string)=>boolean>={
    adjust:f=>f.includes('name="direction"'),transfer:f=>f.includes('name="from_id"'),
    reserve:f=>f.includes('name="warehouse_id"')&&f.includes('name="reason"')&&!f.includes('name="direction"'),
    warehouse:f=>f.includes('name="code"')&&f.includes('name="name"')&&!f.includes('name="unit"'),
    item:f=>f.includes('name="minimum_qty"'),sku_rule:f=>f.includes('name="prefix"'),
    valuation:f=>f.includes('name="item_id"')&&f.includes('name="unit_cost_clp"')&&!f.includes('name="minimum_qty"'),
  };
  function field(form:string,name:string){
    const select=form.match(new RegExp('<select[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))?.[1];
    if(select!==undefined)return decode(select.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1]||"");
    const input=(form.match(/<input\b[^>]*>/g)||[]).find(x=>x.includes(`name="${name}"`));assert.ok(input,name);return decode(input.match(/\bvalue="([^"]*)"/)?.[1]||"");
  }
  function formFrom(body:string,kind:Kind,itemId=""){
    const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(f=>signatures[kind](f)&&(!itemId||field(f,"item_id")===itemId));
    assert.ok(form,`formulario ${kind}`);const data=new FormData();
    for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||""));}
    return {form,data,target:decode(form.match(/\baction="([^"]*)"/)?.[1]||path)};
  }
  const fill=(data:FormData,values:Record<string,string>)=>{for(const [name,value]of Object.entries(values))data.set(name,value);};
  let path="";
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(statement);});
    }
    const actors=await db.query<{id:string;role:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin'),('ops@example.invalid','Operaciones','h','operaciones'),('driver@example.invalid','Conductor','h','conductor') RETURNING id,role");
    const tokens:Record<string,string>={};for(const actor of actors){const token=randomBytes(32).toString("hex");tokens[actor.role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);}
    const supply=await import("../lib/supply");
    const admin={id:actors.find(a=>a.role==="admin")!.id,role:"admin" as const,name:"Admin",email:"admin@example.invalid",client_id:null};
    const a=await supply.createWarehouse(admin,{code:"BOD-A",name:"Bodega origen de prueba"}),b=await supply.createWarehouse(admin,{code:"BOD-B",name:"Bodega destino de prueba"});
    const item=await supply.createStockItem(admin,{code:"ART-BASE",name:"Artículo principal de prueba",unit:"kg",category:"Familia inicial",minimum_qty:"0",unit_cost_clp:"10"});
    const costItem=await supply.createStockItem(admin,{code:"ART-COSTO",name:"Artículo de costo de prueba",unit:"un",category:"Familia anterior",minimum_qty:"0",unit_cost_clp:"15"});
    await supply.createStockSkuRule(admin,{category:"Familia SKU existente",prefix:"RP"});
    await supply.adjustStock(admin,{item_id:item,warehouse_id:a,direction:"entrada",quantity:"10",reason:"Conteo inicial de prueba"});
    await db.query("INSERT INTO inventory_reservations(item_id,warehouse_id,quantity,reason,created_by) SELECT $1,$2,0.01,'Reserva de contexto '||n,$3 FROM generate_series(1,135) n",[item,a,admin.id]);
    await db.query("INSERT INTO inventory_movements(item_id,warehouse_id,kind,reserved_delta,note,reservation_id,created_by) SELECT item_id,warehouse_id,'reserva',quantity,reason,id,created_by FROM inventory_reservations");
    await db.query("UPDATE stock_balances SET reserved=1.35 WHERE item_id=$1 AND warehouse_id=$2",[item,a]);
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
    const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(target:string,role="admin",options:RequestInit={})=>fetch(new URL(target,base),{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(target=path,role="admin")=>{const r=await request(target,role);assert.equal(r.status,200);return clean(await r.text());};
    const post=(form:{target:string;data:FormData},role="admin")=>request(form.target,role,{method:"POST",body:form.data,headers:{Origin:base}});
    const balance=(body:string)=>{const table=(body.match(/<table\b[\s\S]*?<\/table>/g)||[])[0];assert.ok(table);const row=(table.match(/<tr\b[\s\S]*?<\/tr>/g)||[]).find(x=>x.includes("Artículo principal de prueba")&&x.includes("Bodega origen de prueba"));assert.ok(row);return (row.match(/<td\b[\s\S]*?<\/td>/g)||[]).slice(2,5).map(x=>Number(decode(x.replace(/<[^>]*>/g,"")).replace(/[^\d,.-]/g,"").replace(/\./g,"").replace(",",".")));};
    path=`/inventario?mes=2026-11&articulo=${item}&bodega=${a}&pagina_kardex=2&pagina_reservas=2`;
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
    for(const role of ["admin","operaciones"]){
      const cases:{kind:Kind;values:Record<string,string>;fixed:Record<string,string>;error:RegExp}[]=[
        {kind:"adjust",values:{item_id:item,warehouse_id:a,direction:"salida",quantity:"1000",document_reference:"REF <prueba>",cost_center:"CENTRO & prueba",reason:"Corrección de conteo conservada"},fixed:{direction:"entrada",quantity:"1"},error:/Saldo disponible insuficiente/},
        {kind:"transfer",values:{item_id:item,from_id:a,to_id:a,quantity:"1",reason:"Traslado conservado de prueba"},fixed:{to_id:b},error:/bodegas distintas/},
        {kind:"reserve",values:{item_id:item,warehouse_id:a,quantity:"1000",reason:"Reserva conservada de prueba"},fixed:{quantity:"0.5"},error:/Saldo libre insuficiente/},
        {kind:"warehouse",values:{code:"BOD-A",name:`Bodega conservada ${role}`},fixed:{code:`BOD-${role}`},error:/ya está registrado/},
        {kind:"item",values:{code:"ART-BASE",name:`Artículo conservado ${role}`,unit:"kg",category:"Familia conservada",minimum_qty:"2",maximum_qty:"10",unit_cost_clp:"12.50"},fixed:{code:`ART-${role}`},error:/ya está registrado/},
        {kind:"valuation",values:{item_id:costItem,category:`Familia costo ${role}`,unit_cost_clp:"1000000001"},fixed:{unit_cost_clp:role==="admin"?"0.00":"12.50"},error:/Revise los campos/},
        ...(role==="admin"?[{kind:"sku_rule" as const,values:{category:"Familia SKU conservada",prefix:"RP"},fixed:{prefix:"NUEVO"},error:/ya tiene una regla SKU/}]:[]),
      ];
      for(const example of cases){
        const beforeBody=await html(path,role),beforeBalance=balance(beforeBody);
        let form=formFrom(beforeBody,example.kind,example.kind==="valuation"?costItem:"");fill(form.data,example.values);form.data.set("password","NO_DEVOLVER_PASSWORD");form.data.set("file",new File(["NO_DEVOLVER_ARCHIVO"],"privado.txt"));
        let response=await post(form,role);await writeFile(join(work,`invalid-${role}-${example.kind}.json`),JSON.stringify({status:response.status,location:response.headers.get("location")},null,2));
        assert.equal(response.status,200,`${example.kind}: el error debe devolver el formulario sin vaciarlo`);let body=clean(await response.text());assert.match(body,example.error);assert.match(body,/Página 2 de 2/);
        form=formFrom(body,example.kind,example.kind==="valuation"?costItem:"");for(const [name,value]of Object.entries(example.values))assert.equal(field(form.form,name),value,`${example.kind}.${name}`);
        assert.doesNotMatch(body,/NO_DEVOLVER_PASSWORD|NO_DEVOLVER_ARCHIVO/);assert.deepEqual(balance(body),beforeBalance,"el rechazo no modifica el saldo");
        assert.ok(form.target.includes("pagina_kardex=2")&&form.target.includes("pagina_reservas=2")&&form.target.includes("mes=2026-11")&&form.target.includes(`articulo=${item}`)&&form.target.includes(`bodega=${a}`));
        if(example.kind==="valuation"){assert.equal(field(formFrom(body,"valuation",item).form,"category"),"Familia inicial","el error no se aplica al otro artículo");const panel=(body.match(/<details\b[^>]*>/g)||[]).find(x=>x.includes(`data-inventory-cost="${costItem}"`));assert.ok(panel);assert.match(panel,/\bopen=""/);}
        if(example.kind==="sku_rule")assert.match(body,/<details[^>]*class="small-action"[^>]*open=""/);
        fill(form.data,{...example.values,...example.fixed});response=await post(form,role);assert.equal(response.status,303,"el guardado evita reenviar el movimiento al actualizar");
        const target=new URL(response.headers.get("location")!,base);assert.equal(target.origin,base);assert.equal(target.pathname,"/inventario");
        for(const [name,value]of new URL(path,base).searchParams)assert.equal(target.searchParams.get(name),value,`regreso conserva ${name}`);
        assert.ok(target.hash.startsWith("#inventario-"));body=await html(target.pathname+target.search,role);
        form=formFrom(body,example.kind,example.kind==="valuation"?costItem:"");assert.ok(form.form.includes('role="status"'));assert.match(form.form,/guardad|registrad|transferid|actualizad/i);assert.ok(!form.form.includes('role="alert"'));
        if(example.kind==="valuation")assert.equal(Number(field(form.form,"unit_cost_clp")),Number(example.fixed.unit_cost_clp));
        else for(const name of Object.keys(example.values))if(!["direction","unit","minimum_qty"].includes(name))assert.equal(field(form.form,name),"",`${example.kind}.${name} se limpia después de guardar`);
        if(example.kind==="adjust")assert.deepEqual(balance(body),[beforeBalance[0]+1,beforeBalance[1],beforeBalance[2]+1]);
        if(example.kind==="transfer")assert.deepEqual(balance(body),[beforeBalance[0]-1,beforeBalance[1],beforeBalance[2]-1]);
        if(example.kind==="reserve")assert.deepEqual(balance(body),[beforeBalance[0],Number((beforeBalance[1]+0.5).toFixed(3)),Number((beforeBalance[2]-0.5).toFixed(3))]);
        outcomes.push({role,kind:example.kind,fieldsRetained:true,contextRetained:true,rejectionKeepsBalance:true,correctionSaved:true});console.log(JSON.stringify({phase:"form",role,kind:example.kind,ok:true}));
      }
      if(role==="operaciones")assert.ok(!(await html(path,role)).match(/<form[^>]*data-inventory-form="sku_rule"/));
    }
    const rpcForm=formFrom(await html(),"adjust");
    const reference=[...rpcForm.data.keys()].find(name=>name.startsWith("$ACTION_REF_"));assert.ok(reference);
    const metadata=JSON.parse(String(rpcForm.data.get(`$ACTION_${reference.slice("$ACTION_REF_".length)}:0`)));assert.equal(typeof metadata.id,"string");
    const codec=createRequire(import.meta.url)("next/dist/compiled/react-server-dom-webpack/client.node") as {encodeReply:(args:unknown[])=>Promise<FormData|string>};
    const rpcData=new FormData();fill(rpcData,{item_id:item,warehouse_id:a,direction:"entrada",quantity:"0.25",reason:"Ajuste mediante la acción de la aplicación"});
    const rpcBefore=balance(await html());
    const rpc=await request(path,"admin",{method:"POST",body:await codec.encodeReply([{error:"",values:{}},rpcData]),headers:{Origin:base,Accept:"text/x-component","Next-Action":metadata.id}});
    assert.equal(rpc.status,200);assert.equal(rpc.headers.get("x-action-redirect"),null);assert.match(rpc.headers.get("content-type")||"",/text\/x-component/);assert.match(await rpc.text(),/"ok":true/);
    assert.deepEqual(balance(await html()),[rpcBefore[0]+0.25,rpcBefore[1],Number((rpcBefore[2]+0.25).toFixed(3))]);
    const beforeDenied=balance(await html()),valid=formFrom(await html(),"adjust");fill(valid.data,{item_id:item,warehouse_id:a,direction:"entrada",quantity:"2",reason:"Cambio no autorizado de prueba"});
    const denied=await post(valid,"conductor"),deniedBody=await denied.text();assert.ok(denied.status===303||denied.status===200&&deniedBody.includes("NEXT_REDIRECT"));assert.deepEqual(balance(await html()),beforeDenied);
    const anonymous=await post(valid,"");assert.equal(anonymous.status,303);assert.match(anonymous.headers.get("location")||"",/^\/ingresar/);
    const result={ok:true,outcomes,rpcSaveWithoutNavigation:true,nativeSaveRedirects:true,finalOriginBalance:balance(await html()),driverDenied:true,anonymousDenied:true,productionMutations:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
