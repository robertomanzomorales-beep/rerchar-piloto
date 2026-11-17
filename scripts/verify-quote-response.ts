import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdtemp,readdir,readFile,rm} from "node:fs/promises";
import {createServer,type Socket} from "node:net";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

// Recorrido HTTP real, sin destinatarios ni base de datos de producción.
async function main(){
const directory=await mkdtemp(resolve(tmpdir(),"rerchar-quote-response-"));
const messages:string[]=[],sockets=new Set<Socket>();
let rejectMail=false,server:ReturnType<typeof spawn>|undefined,log="";
const smtp=createServer(socket=>{
  sockets.add(socket);socket.on("close",()=>sockets.delete(socket));
  socket.setTimeout(15000,()=>socket.destroy());
  socket.write("220 localhost SMTP de revisión\r\n");
  let buffer="",data=false,body="";
  socket.on("data",chunk=>{
    buffer+=chunk.toString();
    while(buffer.includes("\r\n")){
      const end=buffer.indexOf("\r\n"),line=buffer.slice(0,end);buffer=buffer.slice(end+2);
      if(data){
        if(line==="."){
          if(!rejectMail)messages.push(body);
          body="";data=false;socket.write(rejectMail?"550 Acuse rechazado para prueba\r\n":"250 Mensaje recibido en memoria\r\n");
        }else body+=line.replace(/^\.\./,".")+"\r\n";
      }else if(/^EHLO|^HELO/.test(line))socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
      else if(/^AUTH PLAIN /.test(line))socket.write("235 Autenticación de prueba aceptada\r\n");
      else if(/^MAIL FROM:|^RCPT TO:|^RSET/.test(line))socket.write("250 OK\r\n");
      else if(line==="DATA"){data=true;socket.write("354 Termine con punto\r\n");}
      else if(line==="QUIT")socket.end("221 Hasta luego\r\n");
      else socket.write("500 Comando no admitido\r\n");
    }
  });
});

async function freePort(){
  const probe=createServer();await new Promise<void>(r=>probe.listen(0,"127.0.0.1",r));
  const address=probe.address();assert.ok(address&&typeof address!=="string");
  await new Promise<void>(r=>probe.close(()=>r()));return address.port;
}
const port=await freePort(),base=`http://127.0.0.1:${port}`;
await new Promise<void>(r=>smtp.listen(0,"127.0.0.1",r));
const smtpAddress=smtp.address();assert.ok(smtpAddress&&typeof smtpAddress!=="string");
Object.assign(process.env,{DATABASE_URL:"",NODE_ENV:"development",VERCEL:"",PGLITE_DATA_DIR:resolve(directory,"db"),
  SMTP_HOST:"127.0.0.1",SMTP_PORT:String(smtpAddress.port),SMTP_USER:"software@example.invalid",SMTP_PASSWORD:randomUUID(),
  SMTP_FROM:"Revisión aislada <software@example.invalid>",APP_BASE_URL:base});
const {db,transaction}=await import("../lib/db");
const quotes=await import("../lib/quotes");
async function closeDatabase(){
  const shared=(globalThis as typeof globalThis&{__rercharDb?:{local?:{close:()=>Promise<void>}}}).__rercharDb;
  if(shared?.local){await shared.local.close();delete shared.local;}
}
async function stopServer(){
  if(!server||server.exitCode!==null)return;
  const child=server;
  await new Promise<void>(r=>{
    const timer=setTimeout(()=>{child.kill("SIGKILL");},5000);
    child.once("exit",()=>{clearTimeout(timer);r();});child.kill("SIGTERM");
  });
}
const page=(token:string,query="")=>fetch(`${base}/cotizaciones/responder/${token}${query}`);
function decisionForm(html:string,decision:string){
  const source=(html.match(/<form\b[\s\S]*?<\/form>/g)||[]).find(form=>form.includes(`value="${decision}"`));
  assert.ok(source,"opción de respuesta disponible: "+decision);
  const form=new FormData();
  for(const input of source.match(/<input\b[^>]*>/g)||[]){
    const name=input.match(/\bname="([^"]*)"/)?.[1];
    if(name)form.set(name,input.match(/\bvalue="([^"]*)"/)?.[1]??"");
  }
  assert.ok([...form.keys()].some(key=>key.startsWith("$ACTION_")),"acción del formulario renderizada por Next");
  return form;
}
async function submit(token:string,form:FormData){
  const response=await fetch(`${base}/cotizaciones/responder/${token}`,{method:"POST",body:form,redirect:"manual",headers:{Origin:base}});
  assert.equal(response.status,303,"el formulario responde con redirección");
  const location=new URL(response.headers.get("location")!,base);
  assert.equal(location.origin,base);return location;
}

