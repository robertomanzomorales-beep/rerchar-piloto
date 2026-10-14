import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction,type Db} from "./db";
import nodemailer from "nodemailer";
import {renderQuotePdf} from "./quote-pdf";
import {quoteFolio} from "./companies";
import {quotePrincipals,quoteUnits,validQuoteSegment} from "./quote-catalog";
import {wasteCategories,segmentWasteCategory,destinationNeeded,categoryName} from "./destination-catalog";
import {calculateQuoteCost,type QuoteCosting} from "./quote-planning";
import {catalogName} from "./material-stock";
export {quoteFolio} from "./companies";

const uuid=z.uuid();
const optional=(max:number)=>z.string().trim().max(max).optional().default("");
const money=z.union([z.string(),z.number()]).transform((v,ctx)=>{
  const value=String(v).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)>100_000_000){ctx.addIssue({code:"custom",message:"Precio unitario inválido."});return z.NEVER;}
  return value;
});
const quantity=z.union([z.string(),z.number()]).transform((v,ctx)=>{
  const value=String(v).trim();
  if(!/^\d+(?:\.\d{1,3})?$/.test(value)||Number(value)<=0||Number(value)>100_000_000){ctx.addIssue({code:"custom",message:"Cantidad inválida."});return z.NEVER;}
  return value;
});
const item=z.object({description:z.string().trim().min(2).max(240),quantity,unit:z.string().trim().min(1).max(30),unit_price_clp:money,
  taxable:z.boolean().default(true),principal:z.string().trim().default(""),segment:z.string().trim().default(""),
  waste_category:z.string().trim().default(""),destination_id:z.string().trim().default(""),
  material_id:z.string().trim().default(""),line_note:optional(500)});
export class QuoteError extends Error {}
function reject(message:string):never{throw new QuoteError(message);}
function canEdit(actor:Actor){if(!canManage(actor))reject("Sólo operaciones puede preparar cotizaciones.");}
export const issuers={rerchar:{name:"RERCHAR CHILE SPA",tax_id:"77.639.762-8"},e_y_j:{name:"EMPRESAS DE SERVICIOS INTEGRALES E Y J LIMITADA",tax_id:"76.347.909-9"}} as const;
export type Quote={id:string;folio:string;display_folio:string|null;submission_key:string;client_id:string;issuer:keyof typeof issuers;client_name:string;client_tax_id:string|null;
  client_email:string|null;client_address:string|null;title:string;notes:string|null;issued_on:Date|string;valid_until:Date|string;vat_rate:string;status:string;sent_at:Date|null;created_at:Date;
  route_required:boolean;commercial_kind:"general"|"compra_material";tax_review_status:"no_aplica"|"pendiente"|"sin_iva"|"con_iva";tax_review_note:string|null;segments?:string[]};
export type QuoteLine={id:string;position:number;description:string;quantity:string;unit:string;unit_price_clp:string;taxable:boolean;
  principal:string|null;segment:string|null;waste_category:string|null;destination_id:string|null;destination_name:string|null;destination_required:boolean;
  material_id:string|null;line_note:string|null};
