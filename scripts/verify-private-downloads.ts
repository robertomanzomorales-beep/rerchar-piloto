import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PDFDocument} from "pdf-lib";
import type {Actor} from "../lib/auth";

const disposition=createRequire(import.meta.url)("next/dist/compiled/content-disposition") as {
  parse:(header:string)=>{type:string;parameters:{filename?:string}};
};
type Fixture={label:string;path:string;filename:string;mime:string;bytes:Buffer;allowed:string[];deniedStatus:number};

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-private-downloads-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",EVIDENCE_STORAGE:"database",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");
  let server:ChildProcess|undefined,logs="";
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");
      await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente descargas de revisión'),('Cliente ajeno descargas') RETURNING id");
    const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena descargas de revisión') RETURNING id",[client.id]);
    const actors:Record<string,Actor>={},tokens:Record<string,string>={};
    for(const key of ["admin","operaciones","conductor","cliente","ajeno"]){
      const role=key==="ajeno"?"cliente":key;
      const [actor]=await db.query<Actor>("INSERT INTO users(email,name,password_hash,role,client_id) VALUES($1,$2,'h',$3,CASE WHEN $3='cliente' THEN $4::uuid ELSE NULL END) RETURNING id,email,name,role,client_id",[key+"@private-downloads.example.invalid","Revisión "+key,role,key==="ajeno"?other.id:client.id]);
      actors[key]=actor;tokens[key]=randomBytes(32).toString("hex");
      await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(tokens[key]).digest("hex"),actor.id]);
    }
    const {addEvidence}=await import("../lib/pilot");
    const {createMaterialReceipt}=await import("../lib/materials");
    const {addOperationFile}=await import("../lib/operation-files");
    const {uploadCounterpartyDocument}=await import("../lib/counterparties");
    const fixtures:Fixture[]=[];
    const pdf=async(label:string)=>{const doc=await PDFDocument.create();doc.addPage().drawText(label);return Buffer.from(await doc.save());};
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64");
    for(const company of ["rerchar","e_y_j"] as const){
      const [service]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,driver_id,created_by)
        VALUES(gen_random_uuid(),$1,$2,$3,'traslado','Material de revisión','Faena','Patio','programada',$4,$5) RETURNING id`,[client.id,site.id,company,actors.conductor.id,actors.admin.id]);
      const filename=`Guía Niño's (1)* ${company}.png`;
      const id=await addEvidence(actors.operaciones,service.id,"Respaldo de revisión",new File([png],filename,{type:"image/png"}),"guia_traslado",{company});
      fixtures.push({label:"evidencia-"+company,path:"/api/evidencia/"+id,filename,mime:"image/png",bytes:png,allowed:["admin","operaciones","conductor","cliente"],deniedStatus:404});
    }
    const receipt=await createMaterialReceipt(actors.admin,{client_id:client.id,kind:"ingreso",receipt_mode:"directa",movement_on:"2026-11-20",site_name:"Faena de revisión",driver_name:"Conductor externo de prueba",driver_tax_id:"12345678-5",truck_plate:"QAAB-12",origin_guide:"GUIA-REVISION",material_name:"Material de revisión",rerchar_kg:"1000",net_basis:"rerchar"});
    for(const [filename,kind] of [["Guía Niño's (1)*.pdf","guia"],["guia-normal.pdf","ticket"]] as const){
      const bytes=await pdf("Receipt attachment "+kind),id=await addOperationFile(actors.admin,"receipt",receipt,kind,new File([bytes],filename,{type:"application/pdf"}));
      fixtures.push({label:"ingreso-"+kind,path:"/api/archivos-operacion/"+id,filename,mime:"application/pdf",bytes,allowed:["admin","operaciones","cliente"],deniedStatus:404});
    }
    for(const company of ["rerchar","e_y_j"] as const){
      const [invoice]=await db.query<{id:string}>(`INSERT INTO supplier_invoices(issuer,supplier_tax_id,supplier_name,invoice_number,issued_on,description,net_clp,vat_clp,total_clp,recorded_by)
        VALUES($1,'12345678-5','Proveedor de revisión','FACT-REVISION','2026-11-20','Factura de prueba',1000,190,1190,$2) RETURNING id`,[company,actors.admin.id]);
      const filename=`Factura proveedor (copia) ${company}.pdf`,bytes=await pdf("Supplier invoice "+company);
      const id=await addOperationFile(actors.admin,"invoice",invoice.id,"factura",new File([bytes],filename,{type:"application/pdf"}));
      fixtures.push({label:"factura-"+company,path:"/api/archivos-operacion/"+id,filename,mime:"application/pdf",bytes,allowed:["admin"],deniedStatus:404});
    }
    const [profile]=await db.query<{id:string}>(`INSERT INTO counterparty_profiles(client_id,kind,legal_name,tax_id,business_activity,legal_address,locality,phone,general_email,tax_status,legal_representative,invoice_email,payment_terms,created_by,updated_by)
      VALUES($1,'cliente','Cliente de revisión','12345678-5','Servicios','Dirección de revisión','Calama','555555555','revision@example.invalid','afecto','Representante de revisión','revision@example.invalid','contado',$2,$2) RETURNING id`,[client.id,actors.admin.id]);
    const filename="Ficha legal (N° 1) O'Connor.pdf",bytes=await pdf("Counterparty legal document");
    await uploadCounterpartyDocument(actors.admin,profile.id,"rut_empresa",new File([bytes],filename,{type:"application/pdf"}));
    const [document]=await db.query<{id:string}>("SELECT id FROM counterparty_documents WHERE profile_id=$1",[profile.id]);
    fixtures.push({label:"ficha-legal",path:"/api/fichas/documentos/"+document.id,filename,mime:"application/pdf",bytes,allowed:["admin"],deniedStatus:403});
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();
    delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const listener=createServer();await new Promise<void>(r=>listener.listen(0,"127.0.0.1",r));const address=listener.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));
    const base=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
    server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(Error("Next no inició: "+logs.slice(-1000))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(Error("Next terminó "+code));});});
    const outcomes=[];
    for(const fixture of fixtures)for(const role of ["admin","operaciones","conductor","cliente","ajeno",""]){
      const errors:string[]=[],allowed=fixture.allowed.includes(role),expected=role?(allowed?200:fixture.deniedStatus):401;
      const response=await fetch(base+fixture.path,{redirect:"manual",headers:role?{Cookie:`rerchar_session=${tokens[role]}`}:{},signal:AbortSignal.timeout(120000)});
      const content=Buffer.from(await response.arrayBuffer());
      if(response.status!==expected)errors.push(`estado ${response.status}; esperado ${expected}`);
      if(allowed&&response.status===200){
        if(!content.equals(fixture.bytes))errors.push("contenido modificado o incompleto tras reabrir la base en otro proceso");
        if(response.headers.get("content-type")!==fixture.mime)errors.push("MIME incorrecto");
        if(response.headers.get("cache-control")!=="private, no-store")errors.push("caché privada incorrecta");
        if(response.headers.get("x-content-type-options")!=="nosniff")errors.push("falta nosniff");
        try{const parsed=disposition.parse(response.headers.get("content-disposition")||"");if(parsed.type!=="attachment"||parsed.parameters.filename!==fixture.filename)errors.push("nombre de descarga modificado");}
        catch(error){errors.push("Content-Disposition inválido: "+(error instanceof Error?error.message:String(error)));}
      }
      if(!allowed&&content.equals(fixture.bytes))errors.push("el archivo se entregó sin permiso");
      outcomes.push({file:fixture.label,role:role||"anonimo",status:response.status,expected,ok:errors.length===0,errors});
    }
    const result={ok:outcomes.every(x=>x.ok),files:fixtures.length,checks:outcomes.length,allowedDownloads:outcomes.filter(x=>x.expected===200).length,reopenedInNewApplicationProcess:true,productionMutations:false,emailsSent:false,outcomes,evidenceDirectory:work};
    await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert.ok(result.ok,"Falló la revisión de descargas privadas");
  }finally{if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}await writeFile(join(work,"server.log"),logs);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
