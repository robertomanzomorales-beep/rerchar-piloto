import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction,type Db} from "./db";
import {catalogName,syncGuideStock} from "./material-stock";

const uuid=z.uuid();
const optional=(max:number)=>z.string().trim().max(max).default("");
const amount=z.union([z.literal(""),z.coerce.number().finite().min(0).max(100_000_000)]).default("");
const date=z.union([z.literal(""),z.iso.date()]).default("");
const nullIfEmpty=(value:string|number)=>value===""?null:value;
export class MaterialGuideError extends Error {}
function reject(message:string):never{throw new MaterialGuideError(message);}
function manage(actor:Actor){if(!canManage(actor))reject("Sólo administración y operaciones pueden registrar guías de material.");}

const headerSchema=z.object({
  submission_key:uuid,guide_number:z.string().trim().min(1).max(50),movement_on:z.iso.date(),
  movement_type:z.enum(["venta","compra","traslado"]),counterparty_id:uuid,
  movement_detail:optional(100),
  origin:z.string().trim().min(2).max(250),destination:z.string().trim().min(2).max(250),
  driver_name:optional(120),truck_plate:optional(30),trailer_plate:optional(30),
  freight_company:optional(160),freight_cost_clp:amount,freight_invoice_number:optional(80),
  freight_guide_reference:optional(80),freight_payment_required:z.enum(["","si","no","pendiente"]).default(""),
  freight_invoice_status:z.enum(["","pendiente","parcial","pagada"]).default(""),guide_notes:optional(500),
});
const itemSchema=z.object({
  item_id:z.union([uuid,z.literal("")]).default(""),line_number:z.coerce.number().int().min(1).max(100),
  material_id:z.union([uuid,z.literal("")]).default(""),material_name:optional(160),origin_ticket:optional(80),origin_kg:amount,stock_kg:amount,
  departure_ticket:optional(80),destination_ticket:optional(80),arrival_kg:amount,returned_kg:amount,
  return_ticket:optional(80),return_kg:amount,destination_impurity_kg:amount,invoice_kg:amount,
  agreed_price_clp:amount,invoice_price_clp:amount,invoice_number:optional(80),
  invoice_issued_on:date,invoice_status:z.enum(["","pendiente","parcial","pagada"]).default(""),
  payment_on:date,valued_guide_number:optional(80),notes:optional(500),
});
type Header=z.infer<typeof headerSchema>;
type Item=z.infer<typeof itemSchema>;
export type MaterialGuide={id:string;guide_number:string;movement_on:Date|string;movement_type:"venta"|"compra"|"traslado";
  movement_detail:string|null;counterparty_id:string;counterparty_name:string;origin:string;destination:string;driver_name:string|null;truck_plate:string|null;
  trailer_plate:string|null;freight_company:string|null;freight_cost_clp:string|null;freight_invoice_number:string|null;
  freight_guide_reference:string|null;freight_payment_required:string|null;freight_invoice_status:string|null;notes:string|null;
  created_at:Date|string;line_count:string;departure_kg:string|null;missing_arrival:string;missing_invoice:string;missing_payment:string;unposted_stock:string};
export type MaterialGuideItem={id:string;guide_id:string;line_number:number;material_name:string;
  material_id:string|null;origin_ticket:string|null;origin_kg:string|null;stock_kg:string|null;departure_ticket:string|null;
  destination_ticket:string|null;arrival_kg:string|null;returned_kg:string|null;return_ticket:string|null;
  return_kg:string|null;destination_impurity_kg:string|null;invoice_kg:string|null;agreed_price_clp:string|null;
  invoice_price_clp:string|null;invoice_number:string|null;invoice_issued_on:Date|string|null;
  invoice_status:string|null;payment_on:Date|string|null;valued_guide_number:string|null;notes:string|null};

