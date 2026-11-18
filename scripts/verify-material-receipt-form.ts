import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-receipt-form-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");
  let server:ChildProcess|undefined,logs="";
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  function formFrom(body:string){
    const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes('name="movement_on"')&&x.includes('name="kind"'));assert.ok(form,"formulario de ingreso");
    const data=new FormData();
    for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||""));}
    return {form,data};
  }
  function inputValue(form:string,name:string){const input=(form.match(/<input\b[^>]*>/g)||[]).find(x=>x.includes(`name="${name}"`));assert.ok(input,name);return decode(input.match(/\bvalue="([^"]*)"/)?.[1]||"");}
  function selectBody(form:string,name:string){const select=form.match(new RegExp('<select[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))?.[1];assert.ok(select,name);return select;}
  function selected(form:string,name:string){return selectBody(form,name).match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1]||"";}
  const clean=(html:string)=>html.replace(/<!--[\s\S]*?-->/g,"");
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");
      await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const clients=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente HTTP A'),('Cliente HTTP B') RETURNING id");
    const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena HTTP') RETURNING id",[clients[0].id]);
    const actors=await db.query<{id:string;role:string}>(`INSERT INTO users(email,name,password_hash,role,client_id) VALUES
      ('admin@example.invalid','Admin','h','admin',null),('driver@example.invalid','Conductor','h','conductor',null),
      ('client@example.invalid','Cliente','h','cliente',$1) RETURNING id,role`,[clients[0].id]);
    const admin=actors.find(a=>a.role==="admin")!.id,tokens:Record<string,string>={};
    for(const actor of actors){const token=randomBytes(32).toString("hex");tokens[actor.role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);}
    const [material,otherMaterial]=await db.query<{id:string;name:string}>("INSERT INTO material_catalog(name) VALUES('Material HTTP permitido'),('Material HTTP ajeno') RETURNING id,name");
    const [historic]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by,created_at)
      VALUES(gen_random_uuid(),$1,$2,'rerchar','compra','Material HTTP','Origen HTTP','Destino HTTP',$3,'2025-01-01') RETURNING id`,[clients[0].id,site.id,admin]);
    await db.query(`INSERT INTO service_request_materials(service_id,position,material_id,material_name) VALUES($1,1,$2,$3)`,[historic.id,material.id,material.name]);
    await db.query(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by)
      SELECT gen_random_uuid(),$1,$2,'rerchar','compra','Material HTTP','Origen','Destino',$3 FROM generate_series(1,300)`,[clients[0].id,site.id,admin]);
    const [foreign]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by)
      VALUES(gen_random_uuid(),$1,$2,'e_y_j','traslado','Material HTTP','Origen','Destino',$3) RETURNING id`,[clients[0].id,site.id,admin]);
    await db.query(`INSERT INTO service_evidence(service_id,description,document_kind,storage_key,original_filename,created_by)
      VALUES($1,'Respaldo de prueba','ticket_pesaje','00000000-0000-4000-8000-000000000001.pdf','ticket-historico.pdf',$2)`,[historic.id,admin]);
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();
    delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));
    const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
    const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
    server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,role="admin",options:RequestInit={})=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);return clean(await r.text());};
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const cases=[];
    for(const mode of ["directa","programada"]){
      const path=mode==="directa"?"/ingresos":`/ingresos?servicio=${historic.id}`;
      const initial=formFrom(await html(path));
      const values={kind:mode==="directa"?"ingreso":"excedente",client_id:clients[0].id,receipt_mode:mode,service_id:mode==="directa"?"":historic.id,
        movement_on:"2026-11-18",material_id:mode==="directa"?"":material.id,material_name:mode==="directa"?"Cobre HTTP":"",
        site_name:"Faena HTTP editada",origin:"Origen conservado",destination:"Destino conservado",driver_name:"Conductor HTTP",driver_tax_id:"12345678-5",truck_plate:"ABCD12",trailer_plate:"EFGH34",
        weighing_ticket:`T-${mode}`,origin_guide:`OR-${mode}`,transfer_guide:`GT-${mode}`,entry_sheet:`H-${mode}`,supplier_kg:"1250.50",rerchar_kg:"1200.25",impurity_kg:"20.25",
        net_basis:"proveedor",net_reported_kg:"1100",impurity_report:"Informe HTTP",certificate_number:"CERT-HTTP",act_number:"ACTA-HTTP",invoice_number:"FACT-HTTP",unit_price_clp:"123.45",payment_status:"no_aplica",notes:""};
      for(const [k,v] of Object.entries(values))initial.data.set(k,v);
      const post=(data:FormData,role="admin")=>request(path,role,{method:"POST",body:data,headers:{Origin:base}});
      let response=await post(initial.data);assert.equal(response.status,200,"el rechazo debe conservar el formulario, sin redirigir y borrar los datos");
      let body=clean(await response.text());assert.match(body,/El neto anotado difiere/);assert.match(body,/Los datos ingresados se conservan/);
      assert.ok(!(await html("/ingresos")).includes(`<strong>${values.weighing_ticket}</strong>`),"el rechazo no crea un ingreso");
      let failed=formFrom(body);
      for(const name of ["movement_on","material_name","site_name","origin","destination","driver_name","driver_tax_id","truck_plate","trailer_plate","weighing_ticket","origin_guide","transfer_guide","entry_sheet","supplier_kg","rerchar_kg","impurity_kg","net_reported_kg","impurity_report","certificate_number","act_number","invoice_number","unit_price_clp"] as const)assert.equal(inputValue(failed.form,name),values[name],name);
      for(const name of ["kind","client_id","receipt_mode","service_id","material_id","net_basis","payment_status"] as const)assert.equal(selected(failed.form,name),values[name],name);
      for(const [k,v] of Object.entries(values))failed.data.set(k,v);
      failed.data.set("notes","Diferencia revisada <pesaje> & confirmada en recepción.");
      if(mode==="programada"){
        assert.equal((selectBody(initial.form,"service_id").match(/<option/g)||[]).length,302,"servicios históricos sin recorte a 300");
        assert.equal(selected(initial.form,"service_id"),historic.id,"respeta el enlace desde un servicio antiguo");
        assert.equal(selected(initial.form,"material_id"),material.id,"respeta los materiales de su solicitud");
        assert.ok(initial.form.includes("ticket-historico.pdf"),"respaldo del servicio histórico disponible");
        assert.ok(!selectBody(initial.form,"service_id").includes(foreign.id),"sin servicios de E y J");
        assert.ok(!selectBody(initial.form,"material_id").includes(otherMaterial.id),"sin materiales ajenos");
        for(const invalid of [{service_id:foreign.id},{client_id:clients[1].id},{material_id:otherMaterial.id}]){
          const key=Object.keys(invalid)[0] as keyof typeof values;
          failed.data.set(key,Object.values(invalid)[0]!);response=await post(failed.data);assert.equal(response.status,200);
          body=clean(await response.text());assert.match(body,key==="material_id"?/material que figure en la solicitud/:/servicio de RERCHAR del mismo cliente/);
          assert.match(formFrom(body).form,/Diferencia revisada &lt;pesaje&gt; &amp; confirmada/);failed.data.set(key,values[key]);
        }
      }else{
        failed.data.set("driver_name","");response=await post(failed.data);assert.equal(response.status,200);body=clean(await response.text());assert.match(body,/identifique conductor externo/);
        assert.equal(inputValue(formFrom(body).form,"rerchar_kg"),values.rerchar_kg);failed.data.set("driver_name",values.driver_name);
      }
      const denied=await post(failed.data,"conductor");assert.equal(denied.status,200);assert.match(await denied.text(),/Sólo operaciones/);
      assert.equal((await post(failed.data,"")).status,303);
      response=await post(failed.data);assert.equal(response.status,303);const target=response.headers.get("location");assert.match(target||"",/^\/ingresos\/[0-9a-f-]+\?ok=1$/);
      assert.ok((await html(target!)).includes(values.weighing_ticket));
      cases.push({mode,allFieldsRetained:true,scopeValidated:true,correctedReceiptSaved:true});
    }
    const clientPage=await request("/ingresos","cliente");assert.equal(clientPage.status,200);assert.ok(!clean(await clientPage.text()).includes('class="form-grid material-receipt-form"'));
    const result={ok:true,cases,historicServiceAndMaterialAvailable:true,permissions:true,productionMutations:false,evidenceDirectory:work};
    await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{
    if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}
    await writeFile(join(work,"server.log"),logs);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
