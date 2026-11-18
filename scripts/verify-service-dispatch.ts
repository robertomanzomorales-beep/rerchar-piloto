import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-service-dispatch-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");let server:ChildProcess|undefined,logs="";
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const labels={plan:"Programar servicio",replan:"Actualizar planificación",checklist:"Guardar checklist",finish:"Validar y cerrar servicio",day:"Guardar parte del día",rental:"Programar arriendo",cancel:"Confirmar cancelación",start:"Iniciar ruta",handoff:"Entregar a revisión administrativa",purchaseHandoff:"Finalizar servicio de compra"};
  const formActions=new WeakMap<FormData,string>();
  function formFrom(body:string,kind:keyof typeof labels){
    const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes(labels[kind]));assert.ok(form,kind);const data=new FormData();
    for(const tag of form.match(/<input\b[^>]*>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(!name||/type="checkbox"/.test(tag)&&!tag.includes('checked=""'))continue;data.set(decode(name),decode(tag.match(/\bvalue="([^"]*)"/)?.[1]??(/type="checkbox"/.test(tag)?"on":"")));}
    for(const tag of form.match(/<select\b[\s\S]*?<\/select>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name){const options=tag.match(/<option\b[^>]*>/g)||[],option=options.find(x=>x.includes('selected=""'))??options[0];data.set(name,decode(option?.match(/\bvalue="([^"]*)"/)?.[1]??""));}}
    for(const tag of form.match(/<textarea\b[\s\S]*?<\/textarea>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(name,decode(tag.slice(tag.indexOf(">")+1,tag.indexOf("</textarea>"))));}
    const action=decode(form.match(/\baction="([^"]*)"/)?.[1]??"");if(action)formActions.set(data,action);
    return {form,data};
  }
  const fill=(data:FormData,values:Record<string,string>)=>{for(const [name,value]of Object.entries(values))data.set(name,value);};
  const retained=(body:string,kind:keyof typeof labels,values:Record<string,string>)=>{const result=formFrom(body,kind);for(const [name,value]of Object.entries(values))assert.equal(result.data.get(name),value,kind+"."+name);return result;};
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente despacho HTTP') RETURNING id");
    const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena HTTP') RETURNING id",[client.id]);
    const users=await db.query<{id:string;role:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','h','admin'),('driver@example.invalid','Conductor','h','conductor') RETURNING id,role");
    const admin=users.find(x=>x.role==="admin")!,driver=users.find(x=>x.role==="conductor")!,tokens:Record<string,string>={};
    for(const user of users){const token=randomBytes(32).toString("hex");tokens[user.role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);}
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const cases=[];
    for(const company of ["rerchar","e_y_j"]){
      const [truck,ramp,equipment]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES($1,'Camión HTTP','camion'),($2,'Rampla HTTP','rampa'),($3,'Equipo HTTP','equipo') RETURNING id",[company+"C",company+"R",company+"E"]);
      const [service,conflict,rental]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,request_category,service_type,waste_type,origin,destination,status,created_by,rental_from,rental_to)
        VALUES(gen_random_uuid(),$1,$2,$3,$4,CASE WHEN $3='rerchar' THEN 'retiro' ELSE 'traslado' END,'Material HTTP','Origen','Destino','solicitada',$5,null,null),
        (gen_random_uuid(),$1,$2,$3,'servicios','traslado','Conflicto HTTP','Origen','Destino','programada',$5,null,null),
        (gen_random_uuid(),$1,$2,$3,'servicios','arriendo','Equipo HTTP','Origen','Destino','solicitada',$5,$6::date,$6::date) RETURNING id`,[client.id,site.id,company,company==="rerchar"?"compra":"servicios",admin.id,today]);
      await db.query("UPDATE service_requests SET assigned_asset_id=$2,driver_id=$3,scheduled_for=($4::timestamp AT TIME ZONE 'America/Santiago') WHERE id=$1",[conflict.id,truck.id,driver.id,today+"T08:00"]);
      for(const kind of company==="rerchar"?["guia_traslado","hoja_servicio"]:["evidencia"])await db.query("INSERT INTO service_evidence(service_id,description,document_kind,storage_key,created_by) VALUES($1,'Respaldo HTTP',$2,'fixture.pdf',$3)",[service.id,kind,admin.id]);
      cases.push({company,service:service.id,truck:truck.id,ramp:ramp.id,equipment:equipment.id,rental:rental.id});
    }
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string)=>{const response=await request(path);assert.equal(response.status,200);const body=clean(await response.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const post=(path:string,data:FormData,role="admin")=>request(formActions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
    for(const item of cases){
      const path=`/solicitudes/${item.service}`;let original=formFrom(await html(path),"plan");const plan={scheduled_for:today+"T08:30",asset_id:item.truck,ramp_asset_id:item.ramp,driver_selection:"cuenta:"+driver.id};fill(original.data,plan);
      let response=await post(path,original.data);assert.equal(response.status,200,"el rechazo de planificación mantiene fecha y recursos");let body=clean(await response.text());assert.match(body,/otra asignación cercana/);let failed=retained(body,"plan",plan);
      plan.scheduled_for=today+(item.company==="rerchar"?"T17:00":"T22:00");fill(failed.data,plan);response=await post(path,failed.data);assert.equal(response.status,303);assert.equal(response.headers.get("location"),path+"?ok=1#planificacion");
      original=formFrom(await html(path),"replan");retained(await html(path),"replan",plan);
      const denied=await post(path,original.data,"conductor");await denied.text();assert.ok(!(await html(path)).includes("El conductor no cumple"));retained(await html(path),"replan",plan);
      original=formFrom(await html(path),"checklist");const check={vehicle_ok:"on",documents_ok:"on",containment_ok:"on",ppe_ok:"on",vehicle_failure:"on",comment:"Observación conservada <revisar> & confirmar"};fill(original.data,check);
      response=await post(path,original.data);assert.equal(response.status,200);body=clean(await response.text());assert.match(body,/Desmarque Vehículo inspeccionado/);failed=retained(body,"checklist",check);failed.data.delete("vehicle_failure");response=await post(path,failed.data);assert.equal(response.status,303);assert.equal(response.headers.get("location"),path+"?ok=1#checklist");
      const replan=formFrom(await html(path),"replan");replan.data.set("scheduled_for",today+(item.company==="rerchar"?"T17:15":"T22:15"));assert.equal((await post(path,replan.data)).status,303);body=await html(path);assert.ok(!body.includes('>Iniciar ruta<'));assert.equal(formFrom(body,"checklist").data.get("vehicle_ok"),null);
      original=formFrom(body,"checklist");fill(original.data,{...check,vehicle_failure:""});original.data.delete("vehicle_failure");assert.equal((await post(path,original.data)).status,303);
      const dayValues={day:today,outcome:"suspendido",observation:"ab"};original=formFrom(await html(path),"day");fill(original.data,dayValues);response=await post(path,original.data);assert.equal(response.status,200);failed=retained(clean(await response.text()),"day",dayValues);failed.data.set("observation","Suspensión informada para revisión HTTP");assert.equal((await post(path,failed.data)).status,303);
      original=formFrom(await html(path),"start");assert.equal((await post(path,original.data)).status,303);original=formFrom(await html(path),item.company==="rerchar"?"purchaseHandoff":"handoff");assert.equal((await post(path,original.data)).status,303);
      original=formFrom(await html(path),"finish");const finish:Record<string,string>={gross_kg:"100",tare_kg:"150",guide_number:"G-HTTP",...(item.company==="rerchar"?{confirm_guide:"on",confirm_sheet:"on",confirm_material:"on",confirm_weight:"on",confirm_impurities:"on",material_name:"Material verificado HTTP",impurity_kg:"5",missing_ticket_reason:"Ticket no entregado en prueba HTTP",review_note:"Impurezas revisadas <respaldo> & confirmar"}:{})};fill(original.data,finish);
      response=await post(path,original.data);assert.equal(response.status,200);body=clean(await response.text());assert.match(body,/bruto no puede ser inferior/);failed=retained(body,"finish",finish);assert.match(failed.form,/data-document-controlled/);failed.data.set("tare_kg","20");response=await post(path,failed.data);assert.equal(response.status,303);assert.equal(response.headers.get("location"),path+"?ok=1#cierre");assert.match(await html(path),/Servicio completado/);
      const rentalPath=`/solicitudes/${item.rental}`;original=formFrom(await html(rentalPath),"rental");original.data.set("asset_id",item.truck);response=await post(rentalPath,original.data);assert.equal(response.status,200);failed=retained(clean(await response.text()),"rental",{asset_id:item.truck});failed.data.set("asset_id",item.equipment);response=await post(rentalPath,failed.data);assert.equal(response.status,303);
      original=formFrom(await html(rentalPath),"cancel");original.data.set("reason","abc");response=await post(rentalPath,original.data);assert.equal(response.status,200);body=clean(await response.text());failed=retained(body,"cancel",{reason:"abc"});assert.match(body,/<details[^>]*id="cancelar-servicio"[^>]*open/);failed.data.set("reason","Cancelación documentada por HTTP");assert.equal((await post(rentalPath,failed.data)).status,303);assert.match(await html(rentalPath),/Arriendo cancelado/);
      outcomes.push({company:item.company,planningRetained:true,checklistRetained:true,replanningRequiresChecklist:true,dayReportRetained:true,closureRetained:true,rentalAndCancellationRetained:true});
    }
    const result={ok:true,cases:outcomes,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
