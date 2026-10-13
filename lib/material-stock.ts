import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction,type Db} from "./db";

const uuid=z.uuid();
export class MaterialStockError extends Error {}
function reject(message:string):never{throw new MaterialStockError(message);}
function manage(actor:Actor){if(!canManage(actor))reject("Sólo administración y operaciones pueden consultar materiales.");}
export type CatalogMaterial={id:string;name:string;quantity_kg:string;active:boolean};
export type StockMovement={id:string;material_id:string;material_name:string;kind:string;delta_kg:string;
  occurred_on:Date|string;reference:string;reason:string;actor_name:string;created_at:Date|string};

export async function listMaterialCatalog(actor:Actor){
  manage(actor);
  return db.query<CatalogMaterial>(`SELECT c.id,c.name,c.active,COALESCE(b.quantity_kg,0)::text AS quantity_kg
    FROM material_catalog c LEFT JOIN material_stock_balances b ON b.material_id=c.id
    WHERE c.active ORDER BY c.name`);
}
export async function listMaterialStockMovements(actor:Actor,materialId=""){
  manage(actor);
  if(materialId&&!uuid.safeParse(materialId).success)reject("Material inválido.");
  return db.query<StockMovement>(`SELECT m.*,c.name AS material_name,u.name AS actor_name
    FROM material_stock_movements m JOIN material_catalog c ON c.id=m.material_id JOIN users u ON u.id=m.recorded_by
    WHERE ($1::text='' OR m.material_id=NULLIF($1,'')::uuid)
    ORDER BY m.occurred_on DESC,m.created_at DESC LIMIT 200`,[materialId]);
}
export async function catalogName(tx:Db,id:string){
  if(!uuid.safeParse(id).success)reject("Seleccione un material del catálogo.");
  const [row]=await tx.query<{name:string}>("SELECT name FROM material_catalog WHERE id=$1 AND active",[id]);
  if(!row)reject("El material ya no está activo en el catálogo.");
  return row.name;
}