export type PublicQuoteRoute={origin:string;pickup:string;destination:string;return_to:string;total_km:string};
function checkClassification(data:z.infer<typeof item>,required:boolean){
  if(!data.principal&&!data.segment){if(required)reject("Seleccione Principal y Segmentación para el concepto.");return;}
  if(!validQuoteSegment(data.principal,data.segment))reject("Seleccione una Segmentación correspondiente a Principal.");
  if(!quoteUnits.some(unit=>unit.value===data.unit))reject("Seleccione una unidad de cobro del catálogo.");
}
function checkDestinationInput(data:z.infer<typeof item>){
  if(data.waste_category&&!wasteCategories.some(item=>item.value===data.waste_category))reject("Tipo de residuo inválido.");
  if(data.destination_id&&!uuid.safeParse(data.destination_id).success)reject("Seleccione un destino del maestro.");
  if(data.destination_id&&!data.waste_category)reject("Indique el residuo o material del destino.");
}
async function destinationSnapshot(tx:Db,destinationId:string){
  if(!destinationId)return null;
  const [destination]=await tx.query<{name:string}>("SELECT name FROM quote_destinations WHERE id=$1",[destinationId]);
  if(!destination)reject("El destino ya no está disponible.");
  return destination.name;
}
async function purchaseLine(tx:Db,data:z.infer<typeof item>,kind:"general"|"compra_material",tax:"no_aplica"|"pendiente"|"sin_iva"|"con_iva"){
  if(kind==="general"){
    if(data.material_id&&data.principal!=="compra")reject("El material del catálogo corresponde a un concepto de compra.");
    const name=data.material_id?await catalogName(tx,data.material_id):data.description;
    return {name,materialId:data.material_id||null,taxable:data.taxable};
  }
  if(data.principal!=="compra"||data.segment!=="compra_metal"||data.unit!=="kg"||data.destination_id||data.waste_category)
    reject("Una propuesta de compra admite exclusivamente materiales del catálogo en kg.");
  if(!data.material_id)reject("Seleccione un material del catálogo de Entrada de material.");
  const name=await catalogName(tx,data.material_id);
  return {name,materialId:data.material_id,taxable:tax==="con_iva"};
}
type DestinationValidity={id:string;name:string;status:string;accepted_categories:string[];
  authorization_valid_until:Date|string|null;authorization_document_name:string|null;disposal_unit:string|null;disposal_price_clp:string|null};
export async function quoteDeliveryIssues(quote:Pick<Quote,"valid_until"> & Partial<Pick<Quote,"id"|"route_required"|"vat_rate"|"commercial_kind"|"tax_review_status">>,lines:QuoteLine[],source:Db=db){
  const ids=[...new Set(lines.map(line=>line.destination_id).filter((id):id is string=>Boolean(id)))];
  const destinations=ids.length?await source.query<DestinationValidity>(`SELECT id,name,status,accepted_categories,
    authorization_valid_until,authorization_document_name,disposal_unit,disposal_price_clp FROM quote_destinations WHERE id=ANY($1::uuid[])`,[ids]):[];
  const byId=new Map(destinations.map(item=>[item.id,item]));
  const validUntil=quote.valid_until instanceof Date?quote.valid_until.toISOString().slice(0,10):String(quote.valid_until).slice(0,10);
  const issues:string[]=[];
  if(quote.commercial_kind==="compra_material"){
    if(quote.tax_review_status==="pendiente")issues.push("Compra de material: registre la confirmación del tratamiento de IVA con Johana antes de entregar.");
    if(lines.some(line=>!line.material_id||line.principal!=="compra"||line.unit!=="kg"))issues.push("Complete el material del catálogo y kg de cada concepto de compra.");
  }
  for(const line of lines){
    const context=`Concepto ${line.position} (${line.description})`;
    if(line.destination_required&&destinationNeeded(line.segment)&&!line.destination_id){issues.push(`${context}: seleccione un destino final.`);continue;}
    if(!line.destination_id)continue;
    if(!line.waste_category){issues.push(`${context}: indique la categoría de residuo.`);continue;}
    const expected=line.segment?segmentWasteCategory[line.segment]:null;
    if(expected&&line.waste_category!==expected)issues.push(`${context}: la segmentación requiere ${categoryName(expected)}.`);
    const destination=byId.get(line.destination_id);
    if(!destination){issues.push(`${context}: destino inexistente.`);continue;}
    if(line.destination_name!==destination.name)issues.push(`${context}: el destino cambió de nombre; guarde nuevamente el concepto.`);
    if(destination.status!=="habilitado")issues.push(`${context}: ${destination.name} no está habilitado.`);
    if(!destination.accepted_categories.includes(line.waste_category))issues.push(`${context}: ${destination.name} no admite ${categoryName(line.waste_category)}.`);
    const expiry=destination.authorization_valid_until instanceof Date?destination.authorization_valid_until.toISOString().slice(0,10):String(destination.authorization_valid_until??"").slice(0,10);
    if(!expiry||expiry<validUntil)issues.push(`${context}: la autorización de ${destination.name} no cubre la vigencia de la cotización.`);
    if(!destination.authorization_document_name||!destination.disposal_unit||destination.disposal_price_clp===null)
      issues.push(`${context}: faltan respaldo o tarifa de disposición de ${destination.name}.`);
  }
  if(quote.route_required&&quote.id){
    if(new Set(lines.map(line=>line.destination_id).filter(Boolean)).size>1)
      issues.push("Esta cotización incluye varios destinos finales. Separe los circuitos en cotizaciones distintas.");
    const [route]=await source.query<{reviewed_for_truck:boolean;total_km:string}>("SELECT reviewed_for_truck,total_km FROM client_quote_routes WHERE quote_id=$1",[quote.id]);
    const [cost]=await source.query<QuoteCosting>("SELECT * FROM client_quote_costings WHERE quote_id=$1",[quote.id]);
    if(!route)issues.push("Defina planta, retiro, destino, retorno y kilómetros del circuito.");
    else if(!route.reviewed_for_truck)issues.push("Revise y confirme que el circuito es apto para el camión.");
    if(!cost)issues.push("Guarde el cálculo interno de costos y precio de venta.");
    else if(route){
      try{if(calculateQuoteCost(cost,Number(route.total_km),Number(quote.vat_rate??"0.19")).cost<=0)
        issues.push("El cálculo interno no registra costos de la operación.");}
      catch{issues.push("Revise rendimiento y montos del cálculo interno después de cambiar la ruta.");}
    }
  }
  return issues;
}
export function quoteTotals(lines:Pick<QuoteLine,"quantity"|"unit_price_clp"|"taxable">[],vatRate=0.19){
  const priced=lines.map(line=>({amount:Math.round(Number(line.quantity)*Number(line.unit_price_clp)),taxable:line.taxable}));
  const net=priced.reduce((sum,line)=>sum+line.amount,0);
  const taxable=priced.filter(line=>line.taxable).reduce((sum,line)=>sum+line.amount,0);
  const vat=Math.round(taxable*vatRate);
  return {net,vat,total:net+vat,lines:priced.map(line=>line.amount)};
}