try{
  for(const name of (await readdir("db")).filter(f=>/^\d+.*\.sql$/.test(f)).sort()){
    const sql=await readFile(resolve("db",name),"utf8");
    await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name,email) VALUES('Cliente de revisión HTTP','cliente@example.invalid') RETURNING id");
  const [admin]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','hash','admin') RETURNING id");
  const actor={...admin,name:"Admin",email:"admin@example.invalid",role:"admin" as const,client_id:null};
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago"}).format(new Date());
  async function quotation(issuer:"rerchar"|"e_y_j"){
    const id=await quotes.createQuote(actor,{submission_key:randomUUID(),client_id:client.id,issuer,
      title:"Equipo para revisión aislada",issued_on:today,valid_until:today,vat_rate:"0.19",
      company_intro:"Propuesta de revisión aislada.",proposal_objective:"Comprobar el recorrido por enlace de respuesta.",
      line:{description:"Equipo de apoyo",principal:"arriendo",segment:"arriendo_equipo",quantity:"1",unit:"día",unit_price_clp:"100000",taxable:true}});
    await quotes.sendQuote(actor,id,"copia@example.invalid");
    const token=messages.at(-1)!.replace(/=\r?\n/g,"").match(/cotizaciones\/responder\/([a-f0-9]{64})/)?.[1];
    assert.ok(token);return {id,token};
  }
  const rerchar=await quotation("rerchar"),eyj=await quotation("e_y_j"),expired=await quotation("rerchar"),revised=await quotation("e_y_j"),failed=await quotation("rerchar"),concurrent=await quotation("e_y_j");
  const deliveries=messages.length;
  await db.query("UPDATE quote_response_tokens SET expires_at=now()-interval '1 second' WHERE quote_id=$1",[expired.id]);
  await quotes.reopenQuoteRevision(actor,revised.id,"Corregir propuesta antes de su aceptación");
  await closeDatabase();
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",String(port)],
    {env:{...process.env},stdio:["ignore","pipe","pipe"]});
  server.stdout?.on("data",d=>log+=d);server.stderr?.on("data",d=>log+=d);
  await new Promise<void>((r,j)=>{
    const timer=setTimeout(()=>j(new Error("El servidor local no inició: "+log.slice(-1000))),45000);
    server!.stdout?.on("data",d=>{if(String(d).includes("Ready")){clearTimeout(timer);r();}});
    server!.once("exit",code=>{clearTimeout(timer);j(new Error("Servidor terminó: "+code+" "+log.slice(-1000)));});
  });

  let html=await (await page(rerchar.token,"?confirmada=1")).text();
  assert.ok(!html.includes("Su respuesta quedó registrada"),
    "añadir confirmada=1 a un enlace pendiente no debe inventar una respuesta ni un acuse");
  assert.match(html,/Aceptar cotización/);assert.match(html,/RERCHAR/);
  const invalid=decisionForm(html,"aceptada");invalid.set("decision","otra");
  const invalidResult=await submit(rerchar.token,invalid);assert.match(invalidResult.searchParams.get("error")??"",/respuesta válida/);
  assert.equal(messages.length,deliveries,"validar no envía acuses");

  const acceptedForm=decisionForm(html,"aceptada");
  const accepted=await submit(rerchar.token,acceptedForm);
  assert.equal(accepted.searchParams.has("error"),false);
  html=await (await page(rerchar.token)).text();
  assert.match(html,/Su respuesta quedó registrada/);assert.match(html,/aceptada/);
  assert.match(html,/Enviamos un acuse al correo destinatario/);
  assert.doesNotMatch(html,/<button[^>]*>Aceptar cotización/);
  assert.equal(messages.length,deliveries+1);
  assert.match(messages.at(-1)!.replace(/=\r?\n/g,""),/aceptada/);
  const alteredConfirmation=await (await page(rerchar.token,"?acuse=pendiente")).text();
  assert.match(alteredConfirmation,/Enviamos un acuse al correo destinatario/);
  const replay=await submit(rerchar.token,acceptedForm);
  assert.match(replay.searchParams.get("error")??"",/ya se utilizó/);assert.equal(messages.length,deliveries+1);
  const rejection=await submit(eyj.token,decisionForm(await (await page(eyj.token)).text(),"rechazada"));
  assert.equal(rejection.searchParams.has("error"),false);
  html=await (await page(eyj.token)).text();assert.match(html,/rechazada/);assert.equal(messages.length,deliveries+2);

  const concurrentHtml=await (await page(concurrent.token)).text();
  const decisions=await Promise.all([submit(concurrent.token,decisionForm(concurrentHtml,"aceptada")),
    submit(concurrent.token,decisionForm(concurrentHtml,"rechazada"))]);
  assert.equal(decisions.filter(location=>location.searchParams.has("error")).length,1,"sólo una de dos respuestas simultáneas se registra");
  assert.equal(messages.length,deliveries+3,"la concurrencia envía un único acuse");

  const expiredHtml=await (await page(expired.token,"?confirmada=1")).text();
  assert.match(expiredHtml,/Este enlace venció/);assert.doesNotMatch(expiredHtml,/Su respuesta quedó registrada/);
  const forgedExpired=decisionForm(await (await page(failed.token)).text(),"aceptada");forgedExpired.set("token",expired.token);
  assert.match((await submit(expired.token,forgedExpired)).searchParams.get("error")??"",/venció/);
  const revisedHtml=await (await page(revised.token)).text();assert.match(revisedHtml,/404/);
  const unknownHtml=await (await page("f".repeat(64))).text();assert.match(unknownHtml,/404/);

  const failedForm=decisionForm(await (await page(failed.token)).text(),"aceptada");
  rejectMail=true;
  const failureLocation=await submit(failed.token,failedForm);
  assert.equal(failureLocation.searchParams.has("error"),false,"el fallo del acuse no revierte una decisión registrada");
  html=await (await page(failed.token)).text();
  assert.match(html,/Su respuesta quedó registrada/);assert.match(html,/acuse por correo está pendiente/);
  assert.doesNotMatch(html,/Enviamos un acuse/);assert.equal(messages.length,deliveries+3);
  rejectMail=false;
  assert.match((await submit(failed.token,failedForm)).searchParams.get("error")??"",/ya se utilizó/);
  assert.equal(messages.length,deliveries+3,"repetir una decisión no produce otro correo");
  await stopServer();
  assert.equal((await quotes.getQuote(actor,rerchar.id)).quote.status,"aceptada");
  assert.equal((await quotes.getQuote(actor,eyj.id)).quote.status,"rechazada");
  assert.equal((await quotes.getQuote(actor,failed.id)).quote.status,"aceptada");
  assert.equal((await quotes.getQuote(actor,expired.id)).quote.status,"enviada");
  assert.equal((await quotes.getQuote(actor,revised.id)).quote.status,"borrador");
  const acknowledgements=await db.query<{entity_id:string;next_value:{delivery:string}}>("SELECT entity_id,next_value FROM audit_events WHERE action='quote_response_ack'");
  assert.equal(acknowledgements.length,4);
  assert.equal(acknowledgements.find(event=>event.entity_id===failed.id)?.next_value.delivery,"pending");
  assert.equal(acknowledgements.filter(event=>event.next_value.delivery==="sent").length,3);
  assert.equal((await quotes.getEmailQuoteResponse(rerchar.token))?.ack_sent,true);
  assert.equal((await quotes.getEmailQuoteResponse(failed.token))?.ack_sent,false);
  console.log(JSON.stringify({ok:true,companies:2,quotations:6,smtpMessages:messages.length,
    cases:["confirmación falsa","decisión inválida","aceptación","rechazo","confirmación persistente","respuesta simultánea","vencimiento","versión reemplazada","enlace desconocido","fallo del acuse","respuesta repetida","auditoría del acuse"]}));
}finally{
  await stopServer();await closeDatabase();
  for(const socket of sockets)socket.destroy();
  await new Promise<void>(r=>smtp.close(()=>r()));
  await rm(directory,{recursive:true,force:true});
}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
