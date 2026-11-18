import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";
import type {Actor} from "../lib/auth";

test("Control de Guía registra una venta real con varios materiales y conserva las diferencias de la planilla",async()=>{
  process.env.PGLITE_DATA_DIR="memory://";
  const {db,transaction}=await import("../lib/db");
  const guides=await import("../lib/material-guides");
  const materials=await import("../lib/materials");
  const {entryHeaders,entryRow,buildEntryWorkbook}=await import("../lib/material-export");
  const {addOperationFile}=await import("../lib/operation-files");
  const {rercharReceiptGuideDashboard,rercharReceiptClosureDashboard,rercharMaterialDashboard}=await import("../lib/company-dashboard");
  const stock=await import("../lib/material-stock");
  for(const name of (await readdir(resolve(process.cwd(),"db"))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(resolve(process.cwd(),`db/${name}`),"utf8");
    await transaction(async tx=>{for(const part of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean))await tx.query(part);});
  }
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Comprador de material') RETURNING id");
  const [admin,viewer]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role,client_id)
    VALUES('guias@demo.cl','Operaciones','h','admin',null),('cliente@demo.cl','Cliente','h','cliente',$1) RETURNING id`,[client.id]);
  const actor:Actor={id:admin.id,name:"Operaciones",email:"guias@demo.cl",role:"admin",client_id:null};
  const customer:Actor={id:viewer.id,name:"Cliente",email:"cliente@demo.cl",role:"cliente",client_id:client.id};
  const catalog=await stock.listMaterialCatalog(actor);
  assert.equal(catalog.length,83,"catálogo unido con el material faltante de Entrada de material 2026");
  assert.ok(catalog.some(m=>m.name==="CABLE DE COBRE CON GOMA EN DESUSO"));
  const iron=catalog.find(m=>m.name==="CHATARRA DE FIERRO MIXTO")!;
  const aluminum=catalog.find(m=>m.name==="CHATARRA DE ALUMINIO")!;
  assert.ok(iron&&aluminum);
  await assert.rejects(()=>materials.createMaterialReceipt(actor,{client_id:client.id,kind:"ingreso",receipt_mode:"directa",
    movement_on:"2026-09-01",site_name:"Patio RERCHAR",driver_name:"Transportista externo",driver_tax_id:"12.345.678-9",
    truck_plate:"ABCD-12",weighing_ticket:"SOLO-TICKET",material_id:iron.id,rerchar_kg:"850",net_basis:"rerchar"}),
    materials.MaterialError,"la entrega directa exige guía u hoja además del ticket");
  const receipt=await materials.createMaterialReceipt(actor,{client_id:client.id,kind:"ingreso",receipt_mode:"directa",
    movement_on:"2026-09-01",site_name:"Patio RERCHAR",driver_name:"Transportista externo",driver_tax_id:"12.345.678-9",
    truck_plate:"ABCD-12",origin_guide:"EXT-12",material_id:iron.id,supplier_kg:"900",rerchar_kg:"850",
    impurity_kg:"30",net_basis:"rerchar"});
  assert.equal((await materials.getMaterialReceipt(actor,receipt)).weighing_ticket,null,"recepción directa acepta guía sin ticket");
  const monthly=await materials.exportMaterialReceipts(actor,"2026-09");
  assert.equal(monthly.length,1);
  assert.equal((await materials.exportMaterialReceipts(actor,"2026-10")).length,0);
  assert.equal(entryHeaders.length,22,"columnas B:W del formato que distingue ambos pesajes");
  assert.deepEqual(entryRow(monthly[0]).slice(8,12),[900,850,30,820],"conserva los dos pesos, impurezas y neto sin reemplazar uno por otro");
  assert.equal(entryRow({...monthly[0],net_basis:"proveedor",net_reported_kg:null})[11],870,"respeta la base de pesaje elegida para el neto");
  assert.equal(entryRow({...monthly[0],supplier_kg:null})[8],null,"no inventa un peso proveedor cuando falta");
  assert.equal(entryRow(monthly[0])[14],"EXT-12","guía de origen en la columna de la planilla");
  assert.equal(buildEntryWorkbook(monthly,"2026-09").subarray(0,2).toString(),"PK","archivo Excel real");
  await assert.rejects(()=>materials.exportMaterialReceipts(customer,"2026-09"),materials.MaterialError);
  await materials.updateMaterialGuideFollowup(actor,receipt,{requested_on:"2026-09-02",received_on:"",valued_guide:""});
  assert.equal((await materials.getMaterialReceipt(actor,receipt)).valued_guide,null,"ingreso pendiente sin bloqueo");
  assert.equal((await rercharReceiptGuideDashboard()).pending,"1","la alerta muestra la guía pendiente");
  assert.deepEqual((await materials.listMaterialReceipts(actor,"guia")).map(r=>r.id),[receipt]);
  assert.equal((await materials.listMaterialReceipts(actor,"guia",1,1)).length,0,"la cola permite avanzar página sin truncar la alerta");
  await assert.rejects(()=>materials.updateMaterialGuideFollowup(actor,receipt,{requested_on:"2026-09-02",received_on:"2026-09-03",valued_guide:"GV-125"}),
    /Adjunte la guía valorizada/);
  const jpg=()=>new File([new Uint8Array([0xff,0xd8,0xff,0xd9])],"documento.jpg",{type:"image/jpeg"});
  await addOperationFile(actor,"receipt",receipt,"foto_diferencia",jpg());
  await addOperationFile(actor,"receipt",receipt,"guia_valorizada",jpg());
  await assert.rejects(()=>materials.updateMaterialGuideFollowup(actor,receipt,{requested_on:"2026-09-04",received_on:"2026-09-03",valued_guide:"GV-125"}),
    /no puede preceder/);
  await materials.updateMaterialGuideFollowup(actor,receipt,{requested_on:"2026-09-02",received_on:"2026-09-03",valued_guide:"GV-125"});
  assert.equal((await materials.getMaterialReceipt(actor,receipt)).valued_guide,"GV-125");
  assert.equal((await rercharReceiptGuideDashboard()).pending,"0","al recibirla desaparece la alerta");
  assert.equal((await rercharReceiptClosureDashboard()).invoice_pending,"1","falta confirmar la factura después de la guía");
  assert.deepEqual((await materials.listMaterialReceipts(actor,"factura")).map(r=>r.id),[receipt]);
  await assert.rejects(()=>materials.updateMaterialReferences(actor,receipt,{entry_sheet:"H-13",invoice_number:"F-125",
    invoice_direction:"emitida",invoice_issued_on:"2026-09-04"}),/Adjunte la factura/);
  await addOperationFile(actor,"receipt",receipt,"factura",jpg());
  await materials.updateMaterialReferences(actor,receipt,{entry_sheet:"H-13",invoice_number:"F-125",
    invoice_direction:"emitida",invoice_issued_on:"2026-09-04",certificate_number:"C-13"});
  assert.equal((await rercharReceiptClosureDashboard()).invoice_pending,"0");
  assert.equal((await rercharReceiptClosureDashboard()).notice_pending,"1");
  assert.deepEqual((await materials.listMaterialReceipts(actor,"aviso")).map(r=>r.id),[receipt]);
  await assert.rejects(()=>materials.updateMaterialPayment(actor,receipt,{payment_status:"pagado",paid_on:"2026-09-05",
    payment_reference:"TR-9"}),/Adjunte primero el comprobante/);
  await addOperationFile(actor,"receipt",receipt,"comprobante",jpg());
  await materials.updateMaterialPayment(actor,receipt,{payment_status:"parcial",paid_on:"2026-09-05",payment_reference:"TR-9"});
  assert.equal((await rercharReceiptClosureDashboard()).payment_pending,"1");
  assert.deepEqual((await materials.listMaterialReceipts(actor,"pago")).map(r=>r.id),[receipt]);
  await materials.updateMaterialPayment(actor,receipt,{payment_status:"pagado",paid_on:"2026-09-06",payment_reference:"TR-10"});
  assert.equal((await rercharReceiptClosureDashboard()).payment_pending,"0");
  await assert.rejects(()=>materials.recordMaterialClosureNotification(actor,receipt,{notified_on:"2026-09-05",
    recipient:"cliente@demo.cl",note:"correo"}),/certificado/);
  await addOperationFile(actor,"receipt",receipt,"certificado",jpg());
  await assert.rejects(()=>materials.recordMaterialClosureNotification(actor,receipt,{notified_on:"2026-09-02",
    recipient:"cliente@demo.cl",note:"correo"}),/no puede preceder/);
  await materials.recordMaterialClosureNotification(actor,receipt,{notified_on:"2026-09-07",recipient:"cliente@demo.cl",note:"Correo confirmado"});
  assert.equal((await rercharReceiptClosureDashboard()).notice_pending,"0");
  await assert.rejects(()=>addOperationFile(actor,"receipt",receipt,"factura",new File(["archivo inválido"],"factura.txt")),/Sólo PDF/);
  assert.ok((await materials.getMaterialReceipt(actor,receipt)).closure_notified_on,"una carga fallida conserva el aviso anterior");
  await addOperationFile(actor,"receipt",receipt,"foto_material",jpg());
  assert.ok((await materials.getMaterialReceipt(actor,receipt)).closure_notified_on,"una foto operativa no reabre el aviso documental");
  for(const kind of ["guia_valorizada","factura","certificado"]){
    await addOperationFile(actor,"receipt",receipt,kind,jpg());
    const reopened=await materials.getMaterialReceipt(actor,receipt);
    assert.equal(reopened.closure_notified_on,null,`adjuntar ${kind} corregido reabre el aviso aunque conserve el número`);
    assert.equal(reopened.closure_recipient,null);
    assert.equal(reopened.closure_note,null);
    assert.equal((await rercharReceiptClosureDashboard()).notice_pending,"1");
    await materials.recordMaterialClosureNotification(actor,receipt,{notified_on:"2026-09-08",recipient:"cliente@demo.cl",note:"Documentos corregidos entregados"});
  }
  const reopenedEvents=await db.query<{previous_value:{notified_on:string;recipient:string};next_value:{document_kind:string;operation_file_id:string}}>(
    "SELECT previous_value,next_value FROM audit_events WHERE entity_type='material_receipt' AND entity_id=$1 AND action='reopen_notice' ORDER BY created_at,id",[receipt]);
  assert.equal(reopenedEvents.length,3,"cada reemplazo documental deja rastro del aviso anterior y el archivo nuevo");
  assert.deepEqual(new Set(reopenedEvents.map(e=>e.next_value.document_kind)),new Set(["guia_valorizada","factura","certificado"]));
  assert.ok(reopenedEvents.every(e=>e.previous_value.recipient==="cliente@demo.cl"&&e.previous_value.notified_on&&e.next_value.operation_file_id));
  await materials.updateMaterialReferences(actor,receipt,{entry_sheet:"H-13",invoice_number:"F-126",
    invoice_direction:"emitida",invoice_issued_on:"2026-09-04",certificate_number:"C-13"});
  assert.equal((await materials.getMaterialReceipt(actor,receipt)).closure_notified_on,null,"cambiar factura reabre el aviso");
  assert.equal((await rercharReceiptClosureDashboard()).notice_pending,"1");
  await assert.rejects(()=>materials.recordMaterialClosureNotification(customer,receipt,{notified_on:"2026-09-07",
    recipient:"cliente@demo.cl"}),materials.MaterialError);
  await assert.rejects(()=>materials.updateMaterialGuideFollowup(customer,receipt,{requested_on:"",received_on:"",valued_guide:""}),materials.MaterialError);
  assert.equal((await stock.listMaterialCatalog(actor)).find(m=>m.id===iron.id)?.quantity_kg,"0","registrar no suma stock sin confirmación");
  const receiptPosting=await stock.postReceiptToMaterialStock(actor,receipt);
  assert.equal(await stock.postReceiptToMaterialStock(actor,receipt),receiptPosting,"confirmación idempotente");
  assert.equal((await stock.listMaterialCatalog(actor)).find(m=>m.id===iron.id)?.quantity_kg,"820.00","stock físico RERCHAR menos impurezas");
  await assert.rejects(()=>stock.linkReceiptMaterial(actor,receipt,aluminum.id),stock.MaterialStockError);
  await stock.recordMaterialStockAdjustment(actor,{material_id:aluminum.id,kind:"saldo_inicial",quantity_kg:"500",
    occurred_on:"2026-09-01",reference:"ACTA-9",reason:"Conteo físico inicial verificado"});
  await assert.rejects(()=>stock.recordMaterialStockAdjustment(actor,{material_id:aluminum.id,kind:"saldo_inicial",quantity_kg:"100",
    occurred_on:"2026-09-02",reference:"ACTA-10",reason:"Segundo saldo inicial improcedente"}),stock.MaterialStockError);
  const key=randomUUID();
  const base={submission_key:key,guide_number:"2219",movement_on:"2026-09-02",movement_type:"venta",counterparty_id:client.id,
    origin:"Faena",destination:"Comprador",driver_name:"Chofer",truck_plate:"ABCD-12",line_number:"1",
    material_id:iron.id,origin_ticket:"617014",origin_kg:"25990",stock_kg:"720",
    departure_ticket:"3046",destination_ticket:"482518",arrival_kg:"25610",returned_kg:"620",
    destination_impurity_kg:"0",invoice_kg:"25610",agreed_price_clp:"250",invoice_price_clp:"250"};
  const id=await guides.createMaterialGuide(actor,base);
  assert.equal(await guides.createMaterialGuide(actor,base),id,"reintento no duplica guía ni material");
  const {guide,items}=await guides.getMaterialGuide(actor,id);
  assert.equal(guide.movement_type,"venta");
  assert.equal(guide.line_count,"1");
  assert.equal(guide.departure_kg,"26710.00");
  assert.deepEqual(guides.materialGuideTotals(items[0]),{departure_kg:26710,destination_difference_kg:-480,
    invoice_difference_kg:0,estimated_clp:6402500,billed_clp:6402500,value_difference_clp:0});
  assert.equal(guide.missing_invoice,"1");
  assert.equal(guide.unposted_stock,"0");
  assert.equal((await rercharMaterialDashboard()).guides.pending,"1");
  assert.deepEqual((await guides.listMaterialGuides(actor,"","","venta_pendiente")).map(g=>g.id),[id]);
  assert.equal((await guides.listMaterialGuides(actor,"","","stock_pendiente")).length,0);
  assert.equal((await guides.listMaterialGuides(actor,"","","venta_pendiente",1,1)).length,0);
  assert.equal((await stock.listMaterialCatalog(actor)).find(m=>m.id===iron.id)?.quantity_kg,"100.00");
  await assert.rejects(()=>guides.createMaterialGuide(customer,{...base,submission_key:randomUUID()}),guides.MaterialGuideError);
  await assert.rejects(()=>guides.getMaterialGuide(customer,id),guides.MaterialGuideError);
  await assert.rejects(()=>guides.createMaterialGuide(actor,{...base,submission_key:randomUUID()}),guides.MaterialGuideError);
  await guides.saveMaterialGuideItem(actor,id,{line_number:"2",material_id:aluminum.id,stock_kg:"500",
    arrival_kg:"495",invoice_kg:"490"});
  const {buildGuideWorkbook,guideExportRow}=await import("../lib/material-guide-export");
  const exported=await db.query<{guide:import("../lib/material-guides").MaterialGuide;item:import("../lib/material-guides").MaterialGuideItem;counterparty_name:string}>(
    `SELECT row_to_json(g) AS guide,row_to_json(i) AS item,c.name AS counterparty_name
     FROM material_guides g JOIN material_guide_items i ON i.guide_id=g.id JOIN clients c ON c.id=g.counterparty_id
     WHERE g.movement_on >= $1::date AND g.movement_on < $1::date + interval '1 month'
     ORDER BY g.movement_on,g.guide_number,i.line_number`,["2026-09-01"]);
  assert.equal(exported.length,2,"la planilla mensual contiene una fila por material");
  assert.equal(guideExportRow(exported[0])[5],"Comprador de material");
  assert.equal(buildGuideWorkbook(exported,"2026-09").subarray(0,2).toString(),"PK");
  const second=(await guides.getMaterialGuide(actor,id)).items[1];
  assert.equal(guides.materialGuideTotals(second).departure_kg,500,"una venta puede salir sólo desde stock");
  await assert.rejects(()=>guides.saveMaterialGuideItem(actor,id,{line_number:"3",material_id:aluminum.id,stock_kg:"800"}),stock.MaterialStockError);
  await assert.rejects(()=>guides.saveMaterialGuideItem(actor,id,{item_id:second.id,line_number:"2",material_id:iron.id,stock_kg:"150"}),
    stock.MaterialStockError,"cambiar el material no debe perder el saldo previo si falta stock en el nuevo");
  assert.equal((await stock.listMaterialCatalog(actor)).find(m=>m.id===aluminum.id)?.quantity_kg,"0.00");
  await guides.saveMaterialGuideItem(actor,id,{item_id:second.id,line_number:"2",material_id:aluminum.id,stock_kg:"400",
    arrival_kg:"495",returned_kg:"",invoice_number:"F-2",invoice_issued_on:"2026-09-03",invoice_status:"pagada",payment_on:"2026-09-04"});
  const updated=(await guides.getMaterialGuide(actor,id)).items[1];
  assert.equal(updated.invoice_status,"pagada");
  assert.equal(updated.returned_kg,null);
  assert.equal((await stock.listMaterialCatalog(actor)).find(m=>m.id===aluminum.id)?.quantity_kg,"100.00","corrección restituye 100 kg sin borrar asientos");
  assert.equal((await stock.guideStockPostings(actor,id)).find(p=>p.guide_item_id===second.id)?.posted_kg,"400.00");
  await assert.rejects(()=>stock.recordMaterialStockAdjustment(customer,{material_id:aluminum.id,kind:"ajuste_salida",quantity_kg:"10",
    occurred_on:"2026-09-05",reference:"ACTA-12",reason:"Cliente sin permiso de ajuste"}),stock.MaterialStockError);
  assert.equal((await guides.listMaterialGuides(actor,"aluminio","venta")).length,1);
  assert.equal((await db.query<{n:string}>("SELECT count(*)::text AS n FROM audit_events WHERE entity_type='material_guide_item'"))[0].n,"3");
});