const cents=(value:string|number|null)=>value==null||value===""?null:Math.round(Number(value)*100);
export function materialGuideTotals(item:Pick<MaterialGuideItem,"origin_kg"|"stock_kg"|"arrival_kg"|"returned_kg"|
  "destination_impurity_kg"|"invoice_kg"|"agreed_price_clp"|"invoice_price_clp">){
  const source=cents(item.origin_kg),stock=cents(item.stock_kg),arrival=cents(item.arrival_kg);
  const returned=cents(item.returned_kg)??0,impurity=cents(item.destination_impurity_kg)??0;
  const invoice=cents(item.invoice_kg),agreed=cents(item.agreed_price_clp),charged=cents(item.invoice_price_clp);
  const departure=source==null&&stock==null?null:(source??0)+(stock??0);
  const estimated=arrival==null||agreed==null?null:Math.round((arrival-impurity)*agreed/10_000);
  const billed=invoice==null||charged==null?null:Math.round(invoice*charged/10_000);
  return {departure_kg:departure==null?null:departure/100,
    destination_difference_kg:departure==null||arrival==null?null:(arrival-(departure-returned))/100,
    invoice_difference_kg:arrival==null||invoice==null?null:(arrival-impurity-invoice)/100,
    estimated_clp:estimated,billed_clp:billed,value_difference_clp:estimated==null||billed==null?null:estimated-billed};
}

function validateItem(item:Item,type:MaterialGuide["movement_type"]){
  if(!item.material_id&&item.material_name.length<2)reject("Seleccione el material del catálogo o escriba su nombre.");
  if(item.stock_kg!==""&&Math.abs(Number(item.stock_kg)*100-Math.round(Number(item.stock_kg)*100))>0.000001)
    reject("Los kilos desde stock admiten hasta dos decimales.");
  const hasWeight=[item.origin_kg,item.stock_kg,item.arrival_kg,item.return_kg].some(v=>v!==""&&Number(v)>0);
  if(!hasWeight)reject("Registre al menos un peso mayor que cero para el material.");
  const departure=(Number(item.origin_kg||0)+Number(item.stock_kg||0));
  if(type==="venta"&&departure<=0)reject("La venta requiere peso de salida desde faena o stock.");
  if(type==="venta"&&Number(item.stock_kg||0)>0&&!item.material_id)
    reject("La salida desde stock requiere un material del catálogo y saldo disponible.");
  if(item.returned_kg!==""&&departure>0&&Number(item.returned_kg)>departure)
    reject("La devolución supera el peso de salida.");
  if(item.destination_impurity_kg!==""&&item.arrival_kg!==""&&Number(item.destination_impurity_kg)>Number(item.arrival_kg))
    reject("La impureza descontada supera el peso de llegada.");
  if(item.invoice_status==="pagada"&&(!item.invoice_number||!item.invoice_issued_on||!item.payment_on))
    reject("Para marcar la factura pagada, registre número y fecha de factura y fecha de pago.");
  if(item.payment_on&&item.invoice_issued_on&&item.payment_on<item.invoice_issued_on)
    reject("El pago no puede ser anterior a la factura.");
}

const base=`SELECT g.*,c.name AS counterparty_name,
  count(i.id)::text AS line_count,
  sum(COALESCE(i.origin_kg,0)+COALESCE(i.stock_kg,0)) FILTER (WHERE i.origin_kg IS NOT NULL OR i.stock_kg IS NOT NULL)::text AS departure_kg,
  count(i.id) FILTER (WHERE g.movement_type='venta' AND i.arrival_kg IS NULL)::text AS missing_arrival,
  count(i.id) FILTER (WHERE g.movement_type='venta' AND i.invoice_number IS NULL)::text AS missing_invoice,
  count(i.id) FILTER (WHERE g.movement_type='venta' AND i.invoice_number IS NOT NULL AND i.invoice_status IS DISTINCT FROM 'pagada')::text AS missing_payment,
  count(i.id) FILTER (WHERE g.movement_type='venta' AND i.stock_kg>0 AND
    COALESCE((SELECT -sum(m.delta_kg) FROM material_stock_movements m WHERE m.guide_item_id=i.id),0)<i.stock_kg)::text AS unposted_stock
  FROM material_guides g JOIN clients c ON c.id=g.counterparty_id LEFT JOIN material_guide_items i ON i.guide_id=g.id`;

export async function listMaterialGuides(actor:Actor,term="",type=""){
  manage(actor);
  const q=term.trim().slice(0,100);
  const kind=["venta","compra","traslado"].includes(type)?type:"";
  return db.query<MaterialGuide>(`${base} WHERE ($1::text='' OR g.guide_number ILIKE '%'||$1||'%'
    OR c.name ILIKE '%'||$1||'%' OR EXISTS (SELECT 1 FROM material_guide_items x WHERE x.guide_id=g.id AND x.material_name ILIKE '%'||$1||'%'))
    AND ($2::text='' OR g.movement_type=$2)
    GROUP BY g.id,c.name ORDER BY g.movement_on DESC,g.created_at DESC LIMIT 250`,[q,kind]);
}

