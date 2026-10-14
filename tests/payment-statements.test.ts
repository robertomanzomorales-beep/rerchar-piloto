import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("panel RERCHAR no cae entre migraciones y E y J calcula los dos formatos EDP",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const {rercharMaterialDashboard,rercharReceiptGuideDashboard,eyjPaymentDashboard}=await import("../lib/company-dashboard");
  const {moduleReady}=await import("../lib/schema-readiness");
  const edp=await import("../lib/payment-statements");
  const calendar=await import("../lib/payment-calendar");
  const migrations=(await readdir(resolve(process.cwd(),"db"))).filter(n=>/^\d+.*\.sql$/.test(n)).sort();
  async function apply(name:string){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  for(const name of migrations.filter(n=>n<"019"))await apply(name);
  assert.equal(await moduleReady("guias"),false);
  assert.equal(await moduleReady("ingresos"),false);
  assert.equal(await moduleReady("stock"),false);
  assert.equal(await moduleReady("edp"),false);
  assert.equal(await moduleReady("edp_calendar"),false);
  await apply("019_control_guias_material.sql");
  assert.equal(await moduleReady("guias"),false,"el módulo espera también la salida de stock 020");
  assert.equal((await rercharMaterialDashboard()).stock_ready,false,"la ausencia de tabla 020 no deja pantalla negra");
  assert.equal((await eyjPaymentDashboard()).ready,false,"el panel E y J admite código anterior a la tabla EDP");
  await apply("020_stock_materiales_y_recepcion_directa.sql");
  assert.equal((await rercharReceiptGuideDashboard()).ready,false,"la alerta nueva no derriba el panel antes de migrar 024");
  assert.equal(await moduleReady("guias"),true);
  assert.equal(await moduleReady("ingresos"),true);
  assert.equal(await moduleReady("stock"),true);
  assert.equal(await moduleReady("edp"),false);
  await apply("021_estados_pago_eyj.sql");
  assert.equal(await moduleReady("edp"),true);
  assert.equal((await rercharMaterialDashboard()).stock_ready,true);
  assert.equal((await eyjPaymentDashboard()).ready,true);
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name,tax_id,address,email) VALUES('Cliente Industrial A','99.999.999-9','Dirección de prueba 123','contacto@ejemplo.cl') RETURNING id");
  const [admin,ops]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role)
    VALUES('edp@demo.cl','Administración','h','admin'),('opsedp@demo.cl','Operaciones','h','operaciones') RETURNING id`);
  const owner:Actor={id:admin.id,name:"Administración",email:"edp@demo.cl",role:"admin",client_id:null};
  const viewer:Actor={id:ops.id,name:"Operaciones",email:"opsedp@demo.cl",role:"operaciones",client_id:null};
  const base={submission_key:randomUUID(),client_id:client.id,number:"01",period_on:"2026-01-01",statement_type:"residuos",
    client_name:"Cliente Industrial A",client_tax_id:"99.999.999-9",client_address:"Dirección de prueba 123",
    client_contact:"contacto@ejemplo.cl"};
  await assert.rejects(()=>edp.createPaymentStatement(viewer,base),edp.PaymentStatementError);
  const id=await edp.createPaymentStatement(owner,base);
  assert.equal(await edp.createPaymentStatement(owner,base),id,"reenvío conserva el mismo borrador");
  await edp.saveStatementCharge(owner,id,{line_number:"1",description:"Disposición final por tonelada",pricing:"uf_ton",
    unit_value:"1.7",uf_value_clp:"40000",uf_on:"2026-01-30"});
  assert.equal((await edp.getPaymentStatement(owner,id)).totals.total_clp,null,"sin peso de disposición no inventa importe cero");
  await assert.rejects(()=>edp.setPaymentStatementStatus(owner,id,"enviado"),edp.PaymentStatementError);
  for(const [line,weight,disposal] of [[1,12000,false],[2,12000,true],[3,9000,false],[4,9000,true]] as const){
    await edp.saveStatementOperation(owner,id,{line_number:String(line),description:disposal?"Disposición final":"Servicio de transporte Residuo Industrial",
      operation_on:"2026-01-15",weight_kg:String(weight),weighing_ticket:"17819",service_sheet:"2949",guide_number:"3669",
      sidrep:"-",is_disposal:disposal?"1":"0"});
  }
  await edp.saveStatementCharge(owner,id,{line_number:"2",description:"Servicio industrial",pricing:"clp_servicio",
    unit_value:"900000",quantity:"2"});
  const first=await edp.getPaymentStatement(owner,id);
  assert.equal(first.totals.disposal_tons,21,"no cuenta dos veces transporte y disposición del mismo ticket");
  const net=Math.round(1.7*40000*21)+1800000;
  assert.equal(first.totals.net_clp,net);
  assert.equal(first.totals.vat_clp,Math.round(net*.19));
  assert.equal(first.totals.total_clp,net+Math.round(net*.19));
  await assert.rejects(()=>edp.saveStatementCharge(viewer,id,{line_number:"3",description:"Sin permiso",pricing:"clp_servicio",unit_value:"100",quantity:"1"}),edp.PaymentStatementError);
  await edp.setPaymentStatementStatus(owner,id,"enviado");
  await assert.rejects(()=>edp.saveStatementOperation(owner,id,{line_number:"5",description:"Nuevo peso",operation_on:"2026-01-20",weight_kg:"20"}),edp.PaymentStatementError);
  await edp.setPaymentStatementStatus(owner,id,"observado");
  await edp.saveStatementOperation(owner,id,{line_id:first.operations[1].id,line_number:"2",description:"Disposición final corregida",
    operation_on:"2026-01-15",weight_kg:"12010",weighing_ticket:"17819",is_disposal:"1"});
  assert.equal((await edp.getPaymentStatement(owner,id)).totals.disposal_tons,21.01);
  await assert.rejects(()=>edp.deletePaymentStatementLine(viewer,id,"operation",first.operations[0].id),edp.PaymentStatementError);
  await edp.deletePaymentStatementLine(owner,id,"operation",first.operations[0].id);
  assert.equal((await edp.getPaymentStatement(owner,id)).totals.disposal_tons,21.01,"eliminar transporte no altera toneladas de disposición");

  const rental=await edp.createPaymentStatement(owner,{...base,submission_key:randomUUID(),statement_type:"arriendo",
    period_on:"2026-08-01",client_name:"Cliente Industrial A",number:"01"});
  await edp.saveStatementOperation(owner,rental,{line_number:"1",description:"Arriendo excavadora de prueba",
    rental_from:"2026-07-24",rental_to:"2026-08-23"});
  await edp.saveStatementCharge(owner,rental,{line_number:"1",description:"Arriendo mensual",pricing:"uf_unidad",
    unit_value:"150",quantity:"1",uf_value_clp:"40000",uf_on:"2026-07-15"});
  const second=await edp.getPaymentStatement(viewer,rental);
  assert.equal(second.totals.net_clp,6000000);
  assert.equal(second.totals.total_clp,6000000+Math.round(6000000*.19));
  await edp.setPaymentStatementStatus(owner,rental,"enviado");
  await edp.setPaymentStatementStatus(owner,rental,"aprobado");
  await assert.rejects(()=>edp.setPaymentStatementStatus(owner,rental,"borrador"),edp.PaymentStatementError);
  await assert.rejects(()=>edp.deletePaymentStatementLine(owner,rental,"charge",second.charges[0].id),edp.PaymentStatementError);
  assert.equal((await edp.listPaymentStatements(viewer)).length,2);

  assert.equal((await calendar.eyjBillingCalendarDashboard("2026-01-29")).ready,false,
    "el panel no cae si el código se despliega antes de la agenda");
  await apply("026_agenda_estados_pago.sql");
  assert.equal(await moduleReady("edp_calendar"),true);
  const input={client_id:client.id,statement_type:"residuos",period_from:"2026-01-01",period_to:"2026-01-31",
    cutoff_on:"2026-02-01",send_on:"2026-02-03",contact_email:"cliente@empresa.cl",notes:"Corte acordado"};
  await assert.rejects(()=>calendar.createBillingCycle(viewer,input),calendar.PaymentCalendarError);
  await assert.rejects(()=>calendar.createBillingCycle(owner,{...input,send_on:"2026-01-30"}),/envío no puede preceder/);
  const cycleId=await calendar.createBillingCycle(owner,input);
  await assert.rejects(()=>calendar.createBillingCycle(owner,{...input,period_from:"2026-01-15"}),/período que se cruza/);
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena de prueba') RETURNING id",[client.id]);
  for(const [company,close] of [["e_y_j","2026-02-01T02:30:00Z"],["rerchar","2026-01-20T15:00:00Z"]]){
    await db.query(`INSERT INTO service_requests(submission_key,client_id,site_id,service_type,waste_type,
      origin,destination,status,closed_at,created_by,operating_company)
      VALUES($1,$2,$3,'traslado','industrial','Faena','Planta','completada',$4,$5,$6)`,
      [randomUUID(),client.id,site.id,close,owner.id,company]);
  }
  const [eyjService]=await db.query<{id:string}>("SELECT id FROM service_requests WHERE operating_company='e_y_j' AND client_id=$1",[client.id]);
  const [contract]=await db.query<{id:string}>(`INSERT INTO client_contracts(client_id,code,starts_on,created_by,operating_company)
    VALUES($1,'EDP-TEST','2026-01-01',$2,'e_y_j') RETURNING id`,[client.id,owner.id]);
  const [tariff]=await db.query<{id:string}>(`INSERT INTO service_tariffs(contract_id,service_type,unit,unit_price_clp,valid_from,created_by)
    VALUES($1,'traslado','servicio',900000,'2026-01-01',$2) RETURNING id`,[contract.id,owner.id]);
  await db.query(`INSERT INTO service_valuations(service_id,tariff_id,quantity,unit_price_clp,total_clp,created_by)
    VALUES($1,$2,2,900000,1800000,$3)`,[eyjService.id,tariff.id,owner.id]);
  const cycle=await calendar.getBillingCycle(viewer,cycleId);
  assert.equal(cycle.services.length,1,"sólo agrupa servicios E y J del cliente en el período");
  assert.equal(cycle.services[0].closed_on,"2026-01-31","el día de cierre es la fecha local de Chile");
  assert.equal(cycle.services[0].quantity,"2.00");
  assert.equal(cycle.services[0].total_clp,"1800000.00","muestra el valor registrado sin convertirlo en EDP");
  assert.equal((await calendar.eyjBillingCalendarDashboard("2026-01-26")).cutoffs,"1");
  assert.equal((await calendar.eyjBillingCalendarDashboard("2026-01-26")).sends,"0");
  await assert.rejects(()=>calendar.linkBillingStatement(owner,cycleId,rental),/mismo cliente, formato y período/);
  await calendar.linkBillingStatement(owner,cycleId,id);
  assert.equal((await calendar.eyjBillingCalendarDashboard("2026-02-04")).overdue,"1",
    "vincular un EDP observado no resuelve la alerta");
  await assert.rejects(()=>calendar.updateBillingCycle(owner,cycleId,{...input,period_from:"2026-01-02"}),
    /debe quedar dentro del período/);
  await edp.setPaymentStatementStatus(owner,id,"enviado");
  assert.equal((await calendar.eyjBillingCalendarDashboard("2026-02-04")).overdue,"0");
  assert.equal((await calendar.listBillingCycles(viewer))[0].statement_status,"enviado");
});
