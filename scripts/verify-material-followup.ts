import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {mkdtemp,readdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

async function main(){
  const work=await mkdtemp(join(tmpdir(),"rerchar-material-followup-http-"));
  Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",SMTP_HOST:"",PGLITE_DATA_DIR:join(work,"db")});
  const {db,transaction}=await import("../lib/db");
  const materials=await import("../lib/materials"),files=await import("../lib/operation-files");
  let server:ChildProcess|undefined,logs="";
  const decode=(s:string)=>s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const clean=(s:string)=>s.replace(/<!--[\s\S]*?-->/g,"");
  const labels={guide:"Guardar seguimiento",references:"Guardar factura y referencias",payment:"Guardar estado de pago",notice:"Registrar aviso enviado"};
  function formFrom(body:string,kind:keyof typeof labels|"upload"){
    const label=kind==="upload"?"Guardar archivo":labels[kind];
    const form=(body.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(x=>x.includes(label));assert.ok(form,kind);
    const data=new FormData();
    for(const input of form.match(/<input\b[^>]*>/g)||[]){const name=input.match(/\bname="([^"]*)"/)?.[1];if(name)data.set(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1]||""));}
    return {form,data};
  }
  function inputValue(form:string,name:string){const input=(form.match(/<input\b[^>]*>/g)||[]).find(x=>x.includes(`name="${name}"`));assert.ok(input,name);return decode(input.match(/\bvalue="([^"]*)"/)?.[1]||"");}
  function selected(form:string,name:string){const select=form.match(new RegExp('<select[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))?.[1];assert.ok(select,name);return select.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1]||"";}
  try{
    for(const name of (await readdir("db")).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(join("db",name),"utf8");
      await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
    }
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente HTTP de cierre') RETURNING id");
    const actors=await db.query<{id:string;role:string}>(`INSERT INTO users(email,name,password_hash,role,client_id) VALUES
      ('admin@example.invalid','Admin','h','admin',null),('client@example.invalid','Cliente','h','cliente',$1) RETURNING id,role`,[client.id]);
    const user=actors.find(a=>a.role==="admin")!,tokens:Record<string,string>={};
    for(const actor of actors){const token=randomBytes(32).toString("hex");tokens[actor.role]=token;await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash("sha256").update(token).digest("hex"),actor.id]);}
    const actor={id:user.id,name:"Admin",email:"admin@example.invalid",role:"admin" as const,client_id:null};
    const receipt=await materials.createMaterialReceipt(actor,{client_id:client.id,kind:"ingreso",movement_on:"2026-11-10",site_name:"Faena HTTP",weighing_ticket:"HTTP-CIERRE",material_name:"Material HTTP",rerchar_kg:"100",net_basis:"rerchar"});
    for(const kind of ["guia_valorizada","factura","comprobante","certificado"])await files.addOperationFile(actor,"receipt",receipt,kind,new File(["%PDF-1.4\nlocal fixture"],"respaldo-http.pdf",{type:"application/pdf"}));
    await materials.updateMaterialGuideFollowup(actor,receipt,{requested_on:"2026-11-12",received_on:"2026-11-14",valued_guide:"GV-HTTP"});
    await materials.updateMaterialReferences(actor,receipt,{entry_sheet:"H-HTTP",invoice_number:"F-HTTP",invoice_direction:"emitida",invoice_issued_on:"2026-11-15",certificate_number:"C-HTTP"});
    await (globalThis as typeof globalThis&{__rercharDb:{local:{close:()=>Promise<void>}}}).__rercharDb.local.close();
    delete (globalThis as typeof globalThis&{__rercharDb?:unknown}).__rercharDb;
    const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,"127.0.0.1",r));
    const address=portServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>portServer.close(()=>r()));
    const base=`http://127.0.0.1:${port}`,path=`/ingresos/${receipt}`;
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env},stdio:["ignore","pipe","pipe"],detached:true});
    server.stdout!.on("data",d=>logs+=d);server.stderr!.on("data",d=>logs+=d);
    const request=(role="admin",options:RequestInit={})=>fetch(base+path,{...options,redirect:"manual",headers:{...options.headers,...(role?{Cookie:`rerchar_session=${tokens[role]}`}:{})},signal:AbortSignal.timeout(60000)});
    const html=async()=>{const r=await request();assert.equal(r.status,200);return clean(await r.text());};
    await new Promise<void>((r,j)=>{const timer=setTimeout(()=>j(new Error("Next no inició: "+logs.slice(-800))),45000);server!.stdout!.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});server!.once("exit",code=>{clearTimeout(timer);j(new Error("Next terminó "+code));});});
    const scenarios:{kind:keyof typeof labels;values:Record<string,string>;correction:Record<string,string>;error:RegExp;anchor:string}[]=[
      {kind:"guide",values:{requested_on:"2026-11-17",received_on:"2026-11-16",valued_guide:"GV-HTTP-CORR"},correction:{requested_on:"2026-11-12"},error:/La recepción no puede preceder/,anchor:"guia-valorizada"},
      {kind:"references",values:{entry_sheet:"HOJA-CORREGIDA",invoice_number:"",invoice_direction:"recibida",invoice_issued_on:"2026-11-17",certificate_number:"C-HTTP-CORR"},correction:{invoice_number:"F-HTTP-CORR"},error:/Para confirmar la factura/,anchor:"factura-documentos"},
      {kind:"payment",values:{payment_status:"parcial",paid_on:"2026-11-18",payment_reference:""},correction:{payment_reference:"TR-HTTP-CORR"},error:/indique fecha y referencia/,anchor:"pago-material"},
      {kind:"notice",values:{notified_on:"2026-11-15",recipient:"persona@example.invalid",note:"Correo corregido <revisar> & confirmar"},correction:{notified_on:"2026-11-19"},error:/La fecha del aviso no puede preceder/,anchor:"aviso-documental"},
    ];
    const outcomes=[];
    for(const scenario of scenarios){
      const initial=formFrom(await html(),scenario.kind);
      for(const [key,value] of Object.entries(scenario.values))initial.data.set(key,value);
      const post=(data:FormData,role="admin")=>request(role,{method:"POST",body:data,headers:{Origin:base}});
      let response=await post(initial.data);assert.equal(response.status,200,"el error debe volver al formulario sin borrar lo ingresado");
      const body=clean(await response.text());assert.match(body,scenario.error);assert.match(body,/Los datos ingresados se conservan/);
      const failed=formFrom(body,scenario.kind);
      for(const [key,value] of Object.entries(scenario.values)){
        if(key==="note")assert.match(failed.form,/Correo corregido &lt;revisar&gt; &amp; confirmar/);
        else assert.equal(key==="invoice_direction"||key==="payment_status"?selected(failed.form,key):inputValue(failed.form,key),value,key);
      }
      const savedBefore=formFrom(await html(),scenario.kind);
      assert.notEqual(inputValue(savedBefore.form,scenario.kind==="guide"?"valued_guide":scenario.kind==="references"?"entry_sheet":scenario.kind==="payment"?"paid_on":"notified_on"),scenario.values[scenario.kind==="guide"?"valued_guide":scenario.kind==="references"?"entry_sheet":scenario.kind==="payment"?"paid_on":"notified_on"],"un rechazo no guarda cambios parciales");
      for(const [key,value] of Object.entries({...scenario.values,...scenario.correction}))failed.data.set(key,value);
      assert.equal((await post(failed.data,"")).status,303,"la acción exige sesión");
      response=await post(failed.data);assert.equal(response.status,303);
      assert.equal(response.headers.get("location"),`${path}?ok=1#${scenario.anchor}`,"guardar vuelve a su sección");
      const saved=formFrom(await html(),scenario.kind);
      for(const [key,value] of Object.entries({...scenario.values,...scenario.correction})){
        if(key==="note")assert.match(saved.form,/Correo corregido &lt;revisar&gt; &amp; confirmar/);
        else assert.equal(key==="invoice_direction"||key==="payment_status"?selected(saved.form,key):inputValue(saved.form,key),value,key);
      }
      outcomes.push({kind:scenario.kind,fieldsRetained:true,correctionSaved:true,sectionReturn:true});
    }
    const upload=formFrom(await html(),"upload");
    upload.data.set("target","receipt");upload.data.set("kind","factura");
    upload.data.set("file",new File(["%PDF-1.4\ncorrected local fixture"],"factura-corregida-http.pdf",{type:"application/pdf"}));
    const uploaded=await request("admin",{method:"POST",body:upload.data,headers:{Origin:base}});assert.equal(uploaded.status,303);
    const afterUpload=await html(),reopened=formFrom(afterUpload,"notice");
    assert.equal(inputValue(reopened.form,"notified_on"),"","la nueva factura deja el aviso pendiente en pantalla");
    assert.equal(inputValue(reopened.form,"recipient"),"");assert.ok(!reopened.form.includes("Correo corregido &lt;revisar&gt;"));
    assert.ok(afterUpload.includes("factura-corregida-http.pdf"));
    assert.equal(selected(formFrom(afterUpload,"payment").form,"payment_status"),"parcial","subir documentos conserva el estado de pago");
    const clientResponse=await request("cliente");assert.equal(clientResponse.status,200);const clientBody=clean(await clientResponse.text());
    for(const label of Object.values(labels))assert.ok(!clientBody.includes(label),"el cliente no recibe formularios de administración");
    const result={ok:true,cases:outcomes,correctedAttachmentReopensNotice:true,paymentPreserved:true,permissions:true,productionMutations:false,emailsSent:false,evidenceDirectory:work};
    await writeFile(join(work,"http-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{
    if(server?.pid){try{process.kill(-server.pid,"SIGTERM");}catch{}}
    await writeFile(join(work,"server.log"),logs);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
