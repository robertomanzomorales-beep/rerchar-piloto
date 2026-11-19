import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("los cargos conservan propuesta, parte y decisión sin duplicar cobros",async t=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db"),charges=await import("../lib/extra-charges"),receivables=await import("../lib/receivables");
  for(const name of (await readdir("db")).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile("db/"+name,"utf8");await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean))await tx.query(part);});
  }
  const [adminUser,opsUser]=await db.query<{id:string}>("INSERT INTO users(email,name,password_hash,role) VALUES('charge-admin@example.invalid','Admin revisión','h','admin'),('charge-ops@example.invalid','Operaciones revisión','h','operaciones') RETURNING id");
  const admin:Actor={...adminUser,role:"admin",name:"Admin revisión",email:"charge-admin@example.invalid",client_id:null},ops:Actor={...opsUser,role:"operaciones",name:"Operaciones revisión",email:"charge-ops@example.invalid",client_id:null};
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente de cargos revisión') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena revisión') RETURNING id",[client.id]),[asset]=await db.query<{id:string}>("INSERT INTO assets(code,label,kind) VALUES('CAM-CARGOS-REV','Camión revisión','camion') RETURNING id");
  const services:Record<string,string>={},pending:Record<string,string>={};
  for(const company of ["rerchar","e_y_j"]){
    const [service]=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,created_by)
      VALUES(gen_random_uuid(),$1,$2,$3,'traslado','Material','Faena','Patio','completada',$4) RETURNING id`,[client.id,site.id,company,ops.id]);services[company]=service.id;
    await db.query(`INSERT INTO service_day_reports(service_id,day,asset_id,outcome,observation,recorded_by)
      SELECT $1,'2020-01-01'::date+n,$2,'incompleto','Antecedente original del parte',$3 FROM generate_series(0,210) n`,[service.id,asset.id,ops.id]);
    const rows=await db.query<{id:string}>(`INSERT INTO service_extra_charges(submission_key,service_id,service_day,kind,reason,source_outcome,source_observation,amount_clp,created_by,created_at)
      SELECT gen_random_uuid(),$1,'2020-01-01','sobrestadia','Cargo histórico '||n,'incompleto','Antecedente original del parte',1.25,$2,'2020-01-01' FROM generate_series(1,217) n RETURNING id`,[service.id,ops.id]);pending[company]=rows[0].id;
  }
  const proposal={submission_key:randomUUID(),service_day:"2020-01-01",kind:"flete_falso",reason:"Trabajo suspendido según respaldo",amount_clp:"10.25",quote_reference:"COT-REV",client_order_reference:"OC-REV"};let original="",withoutAmount="";
  await t.test("el historial y las referencias de partes superan 120 registros y mantienen orden estable",async()=>{
    for(const company of ["rerchar","e_y_j"] as const){
      const full=await charges.serviceExtraCharges(ops,services[company]),days=await charges.extraChargeDays(ops,services[company]),seen:string[]=[];assert.equal(full.length,217);assert.equal(days.length,211);assert.equal(String(days.at(-1)?.day).slice(0,10)==="2020-01-01"||new Date(days.at(-1)!.day).toISOString().slice(0,10)==="2020-01-01",true);
      for(let offset=0;offset<300;offset+=100)seen.push(...(await charges.listExtraCharges(ops,company,"propuesto",100,offset)).map(x=>x.id));
      assert.equal(seen.length,217);assert.equal(new Set(seen).size,217);assert.deepEqual(full.map(x=>x.id),(await charges.serviceExtraCharges(ops,services[company])).map(x=>x.id));
    }
  });
  await t.test("un reenvío exacto conserva el cargo y el antecedente original del parte",async()=>{
    original=await charges.proposeExtraCharge(ops,services.rerchar,proposal,"rerchar");assert.equal(await charges.proposeExtraCharge(ops,services.rerchar,proposal,"rerchar"),original);
    await db.query("UPDATE service_day_reports SET observation='Parte corregido después del cargo',outcome='suspendido' WHERE service_id=$1 AND day='2020-01-01'",[services.rerchar]);
    assert.equal(await charges.proposeExtraCharge(ops,services.rerchar,proposal,"rerchar"),original);
    const row=await charges.getExtraCharge(admin,"rerchar",original);assert.equal(row?.source_outcome,"incompleto");assert.equal(row?.source_observation,"Antecedente original del parte");
    assert.equal((await db.query<{n:string}>("SELECT count(*)::text n FROM audit_events WHERE entity_id=$1 AND action='propose'",[original]))[0].n,"1");
  });
  await t.test("aprobar otro monto no invalida el reenvío de la propuesta original",async()=>{
    await charges.decideExtraCharge(admin,original,{status:"aprobado",decision_note:"Acordado con el cliente",amount_clp:"12.75"},"rerchar");
    assert.equal(await charges.proposeExtraCharge(ops,services.rerchar,proposal,"rerchar"),original);
    const blank={...proposal,submission_key:randomUUID(),amount_clp:""};withoutAmount=await charges.proposeExtraCharge(ops,services.rerchar,blank,"rerchar");
    await charges.decideExtraCharge(admin,withoutAmount,{status:"aprobado",decision_note:"Monto definido por administración",amount_clp:"8.75"},"rerchar");assert.equal(await charges.proposeExtraCharge(ops,services.rerchar,blank,"rerchar"),withoutAmount);
    assert.equal((await charges.getExtraCharge(admin,"rerchar",withoutAmount))?.source_outcome,"suspendido");
  });
  await t.test("el mismo envío con datos diferentes no se confunde con un reintento",async()=>{
    for(const change of [{service_day:"2020-01-02"},{kind:"otro"},{reason:"Otro antecedente documentado"},{amount_clp:"10.26"},{quote_reference:"COT-DIF"},{client_order_reference:"OC-DIF"}])await assert.rejects(()=>charges.proposeExtraCharge(ops,services.rerchar,{...proposal,...change},"rerchar"),/otros datos/);
    await assert.rejects(()=>charges.proposeExtraCharge(ops,services.e_y_j,proposal,"e_y_j"),/otro servicio/);
    assert.equal((await charges.getExtraCharge(admin,"rerchar",original))?.amount_clp,"12.75");
  });
  await t.test("no cobrar conserva el antecedente económico y no exige aprobar un monto",async()=>{
    await charges.decideExtraCharge(admin,pending.rerchar,{status:"descartado",decision_note:"Cliente no debe asumir este cobro",amount_clp:"no se utiliza"},"rerchar");
    const row=await charges.getExtraCharge(admin,"rerchar",pending.rerchar);assert.equal(row?.status,"descartado");assert.equal(row?.amount_clp,"1.25");
    await assert.rejects(()=>charges.decideExtraCharge(admin,pending.e_y_j,{status:"aprobado",decision_note:"Aprobar sin monto",amount_clp:""},"e_y_j"),/monto/);
  });
  await t.test("empresa, decisión y factura se validan y dos cargos pueden compartir un único saldo",async()=>{
    await assert.rejects(()=>charges.proposeExtraCharge(ops,services.rerchar,{...proposal,submission_key:randomUUID()},"e_y_j"),/empresa del servicio/);
    await assert.rejects(()=>charges.decideExtraCharge(admin,pending.e_y_j,{status:"aprobado",decision_note:"Aprobación desde otra empresa",amount_clp:"1.25"},"rerchar"),/resuelto o no existe/);
    const invoice={invoice_number:"CARGOS-REV-01",invoiced_on:"2020-01-02",due_on:"2020-02-01",total_clp:"25.59"};
    await assert.rejects(()=>charges.invoiceExtraCharge(admin,original,invoice,"e_y_j"),/Apruebe primero/);
    await charges.invoiceExtraCharge(admin,original,invoice,"rerchar");await charges.invoiceExtraCharge(admin,withoutAmount,invoice,"rerchar");
    const balances=await receivables.listReceivables(admin,"rerchar");assert.equal(balances.length,1);assert.equal(balances[0].extra_count,"2");assert.equal(balances[0].total_clp,"25.59");assert.equal((await receivables.listReceivables(admin,"e_y_j")).length,0);
    assert.equal(await charges.getExtraCharge(ops,"e_y_j",original),undefined);
  });
  await t.test("un permiso revocado detiene la propuesta y la decisión administrativa",async()=>{
    await db.query("UPDATE users SET role='conductor' WHERE id=$1",[ops.id]);await assert.rejects(()=>charges.proposeExtraCharge(ops,services.rerchar,{...proposal,submission_key:randomUUID()},"rerchar"),/acceso para proponer/);
    await db.query("UPDATE users SET active=false WHERE id=$1",[admin.id]);await assert.rejects(()=>charges.decideExtraCharge(admin,pending.e_y_j,{status:"descartado",decision_note:"Revisión pendiente",amount_clp:""},"e_y_j"),/acceso de administración/);
  });
});
