import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {createServer,type Socket} from "node:net";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("cotización por SMTP conserva PDF, vigencia chilena, decisión única y acuse para ambas empresas",async()=>{
  // El servidor sólo escucha en loopback y todos los destinatarios son ficticios.
  process.env.PGLITE_DATA_DIR="memory://";
  const messages:string[]=[],sockets=new Set<Socket>();
  const server=createServer(socket=>{
    sockets.add(socket);socket.on("close",()=>sockets.delete(socket));
    socket.setTimeout(15000,()=>socket.destroy());
    socket.write("220 localhost SMTP de prueba\r\n");
    let buffer="",data=false,body="";
    socket.on("data",chunk=>{
      buffer+=chunk.toString();
      while(buffer.includes("\r\n")){
        const end=buffer.indexOf("\r\n"),line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(data){
          if(line==="."){messages.push(body);body="";data=false;socket.write("250 Mensaje recibido en memoria\r\n");}
          else body+=line.replace(/^\.\./,".")+"\r\n";
        }else if(/^EHLO|^HELO/.test(line))socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
        else if(/^AUTH PLAIN /.test(line))socket.write("235 Autenticación de prueba aceptada\r\n");
        else if(/^MAIL FROM:|^RCPT TO:|^RSET/.test(line))socket.write("250 OK\r\n");
        else if(line==="DATA"){data=true;socket.write("354 Termine con punto\r\n");}
        else if(line==="QUIT")socket.end("221 Hasta luego\r\n");
        else socket.write("500 Comando no admitido\r\n");
      }
    });
  });
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const address=server.address();assert.ok(address&&typeof address!=="string");
  Object.assign(process.env,{SMTP_HOST:"127.0.0.1",SMTP_PORT:String(address.port),SMTP_USER:"software@example.invalid",
    SMTP_PASSWORD:randomUUID(),SMTP_FROM:"Software de prueba <software@example.invalid>",APP_BASE_URL:"https://revision.example.invalid"});
  try{
    const {db,transaction}=await import("../lib/db"),quotes=await import("../lib/quotes");
    for(const name of (await readdir("db")).filter(f=>/^\d+.*\.sql$/.test(f)).sort()){
      const sql=await readFile(resolve("db",name),"utf8");
      await transaction(async tx=>{for(const statement of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(statement);});
    }
    await db.query("SET TIME ZONE 'UTC'");
    const [client]=await db.query<{id:string}>("INSERT INTO clients(name,email) VALUES('Cliente de prueba SMTP','cliente@example.invalid') RETURNING id");
    const [admin]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('admin@example.invalid','Admin','hash','admin') RETURNING id");
    const actor:Actor={...admin,name:"Admin",email:"admin@example.invalid",role:"admin",client_id:null};
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago"}).format(new Date());
    const nextDay=new Date(today+"T12:00:00Z");nextDay.setUTCDate(nextDay.getUTCDate()+1);
    for(const issuer of ["rerchar","e_y_j"] as const){
      const id=await quotes.createQuote(actor,{submission_key:randomUUID(),client_id:client.id,issuer,
        title:"Arriendo de prueba SMTP",issued_on:today,valid_until:today,vat_rate:"0.19",
        company_intro:"Presentación del emisor para prueba aislada.",proposal_objective:"Validar el envío de la propuesta y su respuesta.",
        line:{description:"Equipo de apoyo",principal:"arriendo",segment:"arriendo_equipo",quantity:"2",unit:"día",unit_price_clp:"150000",taxable:true}});
      const before=messages.length;
      await quotes.sendQuote(actor,id,"jefe@example.invalid");
      assert.equal(messages.length,before+1);
      const mime=messages[before],decoded=mime.replace(/=\r?\n/g,"");
      assert.match(decoded,/jefe@example.invalid/);
      const token=decoded.match(/cotizaciones\/responder\/([a-f0-9]{64})/)?.[1];assert.ok(token);
      const detail=await quotes.getQuote(actor,id);assert.equal(detail.quote.status,"enviada");
      const [snapshot]=await db.query<{pdf:Uint8Array;sha256:string}>("SELECT pdf,sha256 FROM client_quote_pdf_snapshots WHERE quote_id=$1",[id]);
      const boundary=mime.match(/boundary="([^"]+)"/)?.[1];assert.ok(boundary);
      const attachment=mime.split("--"+boundary).find(p=>p.includes("Content-Type: application/pdf"));assert.ok(attachment);
      const pdf=Buffer.from(attachment.slice(attachment.indexOf("\r\n\r\n")+4).trim(),"base64");
      assert.equal(pdf.subarray(0,4).toString(),"%PDF");
      assert.equal(createHash("sha256").update(pdf).digest("hex"),snapshot.sha256);
      assert.deepEqual(pdf,Buffer.from(snapshot.pdf));
      const [expiry]=await db.query<{local_end:string}>("SELECT to_char(expires_at AT TIME ZONE 'America/Santiago','YYYY-MM-DD HH24:MI:SS') AS local_end FROM quote_response_tokens WHERE quote_id=$1",[id]);
      assert.equal(expiry.local_end,nextDay.toISOString().slice(0,10)+" 00:00:00","la vigencia incluye todo el último día de Chile, aunque PostgreSQL use UTC");
      const decision=issuer==="rerchar"?"aceptada":"rechazada";
      assert.equal((await quotes.respondToQuoteEmail(token,decision)).ackSent,true);
      assert.equal(messages.length,before+2);
      assert.match(messages[before+1].replace(/=\r?\n/g,""),new RegExp(decision));
      assert.equal((await quotes.getQuote(actor,id)).quote.status,decision);
      await assert.rejects(()=>quotes.respondToQuoteEmail(token,decision),/ya se utilizó/);
      assert.equal(messages.length,before+2,"un enlace usado no vuelve a enviar el acuse");
    }
  }finally{
    for(const socket of sockets)socket.destroy();
    await new Promise<void>(r=>server.close(()=>r()));
    for(const key of ["SMTP_HOST","SMTP_PORT","SMTP_USER","SMTP_PASSWORD","SMTP_FROM","APP_BASE_URL"])delete process.env[key];
  }
});
