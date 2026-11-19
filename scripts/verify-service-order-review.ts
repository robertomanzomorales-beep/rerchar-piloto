import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-service-order-review-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");let server:ChildProcess|undefined,logs="";
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  const article=(body:string)=>{const result=body.match(/<article\b[^>]*class="order-sheet service-order-sheet"[\s\S]*?<\/article>/)?.[0];assert.ok(result,"Orden presente en la respuesta");return result;};
  const weight=(body:string,name:string)=>body.match(new RegExp(`data-order-weight="${name}">([^<]*)`))?.[1];
  const calendar=(day:string)=>new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",day:"2-digit",month:"short",year:"numeric"}).format(new Date(day+"T12:00:00Z"));
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});}
    const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente orden HTTP'),('Cliente ajeno orden HTTP') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena orden HTTP') RETURNING id",[client.id]);
    const [truck,ramp,equipment]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind,plate) VALUES('ORD-CAM-HTTP','Camión orden HTTP','camion','ORD-100'),('ORD-RAM-HTTP','Rampla orden HTTP','rampa','ORD-200'),('ORD-EQU-HTTP','Equipo orden HTTP','equipo',NULL) RETURNING id");
    const users:Record<string,{id:string}>={},tokens:Record<string,string>={};
    for(const role of ["admin","operaciones","conductor","cliente","ajeno","otro_conductor"] as const){const actual=role==="ajeno"?"cliente":role==="otro_conductor"?"conductor":role,[user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id",[role+"@service-order.example.invalid","Revisión "+role,actual,role==="ajeno"?other.id:client.id]);users[role]=user;const token=randomBytes(32).toString("hex");tokens[role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);}
    const [external]=await db.query<{id:string}>("INSERT INTO external_drivers(name,tax_id,company_name,created_by) VALUES('Conductor tercero HTTP','12345678-5','Transportista revisión HTTP',$1) RETURNING id",[users.admin.id]),[precise,unknown]=await db.query<{id:string}>("INSERT INTO material_catalog(name) VALUES('Material preciso HTTP'),('Material sin cantidad HTTP') RETURNING id");
    const notes='Observación con tildes, "comillas" y & caracteres.\n'+"Antecedente completo de revisión. ".repeat(35)+"FIN-OBSERVACION-HTTP";
    const kinds=["planned","closed_missing","closed_zero","rental","rental_closed","canceled","draft","external"] as const;
    const fixtures:Record<string,Record<string,{id:string;folio:string}>>={};
    for(const company of ["rerchar","e_y_j"] as const){
      fixtures[company]={};
      for(const kind of kinds){
        const rental=kind.startsWith("rental"),closed=kind.startsWith("closed")||kind==="rental_closed",draft=kind==="draft",third=kind==="external",planned=kind==="planned",assigned=!rental&&!draft&&kind!=="closed_missing";
        const [service]=await db.query<{id:string;folio:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,request_category,service_type,waste_type,origin,destination,status,scheduled_for,assigned_asset_id,ramp_asset_id,driver_id,external_driver_id,created_by,rental_from,rental_to,gross_kg,tare_kg,notes,guide_number)
          VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,'Material o equipo HTTP','Origen HTTP','Destino HTTP',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id,folio`,[
          client.id,site.id,company,planned&&company==="rerchar"?"compra":"servicios",rental?"arriendo":"traslado",closed?"completada":draft?"solicitada":kind==="canceled"?"cancelada":"programada",assigned?"2026-09-29T02:30:00Z":null,rental?equipment.id:assigned?truck.id:null,assigned?ramp.id:null,!rental&&!draft&&!third?users.conductor.id:null,third?external.id:null,users.admin.id,rental?"2026-09-28":null,rental?"2026-09-30":null,kind==="closed_zero"?"100.30":kind==="closed_missing"&&company==="e_y_j"?"100.30":null,kind==="closed_zero"?"100.30":kind==="closed_missing"&&company==="rerchar"?"0":null,planned?notes:null,assigned?"GUIA-ORD-HTTP":null]);
        fixtures[company][kind]=service;
        if(planned){await db.query("INSERT INTO service_checklists(service_id,vehicle_ok,documents_ok,containment_ok,ppe_ok,comment,completed_by,completed_at) VALUES($1,true,false,true,true,'Control previo HTTP',$2,'2026-09-29T02:30:00Z')",[service.id,users.operaciones.id]);if(company==="rerchar")await db.query("INSERT INTO service_request_materials(service_id,position,material_id,material_name,quantity_kg,unit_price_clp,line_note) VALUES($1,2,$3,'Material sin cantidad HTTP',NULL,123456.78,NULL),($1,1,$2,'Material preciso HTTP',0.001,876543.21,'Separar para recepción HTTP')",[service.id,precise.id,unknown.id]);}
      }
    }
    const [unclassified]=await db.query<{id:string}>("INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,request_category,service_type,waste_type,origin,destination,created_by) VALUES(gen_random_uuid(),$1,$2,NULL,'servicios','traslado','Sin empresa HTTP','Origen','Destino',$3) RETURNING id",[client.id,site.id,users.admin.id]);
    console.log(JSON.stringify({phase:"fixtures",companies:2,services:17,productionMutations:false}));
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,role="admin")=>fetch(base+path,{redirect:"manual",headers:role?{Cookie:`rerchar_session=${tokens[role]}`}:{},signal:AbortSignal.timeout(120000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,role);assert.equal(r.status,200);const body=clean(await r.text());assert.ok(!body.includes("NEXT_HTTP_ERROR_FALLBACK;500"));return body;};
    const denied=async(path:string,role:string)=>{const r=await request(path,role),body=await r.text();assert.ok(r.status===404||body.includes("NEXT_HTTP_ERROR_FALLBACK;404"));assert.ok(!body.includes('class="order-sheet service-order-sheet"'));};
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const outcomes=[];
    for(const company of ["rerchar","e_y_j"] as const){
      const f=fixtures[company];
      for(const kind of kinds){
        const path="/solicitudes/"+f[kind].id+"/orden",body=await html(path),sheet=article(body),prefix=company==="rerchar"?"RER":"EYJ";
        assert.ok(sheet.includes(`data-company="${company}"`));assert.ok(sheet.includes(`${prefix}-${String(f[kind].folio).padStart(5,"0")}`));assert.ok(sheet.includes("Cliente orden HTTP")&&sheet.includes("Faena orden HTTP"));assert.ok(body.includes("Imprimir o guardar PDF"));
        if(company==="rerchar"){assert.ok(sheet.includes('alt="RERCHAR Economía Circular"'));assert.ok(sheet.includes('loading="eager"'));assert.ok(!sheet.includes('class="order-eyj-brand"'));}else{assert.ok(sheet.includes('class="order-eyj-brand"'));assert.ok(!sheet.includes('alt="RERCHAR Economía Circular"'));}
        if(kind==="planned"){
          for(const text of ["ORD-100 · Camión orden HTTP","ORD-200 · Rampla orden HTTP","Revisión conductor","GUIA-ORD-HTTP","Conforme","Pendiente","Revisión operaciones","Control previo HTTP","FIN-OBSERVACION-HTTP"])assert.ok(sheet.includes(text),text);
          const schedule=new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date("2026-09-29T02:30:00Z"));assert.ok(sheet.includes(schedule));assert.ok(sheet.includes("Sin estimación"));assert.ok(!sheet.includes('data-order-state="draft"'));
          if(company==="rerchar"){assert.ok(sheet.indexOf('data-order-material="1"')<sheet.indexOf('data-order-material="2"'));assert.ok(sheet.includes("0,001 kg")&&sheet.includes("Por confirmar")&&sheet.includes("Separar para recepción HTTP"));}else assert.ok(!sheet.includes("Materiales de la solicitud"));
        }
        if(kind==="closed_missing"){assert.equal(weight(sheet,"gross"),company==="rerchar"?"Sin registro":"100,3 kg");assert.equal(weight(sheet,"tare"),company==="rerchar"?"0 kg":"Sin registro");assert.equal(weight(sheet,"net"),"Sin registro");assert.ok(sheet.includes("ORDEN DE SERVICIO")&&!sheet.includes("BORRADOR DE ORDEN"));assert.ok(sheet.includes("Sin registro"));}
        if(kind==="closed_zero"){assert.equal(weight(sheet,"net"),"0 kg");assert.equal(weight(sheet,"gross"),"100,3 kg");assert.equal(weight(sheet,"tare"),"100,3 kg");}
        if(kind.startsWith("rental")){assert.ok(sheet.includes("ORDEN DE ARRIENDO")&&sheet.includes(calendar("2026-09-28"))&&sheet.includes(calendar("2026-09-30")));assert.ok(sheet.includes("Equipo orden HTTP"));for(const text of ["Peso bruto","Control previo","Programación y despacho","Pendiente de asignación"])assert.ok(!sheet.includes(text),text);if(kind==="rental_closed")assert.ok(sheet.includes("El cierre no contempla pesaje"));}
        if(kind==="canceled"){assert.ok(sheet.includes("ORDEN CANCELADA")&&sheet.includes('data-order-state="canceled"'));assert.ok(sheet.match(/class="service-order-notice"[^>]*>Servicio cancelado\./));}
        if(kind==="draft"){assert.ok(sheet.includes("BORRADOR DE ORDEN")&&sheet.includes('data-order-state="draft"'));assert.ok(sheet.includes("Programación o recursos de despacho pendientes de confirmar"));}
        if(kind==="external"){for(const text of ["Conductor tercero HTTP","12345678-5","Transportista revisión HTTP"])assert.ok(sheet.includes(text),text);}
        for(const price of ["876543.21","123456.78","876.543,21","123.456,78"])assert.ok(!body.includes(price),"Precio no operativo no debe aparecer: "+price);
        for(const role of ["operaciones","cliente"])assert.ok(article(await html(path,role)).includes(`data-company="${company}"`));
        if(kind.startsWith("rental")||kind==="draft"||kind==="external")await denied(path,"conductor");else assert.ok(article(await html(path,"conductor")).includes(`data-company="${company}"`));
        await denied(path,"ajeno");await denied(path,"otro_conductor");
      }
      outcomes.push({company,states:kinds.length,companyIdentity:true,allMaterialsWithoutPrices:true,missingAndZeroWeights:true,rentalCalendarDates:true,fullNotesAndChecklist:true,currentRoleScope:true});console.log(JSON.stringify({phase:"orders",company,cases:kinds.length,ok:true}));
    }
    const path="/solicitudes/"+unclassified.id+"/orden",body=await html(path),sheet=article(body);assert.ok(sheet.includes('data-company="unassigned"')&&sheet.includes("BORRADOR DE ORDEN")&&sheet.includes("Empresa operadora por confirmar"));assert.ok(!sheet.includes('alt="RERCHAR Economía Circular"')&&!sheet.includes('class="order-eyj-brand"'));assert.ok(!body.includes("Imprimir o guardar PDF"));await denied("/solicitudes/no-es-uuid/orden","admin");const anonymous=await request(path,"");assert.ok([307,303].includes(anonymous.status));assert.ok(anonymous.headers.get("location")?.includes("/ingresar"));
    const result={ok:true,cases:outcomes,services:17,unclassifiedDraft:true,anonymousAndInvalidId:true,actualPrintDialogTested:false,visualPdfTested:false,productionMutations:false,emailsSent:false,evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