export async function getMaterialGuide(actor:Actor,id:string){
  manage(actor);
  if(!uuid.safeParse(id).success)reject("Guía no encontrada.");
  const [guide]=await db.query<MaterialGuide>(`${base} WHERE g.id=$1 GROUP BY g.id,c.name`,[id]);
  if(!guide)reject("Guía no encontrada.");
  const items=await db.query<MaterialGuideItem>("SELECT * FROM material_guide_items WHERE guide_id=$1 ORDER BY line_number",[id]);
  return {guide,items};
}

async function insertItem(tx:Db,actor:Actor,guideId:string,item:Item,type:MaterialGuide["movement_type"],
  guideNumber:string,movementOn:string){
  validateItem(item,type);
  const materialName=item.material_id?await catalogName(tx,item.material_id):item.material_name;
  const columns=["guide_id","line_number","material_id","material_name","origin_ticket","origin_kg","stock_kg","departure_ticket",
    "destination_ticket","arrival_kg","returned_kg","return_ticket","return_kg","destination_impurity_kg","invoice_kg",
    "agreed_price_clp","invoice_price_clp","invoice_number","invoice_issued_on","invoice_status","payment_on",
    "valued_guide_number","notes","recorded_by"];
  const vals=[guideId,item.line_number,item.material_id,materialName,item.origin_ticket,item.origin_kg,item.stock_kg,item.departure_ticket,
    item.destination_ticket,item.arrival_kg,item.returned_kg,item.return_ticket,item.return_kg,item.destination_impurity_kg,
    item.invoice_kg,item.agreed_price_clp,item.invoice_price_clp,item.invoice_number,item.invoice_issued_on,item.invoice_status,
    item.payment_on,item.valued_guide_number,item.notes,actor.id].map(v=>v===""?null:v);
  const [row]=await tx.query<{id:string}>(`INSERT INTO material_guide_items (${columns.join(",")})
    VALUES (${columns.map((_,n)=>`$${n+1}`).join(",")}) ON CONFLICT (guide_id,line_number) DO NOTHING RETURNING id`,vals);
  if(!row)reject("Ese número de ítem ya existe en la guía.");
  await syncGuideStock(tx,actor,row.id,item.material_id||null,Number(item.stock_kg||0),guideNumber,movementOn,type);
  await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'create','material_guide_item',$2,$3)",
    [actor.id,row.id,JSON.stringify({guide_id:guideId,...item})]);
  return row.id;
}