export async function listQuotes(actor:Actor,clientId="",company="",principal="",segment=""){
  if(actor.role==="conductor")reject("Sin acceso a cotizaciones.");
  if(clientId && !uuid.safeParse(clientId).success)reject("Cliente inválido.");
  if(company && !["rerchar","e_y_j"].includes(company))reject("Empresa inválida.");
  if(principal&&!quotePrincipals.some(item=>item.value===principal))reject("Principal inválida.");
  if(segment&&!validQuoteSegment(principal,segment))reject("Segmentación inválida.");
  return db.query<Quote>(`SELECT q.*,COALESCE((SELECT array_agg(DISTINCT l.segment) FILTER (WHERE l.segment IS NOT NULL)
    FROM client_quote_lines l WHERE l.quote_id=q.id),'{}'::text[]) AS segments
    FROM client_quotes q WHERE ($1::text='' OR q.client_id=NULLIF($1,'')::uuid)
    AND ($2::text<>'cliente' OR (q.client_id=$3::uuid AND q.status IN ('enviada','aceptada','rechazada')))
    AND ($4::text='' OR q.issuer=$4)
    AND ($5::text='' OR EXISTS (SELECT 1 FROM client_quote_lines l WHERE l.quote_id=q.id AND l.principal=$5 AND ($6::text='' OR l.segment=$6)))
    ORDER BY q.created_at DESC LIMIT 250`,[clientId,actor.role,actor.client_id,company,principal,segment]);
}
export type QuoteReportLine={folio:string;display_folio:string|null;issuer:keyof typeof issuers;client_name:string;title:string;
  status:string;issued_on:Date|string;principal:string|null;segment:string|null;description:string;quantity:string;
  unit:string;unit_price_clp:string;taxable:boolean;vat_rate:string;waste_category:string|null;destination_name:string|null;
  material_id:string|null;line_note:string|null;commercial_kind:string;tax_review_status:string};
