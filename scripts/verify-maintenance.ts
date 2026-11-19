import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-maintenance-http-"));
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
  function retained(body:string,marker:string,values:Record<string,string>,source?:string){const result=formFrom(body,marker,source);for(const [key,value]of Object.entries(values))assert.equal(result.data.get(key),value,key);assert.match(body,/Los datos ingresados se conservan/);return result;}
  const marker=(kind:string)=>`data-maintenance-form="${kind}"`;
  function expandTableFragments(body:string){
    const fragments=new Map([...body.matchAll(/<table hidden><(tbody|tr) id="S:([^"]+)">([\s\S]*?)<\/\1><\/table>/g)].map(x=>[x[2],x[3]]));
    for(let pass=0;pass<fragments.size;pass++){let expanded=false;body=body.replace(/<template id="P:([^"]+)"><\/template>/g,(tag,key)=>{if(!fragments.has(key))return tag;expanded=true;return fragments.get(key)!;});if(!expanded)break;}
    return body;
  }
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const maintenance=await import("../lib/continuity");
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente revisión mantenimiento HTTP') RETURNING id");
    const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena HTTP') RETURNING id",[client.id]);
    const actors:Record<string,import('../lib/auth').Actor>={},tokens:Record<string,string>={};
    for(const role of ["admin","operaciones","conductor","cliente"] as const){
      const [user]=await db.query<import('../lib/auth').Actor>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id,name,email,role,client_id",[role+"@maintenance.example.invalid","Revisión "+role,role,client.id]);
      actors[role]=user;const token=randomBytes(32).toString("hex");tokens[role]=token;
      await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);
    }
    const [truck,grabA,grabB,noMeter]=await db.query<{id:string}>(`INSERT INTO assets(code,label,kind,reading_unit,current_reading) VALUES
      ('CAM-HTTP','Camión de revisión','camion','km',100),('EQ-HTTP-A','Equipo RERCHAR de revisión','equipo','horas',100),
      ('EQ-HTTP-B','Equipo E y J de revisión','equipo','horas',100),('RAM-HTTP','Rampla sin horómetro','rampa','sin',0) RETURNING id`);
    await db.query(`INSERT INTO maintenance_plans(asset_id,title,frequency_kind,interval_days,next_due_date,created_by,created_at)
      SELECT $1,'Pauta HTTP '||n,'fecha',30,(now() AT TIME ZONE 'America/Santiago')::date+1,$2,'2026-01-01' FROM generate_series(1,203) n`,[truck.id,actors.admin.id]);
    await db.query(`INSERT INTO work_orders(asset_id,title,kind,created_by,created_at) SELECT $1,'Orden HTTP '||n,'correctiva',$2,'2026-01-01' FROM generate_series(1,163) n`,[truck.id,actors.admin.id]);
    await db.query(`INSERT INTO fleet_incidents(asset_id,description,severity,reported_by,reported_at) SELECT $1,'Avería HTTP '||n,'media',$2,'2026-01-01' FROM generate_series(1,113) n`,[truck.id,actors.admin.id]);
    await db.query("INSERT INTO tires(code) SELECT 'NEU-HTTP-'||lpad(n::text,3,'0') FROM generate_series(1,313) n");
    const [occupied]=await db.query<{id:string}>("UPDATE tires SET status='instalado',asset_id=$1,position='Delantera ocupada' WHERE code='NEU-HTTP-001' RETURNING id",[truck.id]);
    const [warehouse]=await db.query<{id:string}>("INSERT INTO warehouses(code,name) VALUES('HTTP','Bodega HTTP') RETURNING id");
    const [item]=await db.query<{id:string}>("INSERT INTO stock_items(code,name,unit) VALUES('FILTRO-HTTP','Filtro HTTP','un') RETURNING id");
    await db.query("INSERT INTO stock_balances(item_id,warehouse_id,quantity) VALUES($1,$2,5)",[item.id,warehouse.id]);
    const hourOrders:string[]=[],hourPlans:string[]=[];
    for(const asset of [grabA,grabB]){
      const plan=await maintenance.createHourMaintenancePlan(actors.admin,{asset_id:asset.id,template_key:"pc200-250",next_due_reading:350,lead_reading:25});hourPlans.push(plan);
      hourOrders.push(await maintenance.createWorkOrder(actors.admin,{asset_id:asset.id,plan_id:plan,incident_id:"",kind:"preventiva",title:"Mantención por horómetro HTTP",description:"",scheduled_for:"",blocks_asset:true}));
    }
    for(const company of ["rerchar","e_y_j"])await db.query(`WITH added AS (
      INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,origin,destination,priority,created_by,operating_company)
      SELECT gen_random_uuid(),$1,$5,'traslado','Material','Faena','Patio','normal',$2,$3 FROM generate_series(1,101) RETURNING id
      ) INSERT INTO fleet_incidents(asset_id,source_service_id,description,severity,reported_by,reported_at)
      SELECT $4,id,'Hallazgo checklist HTTP','alta',$2,'2026-01-01' FROM added`,[client.id,actors.admin.id,company,truck.id,site.id]);
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,options:RequestInit={},role="admin")=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const post=(path:string,data:FormData,role="admin")=>request(actions.get(data)||path,{method:"POST",body:data,headers:{Origin:base}},role);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const seen={plan:[] as string[],order:[] as string[],incident:[] as string[],tire:[] as string[]};
    for(let page=1;page<=4;page++){
      const body=await html("/mantenimiento?"+new URLSearchParams({pagina_planes:String(Math.min(page,3)),pagina_ordenes:String(Math.min(page,2)),pagina_averias:String(page),pagina_neumaticos:String(page)}));
      for(const key of ["plan","order","incident","tire"] as const){if(key==="plan"&&page>3||key==="order"&&page>2)continue;seen[key].push(...[...body.matchAll(new RegExp(`data-${key}-id="([^"]+)"`,"g"))].map(x=>x[1]));}
    }
    for(const [kind,count]of [["plan",205],["order",165],["incident",315],["tire",313]] as const){assert.equal(seen[kind].length,count,kind);assert.equal(new Set(seen[kind]).size,count,kind+" unique");}
    console.log(JSON.stringify({phase:"pagination",plans:205,orders:165,incidents:315,tires:313}));
    const outcomes=[];
    for(const [index,company]of ["rerchar","e_y_j"].entries()){
      const role=index?"operaciones":"admin",context={empresa:company,pagina_planes:"3",pagina_ordenes:"2",pagina_averias:"2",pagina_neumaticos:"4"},path="/mantenimiento?"+new URLSearchParams(context);
      const checkedTarget=(response:Response,anchor?:string)=>{assert.equal(response.status,303);const target=new URL(response.headers.get("location")!,base);for(const [key,value]of Object.entries(context))assert.equal(target.searchParams.get(key),value,key);if(anchor)assert.equal(target.hash,"#"+anchor);return target.pathname+target.search;};
      async function rejected(kind:string,values:Record<string,string>,source?:string,where=path){const original=formFrom(await html(where),marker(kind),source);fill(original.data,values);const response=await post(where,original.data,role);assert.equal(response.status,200,kind+" conserva formulario");const body=clean(await response.text());return {...retained(body,marker(kind),values,source),body};}
      let failed=await rejected("asset",{asset_id:truck.id,brand:"Marca conservada "+company,model:"Modelo conservado",model_year:"1800",reading_unit:"km"});failed.data.set("model_year","2024");checkedTarget(await post(path,failed.data,role),"ficha-activo");
      failed=await rejected("reading",{asset_id:truck.id,reading:"99",note:"Lectura conservada "+company});assert.match(failed.form,/min="100\.00"/);failed.data.set("reading","100");checkedTarget(await post(path,failed.data,role),"lecturas");
      failed=await rejected("plan",{asset_id:truck.id,title:"Pauta conservada "+company,frequency_kind:"fecha",interval_days:"0",next_due_date:"2027-01-01",lead_days:"17",lead_reading:"500"});failed.data.set("interval_days","30");checkedTarget(await post(path,failed.data,role),"crear-pauta");
      failed=await rejected("hour_plan",{asset_id:index?grabB.id:grabA.id,template_key:"pc200-1000",next_due_reading:"90",lead_reading:"23"});failed.data.set("next_due_reading","1100");checkedTarget(await post(path,failed.data,role),"pautas-horometro");
      const body=await html(path),manualForm=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes(marker("order"))&&!x.includes('data-source-id='));assert.ok(manualForm);
      let original=formFrom(manualForm,marker("order"));fill(original.data,{asset_id:truck.id,plan_id:"",incident_id:"",kind:"correctiva",title:"ab",description:"Descripción conservada "+company,scheduled_for:"2027-01-02",blocks_asset:"on"});
      let response=await post(path,original.data,role);assert.equal(response.status,200);let rejectedBody=clean(await response.text());failed={...retained(rejectedBody,marker("order"),{title:"ab",description:"Descripción conservada "+company,scheduled_for:"2027-01-02",blocks_asset:"on"},""),body:rejectedBody};assert.match(failed.form,/type="checkbox"[^>]*checked=""/);failed.data.set("title","Reparación manual "+company);const detailPath=checkedTarget(await post(path,failed.data,role),"trabajo-registrado");
      original=formFrom(await html(detailPath),marker("start"));checkedTarget(await post(detailPath,original.data,role),"cierre-orden");
      failed=await rejected("reserve",{item_id:item.id,warehouse_id:warehouse.id,quantity:"9",reason:"Reserva conservada "+company},undefined,detailPath);failed.data.set("quantity","1");checkedTarget(await post(detailPath,failed.data,role),"repuestos-orden");
      failed=await rejected("close",{resolution:"Reparación y prueba conservadas "+company,supplier:"Taller conservado",reading:"50",labor_cost:"12345",parts_cost:"23456"},undefined,detailPath);failed.data.set("reading","100");checkedTarget(await post(detailPath,failed.data,role),"cierre-orden");assert.match(await html(detailPath),/consumida/);
      const cancelBody=await html(path),manual=(cancelBody.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes(marker("order"))&&!x.includes('data-source-id='));assert.ok(manual);original=formFrom(manual,marker("order"));fill(original.data,{asset_id:noMeter.id,title:"Orden para cancelar "+company,kind:"correctiva",plan_id:"",incident_id:"",description:"",scheduled_for:""});original.data.delete("blocks_asset");const cancelPath=checkedTarget(await post(path,original.data,role));failed=await rejected("cancel",{reason:"abc"},undefined,cancelPath);assert.match(failed.body,/<details[^>]*id="cancelar-orden"[^>]*open/);failed.data.set("reason","Cancelación ficticia documentada");checkedTarget(await post(cancelPath,failed.data,role),"trabajo-registrado");
      failed=await rejected("tire",{code:"NEU-HTTP-001",brand:"Marca conservada",size:"11R22.5",warehouse_id:warehouse.id});failed.data.set("code","ZZ-"+company);checkedTarget(await post(path,failed.data,role),"neumaticos");
      // Find the exact row instead of depending on its rank among streamed table chunks.
      const rows=expandTableFragments(await html(path)).match(/<tr\b[\s\S]*?<\/tr>/g)||[],newRow=rows.find(x=>x.includes('<strong>'+('ZZ-'+company).toUpperCase()+'</strong>'));assert.ok(newRow);const tireId=newRow.match(/data-tire-id="([^"]+)"/)![1];
      failed=await rejected("move_tire",{tire_id:tireId,action:"instalar",asset_id:truck.id,position:"Delantera ocupada",reason:"Montaje conservado "+company,warehouse_id:warehouse.id},tireId);assert.match(failed.body,/<details[^>]*class="maintenance-tire-control"[^>]*open/);failed.data.set("position","Delantera "+company);checkedTarget(await post(path,failed.data,role),"neumatico-"+tireId);
      failed=await rejected("move_tire",{tire_id:tireId,action:"retirar",asset_id:truck.id,position:"Delantera "+company,reason:"abc",warehouse_id:warehouse.id},tireId);failed.data.set("reason","Retiro ficticio documentado");checkedTarget(await post(path,failed.data,role),"neumatico-"+tireId);
      const planBody=await html(path),quick=(planBody.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes(marker("order"))&&x.includes('name="plan_id" value="')&&!x.includes('name="plan_id" value=""'));assert.ok(quick);const planId=quick.match(/data-source-id="([^"]+)"/)![1];
      failed=await rejected("order",{kind:"correctiva"},planId);failed.data.set("kind","preventiva");const quickPath=checkedTarget(await post(path,failed.data,role));const afterQuick=await html(path);assert.ok(!afterQuick.includes('data-source-id="'+planId+'"'));assert.ok(afterQuick.includes(new URL(quickPath,base).pathname));
      const faultPath="/mantenimiento?"+new URLSearchParams({...context,averias:"abiertas",pagina:"2"}),faultBody=await html(faultPath),faultForm=(faultBody.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes(marker("order"))&&x.includes('name="incident_id" value="')&&!x.includes('name="incident_id" value=""'));assert.ok(faultForm);const faultId=faultForm.match(/data-source-id="([^"]+)"/)![1];
      failed=await rejected("order",{kind:"preventiva"},faultId,faultPath);failed.data.set("kind","correctiva");const faultResponse=await post(faultPath,failed.data,role),faultTarget=checkedTarget(faultResponse);assert.match(faultResponse.headers.get("location")!,/averias=abiertas/);assert.match(await html(faultTarget),/Hallazgo checklist HTTP/);
      const hourPath="/mantenimiento/"+hourOrders[index]+"?"+new URLSearchParams(context);original=formFrom(await html(hourPath),marker("start"));checkedTarget(await post(hourPath,original.data,role));const hourBody=await html(hourPath);assert.match(formFrom(hourBody,marker("close")).form,/<input(?=[^>]*name="reading")(?=[^>]*required)[^>]*>/);
      failed=await rejected("close",{resolution:"Pauta realizada "+company,supplier:"Taller HTTP",reading:"",labor_cost:"10",parts_cost:"20"},undefined,hourPath);assert.match(failed.body,/Registre el horómetro/);failed.data.set("reading","350");checkedTarget(await post(hourPath,failed.data,role));assert.match(await html(hourPath),/Trabajo cerrado/);
      const fleetPath="/flota?"+new URLSearchParams({empresa:company,pagina:"2"});failed=await rejected("report",{asset_id:"00000000-0000-4000-8000-000000000099",severity:"critica",observed_on:"2026-10-20",description:"Falla conservada "+company},undefined,fleetPath);failed.data.set("asset_id",truck.id);response=await post(fleetPath,failed.data,role);assert.equal(response.status,303);assert.match(response.headers.get("location")!,/empresa=/);assert.match(response.headers.get("location")!,/pagina=2/);
      failed=await rejected("resolve",{resolution:"abc"},undefined,fleetPath);failed.data.set("resolution","Reparación ficticia verificada");response=await post(fleetPath,failed.data,role);assert.equal(response.status,303);assert.equal(new URL(response.headers.get("location")!,base).hash,"#averias");
      outcomes.push({company,role,formsRetainValues:true,contextPreserved:true,reservationsConsumedOnce:true,requiredHourReading:true,tireInstallAndReturn:true,activePlanOrderLink:true,checklistOrderCreated:true});
      console.log(JSON.stringify({phase:"forms",company,complete:true}));
    }
    for(const [path,param]of [["/mantenimiento?pagina_planes=999&empresa=e_y_j&ok=1","pagina_planes=3"],["/mantenimiento?averias=abiertas&pagina=999&empresa=e_y_j&ok=1","pagina=2"],["/flota?pagina=999&empresa=e_y_j&ok=1","pagina=7"]]){const r=await request(path),body=await r.text(),location=r.headers.get("location");assert.ok(location?location.includes(param)&&location.includes("ok=1"):body.includes("NEXT_REDIRECT")&&body.includes(param)&&body.includes("ok=1"));}
    for(const role of ["conductor","cliente",""])for(const path of ["/mantenimiento","/flota","/mantenimiento/"+hourOrders[0]]){const r=await request(path,{},role),body=await r.text();assert.ok(r.status>=300&&r.status<400||body.includes("NEXT_REDIRECT"));assert.ok(!body.includes(marker("reading"))&&!body.includes(marker("report")));}
    const unauthorized=formFrom(await html("/flota"),marker("report"));fill(unauthorized.data,{asset_id:truck.id,severity:"media",observed_on:"",description:"No autorizado"});const before=(await html("/flota")).match(/<strong>(\d+)<\/strong><span>Averías abiertas/)!;await post("/flota",unauthorized.data,"conductor");assert.equal((await html("/flota")).match(/<strong>(\d+)<\/strong><span>Averías abiertas/)![1],before[1]);
    const result={ok:true,cases:outcomes,pagination:{plans:205,orders:165,incidents:315,tires:313},forms:13,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