export async function createMaterialGuide(actor:Actor,input:unknown){
  manage(actor);
  const raw=headerSchema.merge(itemSchema).parse(input);
  const header=headerSchema.parse(raw),item=itemSchema.parse(raw);
  validateItem(item,header.movement_type);
  return transaction(async tx=>{
    const [existing]=await tx.query<{id:string;created_by:string}>("SELECT id,created_by FROM material_guides WHERE submission_key=$1",[header.submission_key]);
    if(existing){if(existing.created_by!==actor.id)reject("Clave de formulario utilizada por otra persona.");return existing.id;}
    const [client]=await tx.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL",[header.counterparty_id]);
    if(!client)reject("Seleccione una contraparte activa.");
    const [duplicate]=await tx.query("SELECT id FROM material_guides WHERE operating_company='rerchar' AND lower(guide_number)=lower($1)",[header.guide_number]);
    if(duplicate)reject("Ese número de guía ya figura en RERCHAR. Ábralo y agregue otro material.");
    const [guide]=await tx.query<{id:string}>(`INSERT INTO material_guides(submission_key,guide_number,movement_on,movement_type,movement_detail,counterparty_id,
      origin,destination,driver_name,truck_plate,trailer_plate,freight_company,freight_cost_clp,freight_invoice_number,
      freight_guide_reference,freight_payment_required,freight_invoice_status,notes,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [header.submission_key,header.guide_number,header.movement_on,header.movement_type,nullIfEmpty(header.movement_detail),header.counterparty_id,
        header.origin,header.destination,...[header.driver_name,header.truck_plate,header.trailer_plate,header.freight_company].map(nullIfEmpty),
        nullIfEmpty(header.freight_cost_clp),...[header.freight_invoice_number,header.freight_guide_reference,
          header.freight_payment_required,header.freight_invoice_status,header.guide_notes].map(nullIfEmpty),actor.id]);
    await insertItem(tx,actor,guide.id,item,header.movement_type,header.guide_number,header.movement_on);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'create','material_guide',$2,$3)",
      [actor.id,guide.id,JSON.stringify(header)]);
    return guide.id;
  });
}

export async function saveMaterialGuideItem(actor:Actor,guideId:string,input:unknown){
  manage(actor);if(!uuid.safeParse(guideId).success)reject("Guía inválida.");
  const item=itemSchema.parse(input);
  return transaction(async tx=>{
    const [guide]=await tx.query<{movement_type:MaterialGuide["movement_type"];guide_number:string;movement_on:Date|string}>(
      "SELECT movement_type,guide_number,movement_on FROM material_guides WHERE id=$1 FOR UPDATE",[guideId]);
    if(!guide)reject("Guía no encontrada.");
    validateItem(item,guide.movement_type);
    const movementOn=guide.movement_on instanceof Date?guide.movement_on.toISOString().slice(0,10):String(guide.movement_on).slice(0,10);
    if(!item.item_id)return insertItem(tx,actor,guideId,item,guide.movement_type,guide.guide_number,movementOn);
    const [previous]=await tx.query<MaterialGuideItem>("SELECT * FROM material_guide_items WHERE id=$1 AND guide_id=$2 FOR UPDATE",[item.item_id,guideId]);
    if(!previous||previous.line_number!==item.line_number)reject("Ítem no encontrado; recargue la guía.");
    const materialName=item.material_id?await catalogName(tx,item.material_id):item.material_name;
    const fields=["material_id","material_name","origin_ticket","origin_kg","stock_kg","departure_ticket","destination_ticket","arrival_kg",
      "returned_kg","return_ticket","return_kg","destination_impurity_kg","invoice_kg","agreed_price_clp",
      "invoice_price_clp","invoice_number","invoice_issued_on","invoice_status","payment_on","valued_guide_number","notes"] as const;
    const values=fields.map(f=>nullIfEmpty(f==="material_name"?materialName:item[f]));
    await tx.query(`UPDATE material_guide_items SET ${fields.map((f,n)=>`${f}=$${n+3}`).join(",")},recorded_by=$${fields.length+3},updated_at=now()
      WHERE id=$1 AND guide_id=$2`,[item.item_id,guideId,...values,actor.id]);
    await syncGuideStock(tx,actor,item.item_id,item.material_id||null,Number(item.stock_kg||0),guide.guide_number,movementOn,guide.movement_type);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,'update','material_guide_item',$2,$3,$4)",
      [actor.id,item.item_id,JSON.stringify(previous),JSON.stringify(item)]);
    return item.item_id;
  });
}

export async function updateMaterialGuide(actor:Actor,id:string,input:unknown){
  manage(actor);if(!uuid.safeParse(id).success)reject("Guía inválida.");
  const data=headerSchema.omit({submission_key:true,guide_number:true,movement_type:true}).parse(input);
  await transaction(async tx=>{
    const [previous]=await tx.query<MaterialGuide>("SELECT * FROM material_guides WHERE id=$1 FOR UPDATE",[id]);
    if(!previous)reject("Guía no encontrada.");
    const [client]=await tx.query("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.counterparty_id]);
    if(!client)reject("Seleccione una contraparte activa.");
    const fields=["movement_on","counterparty_id","movement_detail","origin","destination","driver_name","truck_plate","trailer_plate",
      "freight_company","freight_cost_clp","freight_invoice_number","freight_guide_reference","freight_payment_required",
      "freight_invoice_status","notes"] as const;
    await tx.query(`UPDATE material_guides SET ${fields.map((f,n)=>`${f}=$${n+2}`).join(",")},updated_at=now() WHERE id=$1`,
      [id,...fields.map(f=>nullIfEmpty(f==="notes"?data.guide_notes:data[f]))]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,'update','material_guide',$2,$3,$4)",
      [actor.id,id,JSON.stringify(previous),JSON.stringify(data)]);
  });
}