export async function reportQuoteLines(actor:Actor,company="",principal="",segment=""){
  if(actor.role==="conductor")reject("Sin acceso a cotizaciones.");
  if(company&&!["rerchar","e_y_j"].includes(company))reject("Empresa inválida.");
  if(principal&&!quotePrincipals.some(group=>group.value===principal))reject("Principal inválida.");
  if(segment&&!validQuoteSegment(principal,segment))reject("Segmentación inválida.");
  const rows=await db.query<QuoteReportLine>(`SELECT q.folio,q.display_folio,q.issuer,q.client_name,q.title,q.status,q.issued_on,q.vat_rate,q.commercial_kind,q.tax_review_status,
    l.principal,l.segment,l.description,l.quantity,l.unit,l.unit_price_clp,l.taxable,l.waste_category,l.destination_name,l.material_id,l.line_note
    FROM client_quotes q JOIN client_quote_lines l ON l.quote_id=q.id
    WHERE ($1::text<>'cliente' OR (q.client_id=$2::uuid AND q.status IN ('enviada','aceptada','rechazada')))
    AND ($3::text='' OR q.issuer=$3) AND ($4::text='' OR l.principal=$4) AND ($5::text='' OR l.segment=$5)
    ORDER BY q.created_at DESC,l.position LIMIT 1001`,[actor.role,actor.client_id,company,principal,segment]);
  if(rows.length>1000)reject("El reporte supera 1.000 conceptos. Acote los filtros antes de exportar.");
  return rows;
}
export async function getQuote(actor:Actor,quoteId:string){
  if(!uuid.safeParse(quoteId).success)reject("Cotización inexistente.");
  const [quote]=await db.query<Quote>("SELECT * FROM client_quotes WHERE id=$1",[quoteId]);
  if(!quote||actor.role==="conductor"||(actor.role==="cliente"&&(actor.client_id!==quote.client_id||!["enviada","aceptada","rechazada"].includes(quote.status))))reject("Cotización no disponible.");
  const lines=await db.query<QuoteLine>("SELECT * FROM client_quote_lines WHERE quote_id=$1 ORDER BY position",[quoteId]);
  const [route]=await db.query<PublicQuoteRoute>(`SELECT origin,pickup,destination,return_to,total_km FROM client_quote_routes
    WHERE quote_id=$1 AND reviewed_for_truck=true`,[quoteId]);
  return {quote,lines,route:route??null,totals:quoteTotals(lines,Number(quote.vat_rate))};
}
export async function createQuote(actor:Actor,input:unknown){
  canEdit(actor);
  const data=z.object({submission_key:uuid,client_id:uuid,issuer:z.enum(["rerchar","e_y_j"]),title:z.string().trim().min(3).max(180),
    notes:optional(1000),issued_on:z.iso.date(),valid_until:z.iso.date(),vat_rate:z.union([z.literal("0"),z.literal("0.19")]).default("0.19"),line:item}).parse(input);
  checkClassification(data.line,true);
  checkDestinationInput(data.line);
  if(data.valid_until<data.issued_on)reject("La vigencia no puede vencer antes de la fecha de emisión.");
  return transaction(async tx=>{
    const [client]=await tx.query<{name:string;tax_id:string|null;email:string|null;address:string|null}>("SELECT name,tax_id,email,address FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.client_id]);
    if(!client)reject("Seleccione un cliente registrado.");
    const [existing]=await tx.query<{id:string;created_by:string}>("SELECT id,created_by FROM client_quotes WHERE submission_key=$1",[data.submission_key]);
    if(existing){if(existing.created_by!==actor.id)reject("La clave de cotización pertenece a otro usuario.");return existing.id;}
    const kind=data.line.principal==="compra"?"compra_material":"general";
    const line=await purchaseLine(tx,data.line,kind,"pendiente");
    const [quote]=await tx.query<{id:string;folio:string}>(`INSERT INTO client_quotes
      (submission_key,client_id,issuer,client_name,client_tax_id,client_email,client_address,title,notes,issued_on,valid_until,vat_rate,created_by,commercial_kind,tax_review_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),$10,$11,$12,$13,$14,$15) RETURNING id,folio`,
      [data.submission_key,data.client_id,data.issuer,client.name,client.tax_id,client.email,client.address,data.title,data.notes,
       data.issued_on,data.valid_until,kind==="compra_material"?"0":data.vat_rate,actor.id,kind,kind==="compra_material"?"pendiente":"no_aplica"]);
    const displayFolio=`COT-${data.issuer==="rerchar"?"RER":"EYJ"}-${String(quote.folio).padStart(5,"0")}`;
    await tx.query("UPDATE client_quotes SET display_folio=$2,route_required=$3 WHERE id=$1",
      [quote.id,displayFolio,["retiro","transporte","instalacion"].includes(data.line.principal)]);
    const destinationName=await destinationSnapshot(tx,data.line.destination_id);
    await tx.query(`INSERT INTO client_quote_lines(quote_id,position,description,quantity,unit,unit_price_clp,taxable,principal,segment,waste_category,destination_id,destination_name,destination_required,material_id,line_note)
      VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),NULLIF($10,'')::uuid,$11,true,$12,NULLIF($13,''))`,
      [quote.id,line.name,data.line.quantity,data.line.unit,data.line.unit_price_clp,line.taxable,data.line.principal,data.line.segment,
       data.line.waste_category,data.line.destination_id,destinationName,line.materialId,data.line.line_note]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'create','client_quote',$2,$3)",
      [actor.id,quote.id,JSON.stringify({client_id:data.client_id,title:data.title,issuer:data.issuer})]);
    return quote.id;
  });
}
export async function addQuoteLine(actor:Actor,quoteId:string,input:unknown){
  canEdit(actor);const id=uuid.parse(quoteId),data=item.parse(input);
  checkClassification(data,true);
  checkDestinationInput(data);
  return transaction(async tx=>{
    const [quote]=await tx.query<Pick<Quote,"status"|"commercial_kind"|"tax_review_status">>("SELECT status,commercial_kind,tax_review_status FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||quote.status!=="borrador")reject("Sólo el borrador admite nuevos conceptos.");
    const [count]=await tx.query<{count:string}>("SELECT count(*)::text AS count FROM client_quote_lines WHERE quote_id=$1",[id]);
    if(Number(count.count)>=100)reject("Esta cotización alcanzó 100 conceptos.");
    const [position]=await tx.query<{next:number}>("SELECT COALESCE(max(position),0)+1 AS next FROM client_quote_lines WHERE quote_id=$1",[id]);
    const destinationName=await destinationSnapshot(tx,data.destination_id);
    const purchase=await purchaseLine(tx,data,quote.commercial_kind,quote.tax_review_status);
    const [line]=await tx.query<{id:string}>(`INSERT INTO client_quote_lines(quote_id,position,description,quantity,unit,unit_price_clp,taxable,principal,segment,waste_category,destination_id,destination_name,destination_required,material_id,line_note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),NULLIF($11,'')::uuid,$12,true,$13,NULLIF($14,'')) RETURNING id`,
      [id,position.next,purchase.name,data.quantity,data.unit,data.unit_price_clp,purchase.taxable,data.principal,data.segment,
       data.waste_category,data.destination_id,destinationName,purchase.materialId,data.line_note]);
    if(["retiro","transporte","instalacion"].includes(data.principal))
      await tx.query("UPDATE client_quotes SET route_required=true WHERE id=$1",[id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'add_line','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify({line_id:line.id,description:data.description})]);
    return line.id;
  });
}
export async function updateQuoteLine(actor:Actor,quoteId:string,lineId:string,input:unknown){
  canEdit(actor);const id=uuid.parse(quoteId),line=uuid.parse(lineId),data=item.parse(input);
  checkDestinationInput(data);
  await transaction(async tx=>{
    const [quote]=await tx.query<Pick<Quote,"status"|"commercial_kind"|"tax_review_status">>("SELECT status,commercial_kind,tax_review_status FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(quote?.status!=="borrador")reject("Sólo se pueden corregir conceptos de un borrador.");
    const [previous]=await tx.query<QuoteLine>("SELECT * FROM client_quote_lines WHERE id=$1 AND quote_id=$2",[line,id]);
    if(!previous)reject("El concepto no pertenece a esta cotización.");
    checkClassification(data,Boolean(previous.principal));
    const destinationName=await destinationSnapshot(tx,data.destination_id);
    const purchase=await purchaseLine(tx,data,quote.commercial_kind,quote.tax_review_status);
    await tx.query(`UPDATE client_quote_lines SET description=$3,quantity=$4,unit=$5,unit_price_clp=$6,taxable=$7,
      principal=NULLIF($8,''),segment=NULLIF($9,''),waste_category=NULLIF($10,''),destination_id=NULLIF($11,'')::uuid,destination_name=$12,
      destination_required=destination_required OR NULLIF($11,'') IS NOT NULL,material_id=$13,line_note=NULLIF($14,'')
      WHERE id=$1 AND quote_id=$2`,
      [line,id,purchase.name,data.quantity,data.unit,data.unit_price_clp,purchase.taxable,data.principal,data.segment,
       data.waste_category,data.destination_id,destinationName,purchase.materialId,data.line_note]);
    await tx.query(`UPDATE client_quotes SET route_required=EXISTS
      (SELECT 1 FROM client_quote_lines WHERE quote_id=$1 AND principal IN ('retiro','transporte','instalacion')) WHERE id=$1`,[id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,'update_line','client_quote',$2,$3,$4)",
      [actor.id,id,JSON.stringify(previous),JSON.stringify({line_id:line,...data})]);
  });
}
export async function removeQuoteLine(actor:Actor,quoteId:string,lineId:string){
  canEdit(actor);const id=uuid.parse(quoteId),line=uuid.parse(lineId);
  await transaction(async tx=>{
    const [quote]=await tx.query<{status:string}>("SELECT status FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(quote?.status!=="borrador")reject("Sólo se pueden quitar conceptos de un borrador.");
    const [previous]=await tx.query<QuoteLine>("SELECT * FROM client_quote_lines WHERE id=$1 AND quote_id=$2",[line,id]);
    if(!previous)reject("El concepto no pertenece a esta cotización.");
    const [count]=await tx.query<{count:string}>("SELECT count(*)::text AS count FROM client_quote_lines WHERE quote_id=$1",[id]);
    if(Number(count.count)<=1)reject("La cotización debe conservar al menos un concepto.");
    await tx.query("DELETE FROM client_quote_lines WHERE id=$1 AND quote_id=$2",[line,id]);
    await tx.query(`UPDATE client_quotes SET route_required=EXISTS
      (SELECT 1 FROM client_quote_lines WHERE quote_id=$1 AND principal IN ('retiro','transporte','instalacion')) WHERE id=$1`,[id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value) VALUES ($1,'remove_line','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify(previous)]);
  });
}
export async function recordQuoteDecision(actor:Actor,quoteId:string,decision:"aceptada"|"rechazada"){
  canEdit(actor);const id=uuid.parse(quoteId);
  if(!["aceptada","rechazada"].includes(decision))reject("Decisión inválida.");
  await transaction(async tx=>{
    const [quote]=await tx.query<{status:string}>("SELECT status FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||quote.status!=="enviada")reject("Registre el envío antes de actualizar la respuesta del cliente.");
    await tx.query("UPDATE client_quotes SET status=$2 WHERE id=$1",[id,decision]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,$2,'client_quote',$3,$4)",
      [actor.id,decision,id,JSON.stringify({status:decision})]);
  });
}

export async function confirmPurchaseTax(actor:Actor,quoteId:string,input:unknown){
  canEdit(actor);const id=uuid.parse(quoteId);
  const data=z.object({treatment:z.enum(["sin_iva","con_iva"]),reference:z.string().trim().min(10).max(500)}).parse(input);
  await transaction(async tx=>{
    const [quote]=await tx.query<Quote>("SELECT * FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||quote.status!=="borrador"||quote.commercial_kind!=="compra_material")reject("Sólo una propuesta de compra en borrador admite confirmar IVA.");
    await tx.query(`UPDATE client_quotes SET tax_review_status=$2,tax_review_note=$3,tax_reviewed_by=$4,
      tax_reviewed_at=now(),vat_rate=$5 WHERE id=$1`,[id,data.treatment,data.reference,actor.id,data.treatment==="con_iva"?"0.19":"0"]);
    await tx.query("UPDATE client_quote_lines SET taxable=$2 WHERE quote_id=$1",[id,data.treatment==="con_iva"]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,'confirm_purchase_tax','client_quote',$2,$3,$4)",
      [actor.id,id,JSON.stringify({treatment:quote.tax_review_status,reference:quote.tax_review_note}),JSON.stringify(data)]);
  });
}

export async function recordManualQuoteDelivery(actor:Actor,quoteId:string,input:unknown){
  canEdit(actor);const id=uuid.parse(quoteId);
  const data=z.object({channel:z.enum(["correo","presencial","otro"]),recipient:z.union([z.email(),z.literal("")]).default(""),
    reference:z.string().trim().min(10).max(500)}).parse(input);
  if(data.channel==="correo"&&!data.recipient)reject("Indique el correo al que entregó el PDF.");
  await transaction(async tx=>{
    const [quote]=await tx.query<Quote>("SELECT * FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||quote.status!=="borrador")reject("Sólo puede registrar la entrega de un borrador vigente.");
    const lines=await tx.query<QuoteLine>("SELECT * FROM client_quote_lines WHERE quote_id=$1 ORDER BY position",[id]);
    const issues=await quoteDeliveryIssues(quote,lines,tx);
    if(issues.length)reject(`Antes de entregar: ${issues[0]}`);
    await tx.query("UPDATE client_quotes SET status='enviada',sent_at=now() WHERE id=$1",[id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'manual_delivery','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify(data)]);
  });
}

export async function resolveQuoteSending(actor:Actor,quoteId:string,outcome:"borrador"|"enviada",reason:unknown){
  if(actor.role!=="admin")reject("Sólo administración puede resolver un envío sin confirmación.");
  const id=uuid.parse(quoteId),note=z.string().trim().min(10).max(500).parse(reason);
  if(!["borrador","enviada"].includes(outcome))reject("Resolución de envío inválida.");
  await transaction(async tx=>{
    const [row]=await tx.query<{status:string}>("SELECT status FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(row?.status!=="enviando")reject("Esta cotización no necesita resolución de envío.");
    await tx.query("UPDATE client_quotes SET status=$2,sent_at=CASE WHEN $2='enviada' THEN now() ELSE NULL END WHERE id=$1",[id,outcome]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'resolve_send','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify({outcome,reason:note})]);
  });
}

export function quoteMailConfigured(){return Boolean(process.env.SMTP_HOST&&process.env.SMTP_PORT&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&process.env.SMTP_FROM);}
export async function sendQuote(actor:Actor,quoteId:string){
  canEdit(actor);
  if(!quoteMailConfigured())reject("Configure el correo remitente SMTP del sistema antes de enviar cotizaciones.");
  const id=uuid.parse(quoteId);
  const {quote,lines,route}=await getQuote(actor,id);
  if(quote.status!=="borrador")reject("Esta cotización ya no está en borrador.");
  if(!quote.client_email||!z.email().safeParse(quote.client_email).success)reject("Complete el correo del cliente y cree una nueva cotización para guardar sus datos de emisión.");
  const issues=await quoteDeliveryIssues(quote,lines);
  if(issues.length)reject(`Antes de enviar: ${issues[0]}`);
  const pdf=await renderQuotePdf(quote,lines,"",route);
  const [claimed]=await db.query<{id:string}>("UPDATE client_quotes SET status='enviando' WHERE id=$1 AND status='borrador' RETURNING id",[id]);
  if(!claimed)reject("La cotización cambió de estado. Recargue la pantalla.");
  try{
    const port=Number(process.env.SMTP_PORT);
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Puerto SMTP inválido.");
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,
      auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}});
    await transport.sendMail({from:process.env.SMTP_FROM,to:quote.client_email,
      subject:`Cotización ${quoteFolio(quote)} · ${issuers[quote.issuer].name}`,
      text:`Estimada empresa ${quote.client_name}:\n\nAdjuntamos la cotización ${quoteFolio(quote)} por ${quote.title}.\n\nSaludos cordiales,\n${issuers[quote.issuer].name}`,
      attachments:[{filename:`cotizacion-${quoteFolio(quote).toLowerCase()}.pdf`,content:Buffer.from(pdf),contentType:"application/pdf"}]});
  }catch(error){
    console.error("Fallo de envío de cotización",error);
    // El servidor SMTP podría haber aceptado el mensaje antes de cortar la conexión: evite un segundo envío automático.
    throw new QuoteError("No se pudo confirmar el envío. Revise el correo saliente antes de reintentar; la cotización queda en estado de verificación.");
  }
  await transaction(async tx=>{
    await tx.query("UPDATE client_quotes SET status='enviada',sent_at=now() WHERE id=$1 AND status='enviando'",[id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'send','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify({recipient:quote.client_email,folio:quote.folio})]);
  });
}