async function lockBalance(tx:Db,materialId:string){
  await tx.query("INSERT INTO material_stock_balances(material_id) VALUES($1) ON CONFLICT DO NOTHING",[materialId]);
  const [row]=await tx.query<{quantity_kg:string}>("SELECT quantity_kg FROM material_stock_balances WHERE material_id=$1 FOR UPDATE",[materialId]);
  return Number(row.quantity_kg);
}
async function move(tx:Db,actor:Actor,input:{materialId:string;kind:string;delta:number;date:string;
  reference:string;reason:string;receiptId?:string;guideItemId?:string}){
  const current=await lockBalance(tx,input.materialId);
  const next=Math.round((current+input.delta)*100)/100;
  if(next<0)reject(`Stock insuficiente: hay ${current.toLocaleString("es-CL")} kg y la salida requiere ${(-input.delta).toLocaleString("es-CL")} kg adicionales.`);
  await tx.query("UPDATE material_stock_balances SET quantity_kg=$2,updated_at=now() WHERE material_id=$1",[input.materialId,next]);
  const [row]=await tx.query<{id:string}>(`INSERT INTO material_stock_movements
    (material_id,kind,delta_kg,occurred_on,receipt_id,guide_item_id,reference,reason,recorded_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[input.materialId,input.kind,input.delta,input.date,
      input.receiptId??null,input.guideItemId??null,input.reference,input.reason,actor.id]);
  await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'stock','material_stock_movement',$2,$3)",
    [actor.id,row.id,JSON.stringify(input)]);
  return row.id;
}

export async function recordMaterialStockAdjustment(actor:Actor,input:unknown){
  if(actor.role!=="admin")reject("Sólo administración puede conciliar o ajustar saldos de materiales.");
  const data=z.object({material_id:uuid,kind:z.enum(["saldo_inicial","ajuste_entrada","ajuste_salida"]),
    quantity_kg:z.coerce.number().positive().max(100_000_000).refine(v=>Math.abs(v*100-Math.round(v*100))<0.000001,"Use hasta dos decimales."),occurred_on:z.iso.date(),
    reference:z.string().trim().min(3).max(80),reason:z.string().trim().min(10).max(500)}).parse(input);
  return transaction(async tx=>{
    await catalogName(tx,data.material_id);
    await lockBalance(tx,data.material_id);
    if(data.kind==="saldo_inicial"){
      const [existing]=await tx.query("SELECT id FROM material_stock_movements WHERE material_id=$1 LIMIT 1",[data.material_id]);
      if(existing)reject("Este material ya tiene movimientos. Registre una corrección documentada en lugar de otro saldo inicial.");
    }
    const delta=data.kind==="ajuste_salida"?-data.quantity_kg:data.quantity_kg;
    return move(tx,actor,{materialId:data.material_id,kind:data.kind,delta,date:data.occurred_on,
      reference:data.reference,reason:data.reason});
  });
}

export async function linkReceiptMaterial(actor:Actor,receiptId:string,materialId:string){
  manage(actor);
  if(!uuid.safeParse(receiptId).success)reject("Ingreso inválido.");
  await transaction(async tx=>{
    const [receipt]=await tx.query<{material_id:string|null;material_name:string}>(
      "SELECT material_id,material_name FROM material_receipts WHERE id=$1 FOR UPDATE",[receiptId]);
    if(!receipt)reject("Ingreso no encontrado.");
    const [posted]=await tx.query("SELECT id FROM material_stock_movements WHERE receipt_id=$1",[receiptId]);
    if(posted)reject("El ingreso ya fue incorporado al stock; no se puede cambiar su material.");
    const name=await catalogName(tx,materialId);
    await tx.query("UPDATE material_receipts SET material_id=$2,material_name=$3,updated_at=now() WHERE id=$1",[receiptId,materialId,name]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES($1,'catalogar','material_receipt',$2,$3,$4)",
      [actor.id,receiptId,JSON.stringify(receipt),JSON.stringify({material_id:materialId,material_name:name})]);
  });
}

export async function postReceiptToMaterialStock(actor:Actor,receiptId:string){
  manage(actor);
  if(!uuid.safeParse(receiptId).success)reject("Ingreso inválido.");
  return transaction(async tx=>{
    const [r]=await tx.query<{material_id:string|null;rerchar_kg:string|null;impurity_kg:string;material_name:string;
      movement_on:Date|string;weighing_ticket:string|null;origin_guide:string|null;transfer_guide:string|null;entry_sheet:string|null}>(
      "SELECT material_id,rerchar_kg,impurity_kg,material_name,movement_on,weighing_ticket,origin_guide,transfer_guide,entry_sheet FROM material_receipts WHERE id=$1 FOR UPDATE",[receiptId]);
    if(!r)reject("Ingreso no encontrado.");
    if(!r.material_id)reject("Seleccione primero el material del catálogo.");
    const [posted]=await tx.query<{id:string}>("SELECT id FROM material_stock_movements WHERE receipt_id=$1",[receiptId]);
    if(posted)return posted.id;
    if(r.rerchar_kg==null)reject("Para ingresar al stock debe registrar el peso físico medido por RERCHAR.");
    const net=Math.round((Number(r.rerchar_kg)-Number(r.impurity_kg))*100)/100;
    if(net<=0)reject("El peso RERCHAR menos impurezas debe ser mayor que cero.");
    const date=r.movement_on instanceof Date?r.movement_on.toISOString().slice(0,10):String(r.movement_on).slice(0,10);
    return move(tx,actor,{materialId:r.material_id,kind:"ingreso",delta:net,date,
      reference:r.weighing_ticket||r.transfer_guide||r.origin_guide||r.entry_sheet||`Ingreso ${receiptId.slice(0,8)}`,
      reason:"Recepción física confirmada como existencia de RERCHAR",receiptId});
  });
}

// La planilla suma I (faena) + J (stock). Sólo J consume existencias en una venta.
// Los movimientos de corrección son nuevos asientos: el historial nunca se borra.
export async function syncGuideStock(tx:Db,actor:Actor,itemId:string,materialId:string|null,stockKg:number,
  guideNumber:string,movementOn:string,type:string){
  if(type!=="venta")return;
  if(stockKg>0&&!materialId)reject("Para descontar stock, seleccione el material del catálogo.");
  const posted=await tx.query<{material_id:string;delta_kg:string}>(`SELECT material_id,sum(delta_kg)::text AS delta_kg
    FROM material_stock_movements WHERE guide_item_id=$1 GROUP BY material_id`,[itemId]);
  const current=new Map(posted.map(row=>[row.material_id,Number(row.delta_kg)]));
  const ids=[...new Set([...current.keys(),...(materialId&&stockKg>0?[materialId]:[])])].sort();
  for(const id of ids){
    const target=id===materialId?-stockKg:0;
    const delta=Math.round((target-(current.get(id)??0))*100)/100;
    if(!delta)continue;
    await move(tx,actor,{materialId:id,kind:delta<0?"salida_guia":"reversa_guia",delta,date:movementOn,
      reference:`Guía ${guideNumber}`,reason:`Ítem de guía ${itemId}; ${delta<0?"consumo desde stock":"corrección de salida"}`,guideItemId:itemId});
  }
}

export async function guideStockPostings(actor:Actor,guideId:string){
  manage(actor);
  return db.query<{guide_item_id:string;material_id:string;posted_kg:string}>(`SELECT m.guide_item_id,m.material_id,(-sum(m.delta_kg))::text AS posted_kg
    FROM material_stock_movements m JOIN material_guide_items i ON i.id=m.guide_item_id
    WHERE i.guide_id=$1 GROUP BY m.guide_item_id,m.material_id`,[guideId]);
}

export async function receiptStockPosting(actor:Actor,receiptId:string){
  manage(actor);
  if(!uuid.safeParse(receiptId).success)reject("Ingreso inválido.");
  const [row]=await db.query<{id:string;material_name:string;delta_kg:string;occurred_on:Date|string}>(`SELECT m.id,c.name AS material_name,m.delta_kg::text,m.occurred_on
    FROM material_stock_movements m JOIN material_catalog c ON c.id=m.material_id WHERE m.receipt_id=$1`,[receiptId]);
  return row??null;
}
