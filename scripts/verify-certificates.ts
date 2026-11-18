import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PDFDocument} from "pdf-lib";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-certificates-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db"),APP_BASE_URL:"http://localhost:3000"});
  const {db,transaction}=await import("../lib/db"),certs=await import("../lib/certificates"),compliance=await import("../lib/compliance");
  let server:ChildProcess|undefined,logs="";
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const labels={prepare:"Guardar borrador sin emitir",issue:"Emitir versión y habilitar PDF",revoke:"Revocar y conservar historial"};
  function formFrom(body:string,kind:keyof typeof labels){
    const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes(labels[kind]));assert.ok(form,kind);
    const data=new FormData();
    for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||""));}
    for(const tag of form.match(/<select\b[\s\S]*?<\/select>/g)||[]){const name=tag.match(/\bname="([^"]*)"/)?.[1];if(name){const options=tag.match(/<option\b[^>]*>/g)||[],option=options.find(x=>x.includes('selected=""'))??options[0];data.set(name,decode(option?.match(/\bvalue="([^"]*)"/)?.[1]||""));}}
    return {form,data};
  }
  function historyRows(body:string){
    // React puede enviar filas o celdas en fragmentos posteriores al contenedor inicial.
    // Se integran sus contenidos HTML en las plantillas, sin ejecutar scripts de la respuesta.
    const fragments=new Map([...body.matchAll(/<table hidden><(tbody|tr) id="S:([^"]+)">([\s\S]*?)<\/\1><\/table>/g)].map(x=>[x[2],x[3]]));
    let section=body.match(/<section[^>]*id="historial-certificados"[\s\S]*?<\/section>/)?.[0];assert.ok(section,"historial");
    for(let pass=0;pass<fragments.size;pass++){let expanded=false;section=section.replace(/<template id="P:([^"]+)"><\/template>/g,(original,id)=>{const fragment=fragments.get(id);if(fragment===undefined)return original;expanded=true;return fragment;});if(!expanded)break;}
    const tbody=section.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1]??"";
    return (tbody.match(/<tr\b[\s\S]*?<\/tr>/g)||[]).map(row=>{const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(x=>decode(x[1].replace(/<[^>]*>/g,"")));return `${cells[0]}|${cells[2]}`;});
  }
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente privado HTTP'),('Otra empresa HTTP') RETURNING id");
    const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena HTTP') RETURNING id",[client.id]);
    const users=await db.query<{id:string;role:string;client_id:string|null}>(`INSERT INTO users(email,name,password_hash,role,client_id) VALUES
      ('admin@example.invalid','Admin','h','admin',null),('client@example.invalid','Cliente','h','cliente',$1),
      ('other@example.invalid','Otra empresa','h','cliente',$2),('driver@example.invalid','Conductor','h','conductor',null) RETURNING id,role,client_id`,[client.id,other.id]);
    const admin=users.find(u=>u.role==="admin")!,tokens:Record<string,string>={};
    for(const user of users){const token=randomBytes(32).toString("hex"),key=user.role==="cliente"?(user.client_id===client.id?"client":"other"):user.role;tokens[key]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),user.id]);}
    const actor={id:admin.id,name:"Admin",email:"admin@example.invalid",role:"admin" as const,client_id:null};
    async function readyService(){
      const [service]=await db.query<{id:string;folio:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,gross_kg,tare_kg,closed_at,created_by)
        VALUES($1,$2,$3,'rerchar','retiro','Metal limpio','Origen','Destino','completada',150,100,'2026-11-01',$4) RETURNING id,folio`,[randomUUID(),client.id,site.id,admin.id]);
      await db.query("INSERT INTO service_evidence(service_id,description,storage_key,created_by) VALUES($1,'Evidencia de prueba','fixture.pdf',$2)",[service.id,admin.id]);
      const record=await compliance.saveWasteRecord(actor,{service_id:service.id,category:"no_peligroso",classification:"Metal limpio",generator_name:"Generador HTTP",transporter_name:"RERCHAR",receiver_name:"Receptor HTTP",treatment:"Reciclaje",guide_number:"G-HTTP"});
      await compliance.reviewWasteRecord(actor,record);return service;
    }
    const firstService=await readyService();await certs.saveCertificateDraft(actor,firstService.id);const initialId=await certs.issueCertificate(actor,firstService.id,"EMITIR"),initial=await certs.getCertificate(actor,initialId);
    const preparation=await readyService(),historical=await readyService();
    await db.query(`INSERT INTO service_certificates(service_id,version,code,snapshot,issued_by,issued_at,status,revoked_by,revoked_at,revocation_reason)
      SELECT $1,n,lpad(to_hex(n),48,'0'),$2::jsonb,$3,'2026-11-02','revocado',$3,'2026-11-03','Reemplazo de prueba' FROM generate_series(1,205) n`,[historical.id,JSON.stringify({...initial.snapshot,folio:`RER-${String(historical.folio).padStart(5,"0")}`}),admin.id]);
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
    const base=`http://127.0.0.1:${port}`;process.env.APP_BASE_URL=base;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
    server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(path:string,role="admin",options:RequestInit={})=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async(path:string,role="admin")=>{const r=await request(path,role);assert.equal(r.status,200);return clean(await r.text());};
    const post=(path:string,data:FormData,role="admin")=>request(path,role,{method:"POST",body:data,headers:{Origin:base}});
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    let original=formFrom(await html(`/certificados?service_id=${preparation.id}`),"prepare");original.data.set("service_id",preparation.id);original.data.set("document_type","disposicion_final");
    let response=await post("/certificados",original.data);assert.equal(response.status,200,"un rechazo conserva servicio y tipo de documento");
    let body=clean(await response.text());assert.match(body,/tratamiento de disposición final/);assert.match(body,/Los datos ingresados se conservan/);
    let failed=formFrom(body,"prepare");assert.equal(failed.data.get("service_id"),preparation.id);assert.equal(failed.data.get("document_type"),"disposicion_final");
    failed.data.set("document_type","servicio");response=await post("/certificados",failed.data);assert.equal(response.status,303);assert.equal(response.headers.get("location"),"/certificados?borrador=1#borradores-certificados");
    body=await html("/certificados");await writeFile(join(work,"history-first-page.html"),body);assert.match(body,/Borradores sin emitir/);assert.equal(historyRows(body).length,100);
    original=formFrom(body,"issue");original.data.set("confirmation","NO EMITIR");response=await post("/certificados",original.data);assert.equal(response.status,303);assert.ok(response.headers.get("location")?.includes("error="));
    original.data.set("confirmation","EMITIR");response=await post("/certificados",original.data);assert.equal(response.status,303);const issuedLocation=response.headers.get("location")!;assert.match(issuedLocation,/certificado=[0-9a-f-]+/);
    assert.equal((await post("/certificados",original.data)).headers.get("location"),issuedLocation,"un reintento no emite otra versión");
    const pdfResponse=await request(`/api/certificados/${initialId}/pdf`,"client");assert.equal(pdfResponse.status,200);assert.equal(pdfResponse.headers.get("content-type"),"application/pdf");assert.equal(pdfResponse.headers.get("cache-control"),"private, no-store");
    const bytes=new Uint8Array(await pdfResponse.arrayBuffer()),pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);assert.ok(bytes.length>7000);assert.match(pdf.getTitle()??"",/Certificado de servicio/);await writeFile(join(work,"certificate.pdf"),bytes);
    assert.equal((await request(`/api/certificados/${initialId}/pdf`,"other")).status,404);assert.equal((await request(`/api/certificados/${initialId}/pdf`,"")).status,401);
    const verifyPath=`/verificar/${initial.code}`;const validPage=await html(verifyPath,"");assert.match(validPage,/Certificado vigente/);assert.ok(!validPage.includes("Cliente privado HTTP"),"el QR público no revela datos del cliente");
    const revokePath="/certificados?pagina=1&revocar=1";original=formFrom(await html(revokePath),"revoke");original.data.set("id",initialId);original.data.set("reason","abc");
    response=await post(revokePath,original.data);assert.equal(response.status,200);body=clean(await response.text());failed=formFrom(body,"revoke");assert.equal(failed.data.get("id"),initialId);assert.equal(failed.data.get("reason"),"abc");assert.match(body,/<details[^>]*open/);
    failed.data.set("reason","Corrección documental HTTP <revisar> & confirmar");response=await post(revokePath,failed.data);assert.equal(response.status,303);assert.equal(response.headers.get("location"),"/certificados?ok=1&pagina=1#historial-certificados");
    assert.match(await html(verifyPath,""),/Certificado revocado/);assert.equal((await request(`/api/certificados/${initialId}/pdf`)).status,410);assert.equal((await request(`/api/certificados/${initialId}/pdf`,"client")).status,404);
    const rows=[];for(let page=1;page<=3;page++){const pageRows=historyRows(await html(`/certificados?pagina=${page}`));assert.equal(pageRows.length,page<3?100:7);rows.push(...pageRows);}
    assert.equal(new Set(rows).size,207,"el historial completo se recorre sin duplicar versiones");
    const clientBody=await html("/certificados","client");assert.equal(historyRows(clientBody).length,1);assert.ok(!clientBody.includes(labels.prepare));assert.ok(!clientBody.includes(labels.revoke));assert.equal(historyRows(await html("/certificados","other")).length,0);
    const clamp=await request("/certificados?pagina=999&ok=1");const clampBody=await clamp.text(),target=clamp.headers.get("location");assert.ok(target?target.includes("pagina=3")&&target.includes("ok=1"):clampBody.includes("NEXT_REDIRECT")&&clampBody.includes("pagina=3")&&clampBody.includes("ok=1"));
    const driver=await request("/certificados","conductor");assert.ok([303,307].includes(driver.status)||(await driver.text()).includes("NEXT_REDIRECT"));
    const result={ok:true,prepareFieldsRetained:true,revokeFieldsRetained:true,draftBeforeIssue:true,retryWithoutDuplicate:true,pdfSinglePage:true,publicStatusAndPrivacy:true,revokedPdfBlocked:true,historyRows:207,historyPages:3,clientScope:true,clampKeepsNotice:true,productionMutations:false,emailsSent:false,pdfPath:join(work,"certificate.pdf"),evidenceDirectory:work};await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
