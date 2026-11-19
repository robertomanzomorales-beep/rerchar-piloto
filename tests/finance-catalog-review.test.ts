import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";

// Aislamiento local: los catálogos grandes y sus errores nunca tocan producción.
test("revisión de contratos, tarifas y comunicaciones",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),finance=await import("../lib/finance");
  for(const name of (await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [admin]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('finance-review@example.invalid','Admin revisión','h','admin') RETURNING id");
  const owner:Actor={...admin,role:"admin",name:"Admin revisión",email:"finance-review@example.invalid",client_id:null};
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente revisión'),('Otro cliente') RETURNING id");
  const [site,foreignSite]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena revisión'),($2,'Faena ajena') RETURNING id",[client.id,other.id]);
  const contractInput={client_id:client.id,site_id:site.id,operating_company:"rerchar",code:"REVISION",starts_on:"2020-01-01",ends_on:"",notes:"Acuerdo de revisión"};
  const contract=await finance.createContract(owner,contractInput);
  const tariffInput={contract_id:contract,service_type:"retiro",waste_type:"",unit:"servicio",unit_price_clp:"100.25",valid_from:"2020-01-01",valid_until:""};
  const tariff=await finance.createTariff(owner,tariffInput);
  const service=async(day:string,company="rerchar")=>(await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,closed_at,created_by)
    VALUES($1,$2,$3,$4,'retiro','Metal','Faena','Patio','completada',$5,$6) RETURNING id`,[randomUUID(),client.id,site.id,company,day+"T15:00:00Z",owner.id]))[0].id;

  await t.test("el catálogo completo conserva contratos antiguos, tarifas inactivas y el orden estable de ambas empresas",async()=>{
    for(const company of ["rerchar","e_y_j"]){
      const rows=await db.query<{id:string}>(`INSERT INTO client_contracts(client_id,operating_company,code,starts_on,created_by,created_at)
        SELECT $1,$2,$2||'-HIST-'||n,'2020-01-01',$3,'2020-01-01' FROM generate_series(1,213) n RETURNING id`,[client.id,company,owner.id]);
      await db.query(`INSERT INTO service_tariffs(contract_id,service_type,waste_type,unit,unit_price_clp,valid_from,active,created_by,created_at)
        SELECT $1,'retiro','Material '||n,'kg',10.25,'2020-01-01',n<>315,$2,'2020-01-01' FROM generate_series(1,315) n`,[rows[212].id,owner.id]);
      const data=await finance.listFinance(owner,company),again=await finance.listFinance(owner,company);
      assert.equal(data.contracts.length,company==="rerchar"?214:213);assert.equal(data.tariffs.length,company==="rerchar"?316:315);
      assert.ok(data.contracts.some(c=>c.id===rows[212].id&&c.available));
      assert.ok(data.tariffs.some(rate=>!rate.active&&!rate.available));
      assert.ok(data.tariffs.every(rate=>rate.operating_company===company));
      assert.deepEqual(data.contracts.map(c=>c.id),again.contracts.map(c=>c.id));assert.deepEqual(data.tariffs.map(c=>c.id),again.tariffs.map(c=>c.id));
    }
  });
  await t.test("las fechas, la faena y las unidades inválidas no dejan registros parciales",async()=>{
    await assert.rejects(()=>finance.createContract(owner,{...contractInput,code:"BAD-SITE",site_id:foreignSite.id}),/faena/);
    await assert.rejects(()=>finance.createContract(owner,{...contractInput,code:"BAD-DATE",ends_on:"2019-12-31"}),/término/);
    for(const change of [{unit:"dia"},{service_type:"arriendo",unit:"kg"},{valid_until:"2019-12-31"},{valid_from:"2020-02-01"}])await assert.rejects(()=>finance.createTariff(owner,{...tariffInput,...change}));
    assert.equal((await db.query<{n:string}>("SELECT count(*)::text n FROM service_tariffs WHERE contract_id=$1",[contract]))[0].n,"1");
    const daily=await finance.createTariff(owner,{...tariffInput,service_type:"arriendo",unit:"dia"});assert.ok(daily);
  });
  let nextTariff="",noticeId="";
  await t.test("el cambio de precio conserva el valor histórico y bloquea una valorización posterior con la vigencia anterior",async()=>{
    const before=await service("2020-01-10");await finance.valueService(owner,before,{tariff_id:tariff,client_order_reference:"OC-1"});
    nextTariff=await finance.reviseTariff(owner,tariff,{unit_price_clp:"120.75",valid_from:"2020-02-01",reason:"Acuerdo comercial documentado"});
    const [old]=await db.query<{until:string}>("SELECT valid_until::text until FROM service_tariffs WHERE id=$1",[tariff]);assert.equal(old.until,"2020-01-31");
    const [snapshot]=await db.query<{price:string;total:string}>("SELECT unit_price_clp::text price,total_clp::text total FROM service_valuations WHERE service_id=$1",[before]);assert.equal(snapshot.price,"100.25");assert.equal(snapshot.total,"100.25");
    const after=await service("2020-02-02");await assert.rejects(()=>finance.valueService(owner,after,{tariff_id:tariff,client_order_reference:""}),/tarifa/);
    await finance.valueService(owner,after,{tariff_id:nextTariff,client_order_reference:""});
    await assert.rejects(()=>finance.reviseTariff(owner,nextTariff,{unit_price_clp:"150",valid_from:"2020-02-02",reason:"Cambio retroactivo sobre valores"}),/valorizados/);
    const [unchanged]=await db.query<{until:string|null}>("SELECT valid_until::text until FROM service_tariffs WHERE id=$1",[nextTariff]);assert.equal(unchanged.until,null);
    const data=await finance.listFinance(owner,"rerchar");noticeId=data.notices[0].id;assert.equal(data.notices.length,1);
    assert.equal((await db.query<{n:string}>("SELECT count(*)::text n FROM audit_events WHERE action='revise' AND entity_id=$1",[nextTariff]))[0].n,"1");
  });
  await t.test("el aviso requiere una comunicación realizada y se conserva visible después de salir del filtro pendiente",async()=>{
    await assert.rejects(()=>finance.recordTariffNotice(owner,noticeId,{channel:"correo",recipient:"inválido",notified_on:"2020-02-01",reference:"Respaldo de comunicación"}),/correo/);
    await assert.rejects(()=>finance.recordTariffNotice(owner,noticeId,{channel:"correo",recipient:"cliente@example.invalid",notified_on:"2099-01-01",reference:"Respaldo de comunicación"}),/futura/);
    assert.equal((await finance.listFinance(owner,"rerchar",false,false,1,"pendiente")).pendingNoticeCount,"1");
    await finance.recordTariffNotice(owner,noticeId,{channel:"presencial",recipient:"Contacto del cliente",notified_on:"2020-02-01",reference:"Acta de entrega firmada"});
    const data=await finance.listFinance(owner,"rerchar",false,false,1,"pendiente",2,{kind:"notice",id:noticeId});assert.equal(data.notices.length,0);assert.equal(data.pendingNoticeCount,"0");assert.equal(data.focusedNotice?.status,"enviado");
    assert.equal((await finance.listFinance(owner,"e_y_j",false,false,1,"",1,{kind:"notice",id:noticeId})).focusedNotice,undefined);
    await assert.rejects(()=>finance.recordTariffNotice(owner,noticeId,{channel:"presencial",recipient:"Contacto del cliente",notified_on:"2020-02-01",reference:"Acta de entrega duplicada"}),/ya fue/);
  });
  await t.test("los clientes o faenas archivados dejan de admitir tarifas y cambios de precio",async()=>{
    await db.query("UPDATE client_sites SET deleted_at=now() WHERE id=$1",[site.id]);
    await assert.rejects(()=>finance.createTariff(owner,{...tariffInput,waste_type:"Material nuevo"}),/faena/);
    await assert.rejects(()=>finance.reviseTariff(owner,nextTariff,{unit_price_clp:"150",valid_from:"2020-03-01",reason:"Acuerdo sobre faena archivada"}),/faena/);
    assert.equal((await finance.listFinance(owner,"rerchar")).contracts.find(c=>c.id===contract)?.available,false);
    await db.query("UPDATE client_sites SET deleted_at=NULL WHERE id=$1",[site.id]);await db.query("UPDATE clients SET deleted_at=now() WHERE id=$1",[client.id]);
    await assert.rejects(()=>finance.createTariff(owner,{...tariffInput,waste_type:"Material nuevo"}),/cliente/);
    await assert.rejects(()=>finance.createContract(owner,{...contractInput,code:"ARCHIVED"}),/Cliente/);
    await db.query("UPDATE clients SET deleted_at=NULL WHERE id=$1",[client.id]);
  });
  await t.test("la clasificación respeta la empresa de valorizaciones previas y mantiene el contrato seleccionado",async()=>{
    const [legacy]=await db.query<{id:string}>("INSERT INTO client_contracts(client_id,code,starts_on,created_by) VALUES($1,'LEGACY','2020-01-01',$2) RETURNING id",[client.id,owner.id]);
    const [legacyRate]=await db.query<{id:string}>("INSERT INTO service_tariffs(contract_id,service_type,unit,unit_price_clp,valid_from,created_by) VALUES($1,'retiro','servicio',1,'2020-01-01',$2) RETURNING id",[legacy.id,owner.id]);
    const linked=await service("2020-02-02","e_y_j");await db.query("INSERT INTO service_valuations(service_id,tariff_id,quantity,unit_price_clp,total_clp,created_by) VALUES($1,$2,1,1,1,$3)",[linked,legacyRate.id,owner.id]);
    await assert.rejects(()=>finance.classifyContractCompany(owner,legacy.id,"rerchar"),/otra empresa/);await finance.classifyContractCompany(owner,legacy.id,"e_y_j");
    const data=await finance.listFinance(owner,"pendiente",false,false,1,"",1,{kind:"classify",id:legacy.id});assert.equal(data.contracts.length,0);assert.equal(data.focusedContract?.operating_company,"e_y_j");
    await assert.rejects(()=>finance.classifyContractCompany(owner,legacy.id,"e_y_j"),/no está pendiente/);
  });
  await t.test("un permiso revocado detiene las cinco modificaciones del catálogo",async()=>{
    await db.query("UPDATE users SET role='operaciones' WHERE id=$1",[owner.id]);
    for(const action of [()=>finance.createContract(owner,{...contractInput,code:"STALE"}),()=>finance.createTariff(owner,{...tariffInput,waste_type:"Otro"}),()=>finance.reviseTariff(owner,nextTariff,{unit_price_clp:"150",valid_from:"2020-03-01",reason:"Cambio de precio autorizado"}),()=>finance.recordTariffNotice(owner,noticeId,{channel:"correo",recipient:"contacto@example.invalid",notified_on:"2020-03-01",reference:"Referencia de comunicación"}),()=>finance.classifyContractCompany(owner,contract,"rerchar")])await assert.rejects(action,/acceso de administración/);
    await db.query("UPDATE users SET role='admin',active=false WHERE id=$1",[owner.id]);await assert.rejects(()=>finance.createContract(owner,{...contractInput,code:"INACTIVE"}),/acceso de administración/);
  });
});
