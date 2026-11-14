import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {createServer} from "node:net";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("EDP conserva cada PDF entregado y verifica un envío de correo incierto antes de reintentar",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const edp=await import("../lib/payment-statements");
  const migrations=(await readdir(resolve(process.cwd(),"db"))).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
  for(const name of migrations){
    const sql=await readFile(resolve(process.cwd(),"db",name),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name,tax_id,address,email) VALUES('Cliente EDP','99.999.999-9','Dirección de prueba','cliente@ejemplo.cl') RETURNING id");
  const [user]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('edp@demo.cl','Administración','h','admin') RETURNING id");
  const admin:Actor={id:user.id,name:"Administración",email:"edp@demo.cl",role:"admin",client_id:null};
  async function draft(){
    const id=await edp.createPaymentStatement(admin,{submission_key:randomUUID(),client_id:client.id,number:randomUUID(),
      period_on:"2026-10-01",statement_type:"arriendo",client_name:"Cliente EDP",client_tax_id:"99.999.999-9",
      client_address:"Dirección de prueba",client_contact:"cliente@ejemplo.cl"});
    await edp.saveStatementOperation(admin,id,{line_number:1,description:"Arriendo excavadora",rental_from:"2026-10-01",rental_to:"2026-10-31"});
    await edp.saveStatementCharge(admin,id,{line_number:1,description:"Arriendo mensual",pricing:"clp_servicio",unit_value:"100000",quantity:"1"});
    return id;
  }
  const first=await draft();
  await assert.rejects(()=>edp.recordManualStatementDelivery(admin,first,{channel:"correo_manual",reference:"Entrega realizada el 3 de octubre"}),
    /correo/);
  await edp.recordManualStatementDelivery(admin,first,{channel:"correo_manual",recipient:"cliente@ejemplo.cl",
    reference:"Correo enviado el 3 de octubre"});
  assert.equal((await edp.getPaymentStatement(admin,first)).statement.status,"enviado");
  const [original]=await db.query<{pdf:Uint8Array;sha256:string}>(`SELECT pdf,sha256 FROM payment_statement_deliveries
    WHERE statement_id=$1`,[first]);
  assert.equal(original.sha256,createHash("sha256").update(original.pdf).digest("hex"));
  assert.ok(original.pdf.length>1500);
  await assert.rejects(()=>edp.recordManualStatementDelivery(admin,first,{channel:"presencial",reference:"Intento duplicado de entrega"}),
    /borrador u observado/);
  await edp.setPaymentStatementStatus(admin,first,"observado");
  await edp.setPaymentStatementStatus(admin,first,"borrador");
  const line=(await edp.getPaymentStatement(admin,first)).charges[0];
  await edp.saveStatementCharge(admin,first,{line_id:line.id,line_number:1,description:"Arriendo mensual corregido",pricing:"clp_servicio",
    unit_value:"120000",quantity:"1"});
  await edp.recordManualStatementDelivery(admin,first,{channel:"presencial",reference:"Entregado en oficina el 5 de octubre"});
  const deliveries=await db.query<{pdf:Uint8Array}>(`SELECT pdf FROM payment_statement_deliveries
    WHERE statement_id=$1 ORDER BY created_at,id`,[first]);
  assert.equal(deliveries.length,2);
  assert.notDeepEqual(deliveries[0].pdf,deliveries[1].pdf,"la versión anterior conserva sus bytes");

  const second=await draft();
  Object.assign(process.env,{SMTP_HOST:"127.0.0.1",SMTP_PORT:"1",SMTP_USER:"demo",SMTP_PASSWORD:"demo",SMTP_FROM:"demo@ejemplo.cl"});
  await assert.rejects(()=>edp.sendPaymentStatement(admin,second,"cliente@ejemplo.cl"),/Revise el correo saliente/);
  assert.equal((await edp.latestStatementDelivery(admin,second))?.status,"verificar");
  assert.equal((await edp.getPaymentStatement(admin,second)).statement.status,"borrador");
  await assert.rejects(()=>edp.saveStatementOperation(admin,second,{line_number:2,description:"Edición prohibida",rental_from:"2026-10-01",rental_to:"2026-10-31"}),
    /envío pendiente/);
  await assert.rejects(()=>edp.sendPaymentStatement(admin,second,"cliente@ejemplo.cl"),/sin confirmar/);
  await edp.resolveStatementDelivery(admin,second,{outcome:"no_enviado",reference:"Se verificó bandeja saliente y no consta entrega"});
  await edp.recordManualStatementDelivery(admin,second,{channel:"presencial",reference:"Entregado tras verificar la incidencia"});
  assert.equal((await edp.latestStatementDelivery(admin,second))?.status,"enviado");

  const received:string[]=[];
  const server=createServer(socket=>{
    socket.write("220 smtp.test ESMTP\r\n");let buffer="",inData=false,content="";
    socket.on("data",chunk=>{
      buffer+=chunk.toString("utf8");let end;
      while((end=buffer.indexOf("\r\n"))>=0){
        const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(inData){if(line==="."){received.push(content);content="";inData=false;socket.write("250 queued\r\n");}else content+=`${line}\n`;continue;}
        if(/^EHLO/i.test(line))socket.write("250-smtp.test\r\n250 AUTH PLAIN\r\n");
        else if(/^AUTH /i.test(line))socket.write("235 authenticated\r\n");
        else if(/^MAIL FROM|^RCPT TO/i.test(line))socket.write("250 ok\r\n");
        else if(/^DATA/i.test(line)){inData=true;socket.write("354 send data\r\n");}
        else if(/^QUIT/i.test(line)){socket.write("221 bye\r\n");socket.end();}
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const address=server.address();assert.ok(address&&typeof address!=="string");
    process.env.SMTP_PORT=String(address.port);
    const third=await draft();
    await edp.sendPaymentStatement(admin,third,"cliente@ejemplo.cl");
    assert.equal((await edp.latestStatementDelivery(admin,third))?.status,"enviado");
    assert.equal((await edp.getPaymentStatement(admin,third)).statement.status,"enviado");
    assert.equal(received.length,1,"el SMTP recibió un solo mensaje");
    assert.match(received[0],/application\/pdf/);
    assert.match(received[0],/cliente@ejemplo.cl/);
  }finally{server.close();}

  const invalid=edp.statementTotals([], [{...line,pricing:"uf_unidad",quantity:"1",uf_value_clp:null}]);
  assert.equal(invalid.total_clp,null,"UF sin conversión no equivale a cero");
  assert.equal(edp.statementTotals([], [{...line,quantity:null}]).total_clp,null,"cantidad faltante no equivale a cero");
});
