import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction,type Db} from "./db";
import nodemailer from "nodemailer";
import {createHash,randomBytes} from "node:crypto";
import {renderQuotePdf} from "./quote-pdf";
import {quoteFolio} from "./companies";
import {quotePrincipals,quoteUnits,validQuoteSegment} from "./quote-catalog";
import {wasteCategories,segmentWasteCategory,destinationNeeded,categoryName} from "./destination-catalog";
import {calculateQuoteCost,type QuoteCosting} from "./quote-planning";
import {catalogName,MaterialStockError} from "./material-stock";
import {normalizeQuoteText} from "./quote-text";
export {quoteFolio} from "./companies";

const uuid=z.uuid();
const optional=(max:number)=>z.string().trim().max(max).optional().default("");
const money=z.union([z.string(),z.number()]).transform((v,ctx)=>{
  const value=String(v).trim();
  if(!/^\d+(?:\.\d{1,4})?$/.test(value)||Number(value)>100_000_000){ctx.addIssue({code:"custom",message:"Precio unitario inválido."});return z.NEVER;}
  return value;
});
const quantity=z.union([z.string(),z.number()]).transform((v,ctx)=>{
  const value=String(v).trim();
  if(!/^\d+(?:\.\d{1,3})?$/.test(value)||Number(value)<=0||Number(value)>100_000_000){ctx.addIssue({code:"custom",message:"Cantidad inválida."});return z.NEVER;}
  return value;
});
const item=z.object({description:z.string().trim().min(2).max(240),quantity,unit:z.string().trim().min(1).max(30),unit_price_clp:money,
  currency:z.enum(["CLP","UF"]).default("CLP"),
  taxable:z.boolean().default(true),principal:z.string().trim().default(""),segment:z.string().trim().default(""),
  waste_category:z.string().trim().default(""),destination_id:z.string().trim().default(""),
  material_id:z.string().trim().default(""),line_note:optional(500)});
export class QuoteError extends Error {}
function reject(message:string):never{throw new QuoteError(message);}
function canEdit(actor:Actor){if(!canManage(actor))reject("Sólo operaciones puede preparar cotizaciones.");}
export const issuers={rerchar:{name:"RERCHAR CHILE SPA",tax_id:"77.639.762-8"},e_y_j:{name:"EMPRESAS DE SERVICIOS INTEGRALES E Y J LIMITADA",tax_id:"76.347.909-9"}} as const;
export type Quote={id:string;folio:string;display_folio:string|null;submission_key:string;client_id:string;issuer:keyof typeof issuers;client_name:string;client_tax_id:string|null;
  client_email:string|null;client_address:string|null;title:string;company_intro:string|null;proposal_objective:string|null;
  notes:string|null;issued_on:Date|string;valid_until:Date|string;vat_rate:string;status:string;sent_at:Date|null;created_at:Date;
  uf_rate_clp:string|null;uf_rate_on:Date|string|null;client_order_reference:string|null;client_order_on:Date|string|null;
  route_required:boolean;commercial_kind:"general"|"compra_material";tax_review_status:"no_aplica"|"pendiente"|"sin_iva"|"con_iva";tax_review_note:string|null;segments?:string[]};
export type QuoteLine={id:string;position:number;description:string;quantity:string;unit:string;unit_price_clp:string;taxable:boolean;
  currency:"CLP"|"UF";unit_price_uf:string|null;
  principal:string|null;segment:string|null;waste_category:string|null;destination_id:string|null;destination_name:string|null;destination_required:boolean;
  material_id:string|null;line_note:string|null};
export type PublicQuoteRoute={origin:string;pickup:string;destination:string;return_to:string;total_km:string};
function checkClassification(data:z.infer<typeof item>,required:boolean){
  if(!data.principal&&!data.segment){if(required)reject("Seleccione Principal y Segmentación para el concepto.");return;}
  if(!validQuoteSegment(data.principal,data.segment))reject("Seleccione una Segmentación correspondiente a Principal.");
  if(!quoteUnits.some(unit=>unit.value===data.unit))reject("Seleccione una unidad de cobro del catálogo.");
}
function checkIssuerSegment(issuer:Quote["issuer"],principal:string){
  if(issuer==="e_y_j"&&["compra","recepcion"].includes(principal))
    reject("E y J cotiza servicios y disposición; registre compra o recepción de material en RERCHAR.");
}
function commercialPrice(data:z.infer<typeof item>,ufRate:string|null){
  if(data.currency==="CLP"){
    if(!/^\d+(?:\.\d{1,2})?$/.test(data.unit_price_clp))reject("El precio CLP admite hasta dos decimales.");
    return {clp:data.unit_price_clp,uf:null,currency:"CLP"};
  }
  if(data.principal==="compra")reject("La propuesta de compra de material se registra en CLP por kilo.");
  const rate=Number(ufRate);
  if(!Number.isFinite(rate)||rate<=0)reject("Registre primero el valor UF y su fecha en el borrador.");
  const clp=Math.round(Number(data.unit_price_clp)*rate*100)/100;
  if(!Number.isFinite(clp)||clp>=1_000_000_000_000)reject("El precio UF supera el límite permitido.");
  return {clp:clp.toFixed(2),uf:data.unit_price_clp,currency:"UF"};
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
  async function nameFromCatalog(){try{return await catalogName(tx,data.material_id);}catch(error){if(error instanceof MaterialStockError)reject(error.message);throw error;}}
  if(kind==="general"){
    if(data.material_id&&data.principal!=="compra")reject("El material del catálogo corresponde a un concepto de compra.");
    const name=data.material_id?await nameFromCatalog():data.description;
    return {name,materialId:data.material_id||null,taxable:data.taxable};
  }
  if(data.principal!=="compra"||data.segment!=="compra_metal"||data.unit!=="kg"||data.destination_id||data.waste_category)
    reject("Una propuesta de compra admite exclusivamente materiales del catálogo en kg.");
  if(!data.material_id)reject("Seleccione un material del catálogo de Entrada de material.");
  const name=await nameFromCatalog();
  return {name,materialId:data.material_id,taxable:tax==="con_iva"};
}
type DestinationValidity={id:string;name:string;status:string;accepted_categories:string[];
  authorization_valid_until:Date|string|null;authorization_document_name:string|null;disposal_unit:string|null;disposal_price_clp:string|null};
export async function quoteDeliveryIssues(quote:Pick<Quote,"valid_until"> & Partial<Pick<Quote,"id"|"route_required"|"vat_rate"|"commercial_kind"|"tax_review_status"|"uf_rate_clp"|"company_intro"|"proposal_objective">>,lines:QuoteLine[],source:Db=db){
  const ids=[...new Set(lines.map(line=>line.destination_id).filter((id):id is string=>Boolean(id)))];
  const destinations=ids.length?await source.query<DestinationValidity>(`SELECT id,name,status,accepted_categories,
    authorization_valid_until,authorization_document_name,disposal_unit,disposal_price_clp FROM quote_destinations WHERE id=ANY($1::uuid[])`,[ids]):[];
  const byId=new Map(destinations.map(item=>[item.id,item]));
  const validUntil=quote.valid_until instanceof Date?quote.valid_until.toISOString().slice(0,10):String(quote.valid_until).slice(0,10);
  const issues:string[]=[];
  if(quote.company_intro!==undefined&&!quote.company_intro?.trim())issues.push("Complete la presentación de la empresa emisora.");
  if(quote.proposal_objective!==undefined&&!quote.proposal_objective?.trim())issues.push("Complete el objetivo de la propuesta.");
  if(!lines.length)issues.push("Agregue al menos un concepto a la cotización.");
  if(lines.some(line=>line.currency==="UF")&&!quote.uf_rate_clp)issues.push("Registre el valor UF de referencia y su fecha.");
  if(quote.commercial_kind!=="compra_material"&&quoteTotals(lines,Number(quote.vat_rate??"0.19")).net<=0)
    issues.push("Indique el precio de venta de los conceptos antes de entregar la cotización.");
  if(quote.commercial_kind==="compra_material"){
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
export async function setQuoteUfRate(actor:Actor,quoteId:string,input:unknown){
  canEdit(actor);const id=uuid.parse(quoteId);
  const data=z.object({rate:z.union([z.string(),z.number()]).transform(Number).pipe(z.number().finite().min(1000).max(1_000_000)),on:z.iso.date()}).parse(input);
  if(Math.abs(Math.round(data.rate*100)-data.rate*100)>0.000001)reject("Indique el valor UF en CLP con máximo dos decimales.");
  await transaction(async tx=>{
    const [quote]=await tx.query<{status:string;uf_rate_clp:string|null;uf_rate_on:Date|string|null}>(
      "SELECT status,uf_rate_clp,uf_rate_on FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(quote?.status!=="borrador")reject("Sólo el borrador admite cambiar el valor UF de referencia.");
    await tx.query("UPDATE client_quotes SET uf_rate_clp=$2,uf_rate_on=$3 WHERE id=$1",[id,data.rate,data.on]);
    await tx.query("UPDATE client_quote_lines SET unit_price_clp=round(unit_price_uf*$2,2) WHERE quote_id=$1 AND currency='UF'",[id,data.rate]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES($1,'uf_reference','client_quote',$2,$3,$4)`,[actor.id,id,
      JSON.stringify({rate:quote.uf_rate_clp,on:quote.uf_rate_on}),JSON.stringify(data)]);
  });
}

export type QuoteFilters={from?:string;to?:string;creatorId?:string};
function validateQuoteFilters(filters:QuoteFilters){
  if(filters.from&&!z.iso.date().safeParse(filters.from).success||filters.to&&!z.iso.date().safeParse(filters.to).success)reject("Revise el rango de fechas.");
  if(filters.from&&filters.to&&filters.to<filters.from)reject("La fecha final no puede ser anterior a la inicial.");
  if(filters.creatorId&&!uuid.safeParse(filters.creatorId).success)reject("Usuario inválido.");
}
export async function listQuotes(actor:Actor,clientId="",company="",principal="",segment="",filters:QuoteFilters={}){
  if(actor.role==="conductor")reject("Sin acceso a cotizaciones.");
  if(clientId && !uuid.safeParse(clientId).success)reject("Cliente inválido.");
  if(company && !["rerchar","e_y_j"].includes(company))reject("Empresa inválida.");
  if(principal&&!quotePrincipals.some(item=>item.value===principal))reject("Principal inválida.");
  if(segment&&!validQuoteSegment(principal,segment))reject("Segmentación inválida.");
  validateQuoteFilters(filters);
  return db.query<Quote>(`SELECT q.*,COALESCE((SELECT array_agg(DISTINCT l.segment) FILTER (WHERE l.segment IS NOT NULL)
    FROM client_quote_lines l WHERE l.quote_id=q.id),'{}'::text[]) AS segments
    FROM client_quotes q WHERE ($1::text='' OR q.client_id=NULLIF($1,'')::uuid)
    AND ($2::text<>'cliente' OR (q.client_id=$3::uuid AND q.status IN ('enviada','aceptada','rechazada')))
    AND ($4::text='' OR q.issuer=$4)
    AND ($5::text='' OR EXISTS (SELECT 1 FROM client_quote_lines l WHERE l.quote_id=q.id AND l.principal=$5 AND ($6::text='' OR l.segment=$6)))
    AND ($7::text='' OR q.issued_on>=NULLIF($7,'')::date) AND ($8::text='' OR q.issued_on<=NULLIF($8,'')::date)
    AND ($9::text='' OR q.created_by=NULLIF($9,'')::uuid)
    ORDER BY q.created_at DESC LIMIT 250`,[clientId,actor.role,actor.client_id,company,principal,segment,filters.from??"",filters.to??"",filters.creatorId??""]);
}
export type QuoteReportLine={folio:string;display_folio:string|null;issuer:keyof typeof issuers;client_name:string;title:string;
  status:string;issued_on:Date|string;principal:string|null;segment:string|null;description:string;quantity:string;
  unit:string;unit_price_clp:string;taxable:boolean;vat_rate:string;waste_category:string|null;destination_name:string|null;
  material_id:string|null;line_note:string|null;commercial_kind:string;tax_review_status:string;currency:"CLP"|"UF";unit_price_uf:string|null;uf_rate_clp:string|null;uf_rate_on:Date|string|null};
export async function reportQuoteLines(actor:Actor,company="",principal="",segment="",clientId="",filters:QuoteFilters={}){
  if(actor.role==="conductor")reject("Sin acceso a cotizaciones.");
  if(company&&!["rerchar","e_y_j"].includes(company))reject("Empresa inválida.");
  if(principal&&!quotePrincipals.some(group=>group.value===principal))reject("Principal inválida.");
  if(segment&&!validQuoteSegment(principal,segment))reject("Segmentación inválida.");
  if(clientId&&!uuid.safeParse(clientId).success)reject("Cliente inválido.");
  validateQuoteFilters(filters);
  const rows=await db.query<QuoteReportLine>(`SELECT q.folio,q.display_folio,q.issuer,q.client_name,q.title,q.status,q.issued_on,q.vat_rate,q.commercial_kind,q.tax_review_status,q.uf_rate_clp,q.uf_rate_on,
    l.principal,l.segment,l.description,l.quantity,l.unit,l.unit_price_clp,l.currency,l.unit_price_uf,l.taxable,l.waste_category,l.destination_name,l.material_id,l.line_note
    FROM client_quotes q JOIN client_quote_lines l ON l.quote_id=q.id
    WHERE ($1::text<>'cliente' OR (q.client_id=$2::uuid AND q.status IN ('enviada','aceptada','rechazada')))
    AND ($3::text='' OR q.issuer=$3) AND ($4::text='' OR l.principal=$4) AND ($5::text='' OR l.segment=$5)
    AND ($6::text='' OR q.client_id=NULLIF($6,'')::uuid)
    AND ($7::text='' OR q.issued_on>=NULLIF($7,'')::date) AND ($8::text='' OR q.issued_on<=NULLIF($8,'')::date)
    AND ($9::text='' OR q.created_by=NULLIF($9,'')::uuid)
    ORDER BY q.created_at DESC,l.position LIMIT 1001`,[actor.role,actor.client_id,company,principal,segment,clientId,filters.from??"",filters.to??"",filters.creatorId??""]);
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
    company_intro:optional(700),proposal_objective:optional(700),notes:optional(1000),issued_on:z.iso.date(),valid_until:z.iso.date(),vat_rate:z.union([z.literal(""),z.literal("0"),z.literal("0.19")]).default("0.19"),
    commercial_kind:z.enum(["general","compra_material"]).optional(),line:item.optional()}).parse(input);
  if(data.line){
    checkClassification(data.line,true);
    checkIssuerSegment(data.issuer,data.line.principal);
    if(data.line.currency==="UF")reject("Cree el borrador en CLP, registre el valor UF y después cambie el concepto a UF.");
    checkDestinationInput(data.line);
  }
  const kind=data.line?.principal==="compra"?"compra_material":data.commercial_kind??"general";
  if(data.line&&data.commercial_kind&&kind!==data.commercial_kind)reject("El tipo de cotización no coincide con el concepto.");
  if(data.issuer==="e_y_j"&&kind==="compra_material")reject("E y J no cotiza compras de material.");
  if(kind==="general"&&data.vat_rate==="")reject("Seleccione el tratamiento de IVA de la cotización.");
  if(data.valid_until<data.issued_on)reject("La vigencia no puede vencer antes de la fecha de emisión.");
  return transaction(async tx=>{
    const [client]=await tx.query<{name:string;tax_id:string|null;email:string|null;address:string|null}>("SELECT name,tax_id,email,address FROM clients WHERE id=$1 AND deleted_at IS NULL",[data.client_id]);
    if(!client)reject("Seleccione un cliente registrado.");
    const [existing]=await tx.query<{id:string;created_by:string}>("SELECT id,created_by FROM client_quotes WHERE submission_key=$1",[data.submission_key]);
    if(existing){if(existing.created_by!==actor.id)reject("La clave de cotización pertenece a otro usuario.");return existing.id;}
    const line=data.line?await purchaseLine(tx,data.line,kind,"pendiente"):null;
    const price=data.line?commercialPrice(data.line,null):null;
    const [quote]=await tx.query<{id:string;folio:string}>(`INSERT INTO client_quotes
      (submission_key,client_id,issuer,client_name,client_tax_id,client_email,client_address,title,company_intro,proposal_objective,notes,issued_on,valid_until,vat_rate,created_by,commercial_kind,tax_review_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),NULLIF($10,''),NULLIF($11,''),$12,$13,$14,$15,$16,$17) RETURNING id,folio`,
      [data.submission_key,data.client_id,data.issuer,client.name,client.tax_id,client.email,client.address,data.title,
       normalizeQuoteText(data.company_intro),normalizeQuoteText(data.proposal_objective),normalizeQuoteText(data.notes),
       data.issued_on,data.valid_until,kind==="compra_material"?"0":data.vat_rate,actor.id,kind,kind==="compra_material"?"pendiente":"no_aplica"]);
    const displayFolio=`COT-${data.issuer==="rerchar"?"RER":"EYJ"}-${String(quote.folio).padStart(5,"0")}`;
    await tx.query("UPDATE client_quotes SET display_folio=$2,route_required=$3 WHERE id=$1",
      [quote.id,displayFolio,Boolean(data.line&&["retiro","transporte","instalacion"].includes(data.line.principal))]);
    if(data.line&&line&&price){
      const destinationName=await destinationSnapshot(tx,data.line.destination_id);
      await tx.query(`INSERT INTO client_quote_lines(quote_id,position,description,quantity,unit,unit_price_clp,taxable,principal,segment,waste_category,destination_id,destination_name,destination_required,material_id,line_note,currency,unit_price_uf)
        VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),NULLIF($10,'')::uuid,$11,true,$12,NULLIF($13,''),$14,$15)`,
        [quote.id,line.name,data.line.quantity,data.line.unit,price.clp,line.taxable,data.line.principal,data.line.segment,
         data.line.waste_category,data.line.destination_id,destinationName,line.materialId,data.line.line_note,price.currency,price.uf]);
    }
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'create','client_quote',$2,$3)",
      [actor.id,quote.id,JSON.stringify({client_id:data.client_id,title:data.title,issuer:data.issuer})]);
    return quote.id;
  });
}
export async function updateQuotePresentation(actor:Actor,quoteId:string,input:unknown){
  canEdit(actor);const id=uuid.parse(quoteId);
  const data=z.object({company_intro:z.string().trim().max(700),proposal_objective:z.string().trim().max(700),
    notes:z.string().trim().max(1000).optional()}).parse(input);
  if(!data.company_intro||!data.proposal_objective)reject("Complete la presentación de la empresa y el objetivo de la propuesta.");
  await transaction(async tx=>{
    const [current]=await tx.query<{company_intro:string|null;proposal_objective:string|null;notes:string|null}>(
      "SELECT company_intro,proposal_objective,notes FROM client_quotes WHERE id=$1 AND status='borrador' FOR UPDATE",[id]);
    if(!current)reject("La presentación sólo puede corregirse mientras la cotización está en borrador.");
    const company_intro=normalizeQuoteText(data.company_intro).trim();
    const proposal_objective=normalizeQuoteText(data.proposal_objective).trim();
    const notes=data.notes===undefined?current.notes??"":normalizeQuoteText(data.notes).trim();
    if(current.company_intro===company_intro&&current.proposal_objective===proposal_objective&&(current.notes??"")===notes)return;
    await tx.query("UPDATE client_quotes SET company_intro=$2,proposal_objective=$3,notes=NULLIF($4,'') WHERE id=$1",
      [id,company_intro,proposal_objective,notes]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES($1,'update_presentation','client_quote',$2,$3,$4)`,[actor.id,id,JSON.stringify(current),
        JSON.stringify({company_intro,proposal_objective,notes})]);
  });
}
export async function addQuoteLine(actor:Actor,quoteId:string,input:unknown){
  canEdit(actor);const id=uuid.parse(quoteId),data=item.parse(input);
  checkClassification(data,true);
  checkDestinationInput(data);
  return transaction(async tx=>{
    const [quote]=await tx.query<Pick<Quote,"status"|"commercial_kind"|"tax_review_status"|"issuer"|"uf_rate_clp">>("SELECT status,commercial_kind,tax_review_status,issuer,uf_rate_clp FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||quote.status!=="borrador")reject("Sólo el borrador admite nuevos conceptos.");
    checkIssuerSegment(quote.issuer,data.principal);
    const [count]=await tx.query<{count:string}>("SELECT count(*)::text AS count FROM client_quote_lines WHERE quote_id=$1",[id]);
    if(Number(count.count)>=100)reject("Esta cotización alcanzó 100 conceptos.");
    const [position]=await tx.query<{next:number}>("SELECT COALESCE(max(position),0)+1 AS next FROM client_quote_lines WHERE quote_id=$1",[id]);
    const destinationName=await destinationSnapshot(tx,data.destination_id);
    const purchase=await purchaseLine(tx,data,quote.commercial_kind,quote.tax_review_status);
    const price=commercialPrice(data,quote.uf_rate_clp);
    const [line]=await tx.query<{id:string}>(`INSERT INTO client_quote_lines(quote_id,position,description,quantity,unit,unit_price_clp,taxable,principal,segment,waste_category,destination_id,destination_name,destination_required,material_id,line_note,currency,unit_price_uf)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),NULLIF($11,'')::uuid,$12,true,$13,NULLIF($14,''),$15,$16) RETURNING id`,
      [id,position.next,purchase.name,data.quantity,data.unit,price.clp,purchase.taxable,data.principal,data.segment,
       data.waste_category,data.destination_id,destinationName,purchase.materialId,data.line_note,price.currency,price.uf]);
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
    const [quote]=await tx.query<Pick<Quote,"status"|"commercial_kind"|"tax_review_status"|"issuer"|"uf_rate_clp">>("SELECT status,commercial_kind,tax_review_status,issuer,uf_rate_clp FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(quote?.status!=="borrador")reject("Sólo se pueden corregir conceptos de un borrador.");
    checkIssuerSegment(quote.issuer,data.principal);
    const [previous]=await tx.query<QuoteLine>("SELECT * FROM client_quote_lines WHERE id=$1 AND quote_id=$2",[line,id]);
    if(!previous)reject("El concepto no pertenece a esta cotización.");
    checkClassification(data,Boolean(previous.principal));
    const destinationName=await destinationSnapshot(tx,data.destination_id);
    const purchase=await purchaseLine(tx,data,quote.commercial_kind,quote.tax_review_status);
    const price=commercialPrice(data,quote.uf_rate_clp);
    await tx.query(`UPDATE client_quote_lines SET description=$3,quantity=$4,unit=$5,unit_price_clp=$6,taxable=$7,
      principal=NULLIF($8,''),segment=NULLIF($9,''),waste_category=NULLIF($10,''),destination_id=NULLIF($11,'')::uuid,destination_name=$12,
      destination_required=destination_required OR NULLIF($11,'') IS NOT NULL,material_id=$13,line_note=NULLIF($14,''),currency=$15,unit_price_uf=$16
      WHERE id=$1 AND quote_id=$2`,
      [line,id,purchase.name,data.quantity,data.unit,price.clp,purchase.taxable,data.principal,data.segment,
       data.waste_category,data.destination_id,destinationName,purchase.materialId,data.line_note,price.currency,price.uf]);
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
  if(actor.role==="conductor")reject("Sin permiso para responder cotizaciones.");
  const id=uuid.parse(quoteId);
  if(!["aceptada","rechazada"].includes(decision))reject("Decisión inválida.");
  await transaction(async tx=>{
    const [quote]=await tx.query<{status:string;client_id:string}>("SELECT status,client_id FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
    if(!quote||quote.status!=="enviada")reject("Registre el envío antes de actualizar la respuesta del cliente.");
    if(actor.role==="cliente"&&actor.client_id!==quote.client_id)reject("Esta cotización no corresponde a su empresa.");
    await tx.query("UPDATE client_quotes SET status=$2 WHERE id=$1",[id,decision]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,$2,'client_quote',$3,$4)",
      [actor.id,decision,id,JSON.stringify({status:decision,source:actor.role==="cliente"?"portal_cliente":"registro_interno"})]);
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
    if(outcome==="borrador")await tx.query("DELETE FROM quote_response_tokens WHERE quote_id=$1",[id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'resolve_send','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify({outcome,reason:note})]);
  });
}

export function quoteMailConfigured(){return Boolean(process.env.SMTP_HOST&&process.env.SMTP_PORT&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&process.env.SMTP_FROM);}
function responseTokenHash(token:string){return createHash("sha256").update(token).digest("hex");}
function quoteResponseBaseUrl(){
  const configured=process.env.APP_BASE_URL?.trim();
  const hostname=configured&&!(process.env.VERCEL&&/^http:\/\/localhost(?::\d+)?\/?$/.test(configured))?configured:
    process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:"";
  try{const url=new URL(hostname);if(!["https:","http:"].includes(url.protocol)||process.env.VERCEL&&url.protocol!=="https:")throw Error();return url.origin;}
  catch{reject("Configure APP_BASE_URL con el dominio público HTTPS para incluir la respuesta del cliente.");}
}
export async function getEmailQuoteResponse(token:string){
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  const [row]=await db.query<{quote_id:string;recipient:string;expires_at:Date|string;used_at:Date|string|null;status:string;
    client_name:string;title:string;issuer:Quote["issuer"];folio:string;display_folio:string|null}>(`SELECT t.quote_id,t.recipient,t.expires_at,t.used_at,q.status,q.client_name,q.title,q.issuer,q.folio,q.display_folio
    FROM quote_response_tokens t JOIN client_quotes q ON q.id=t.quote_id WHERE t.token_hash=$1`,[responseTokenHash(token)]);
  return row??null;
}
export async function respondToQuoteEmail(token:string,decision:"aceptada"|"rechazada"){
  if(!/^[a-f0-9]{64}$/.test(token)||!["aceptada","rechazada"].includes(decision))reject("Enlace o respuesta inválida.");
  const result=await transaction(async tx=>{
    const [link]=await tx.query<{quote_id:string;recipient:string;issued_by:string;expires_at:Date|string;used_at:Date|string|null}>(
      "SELECT quote_id,recipient,issued_by,expires_at,used_at FROM quote_response_tokens WHERE token_hash=$1 FOR UPDATE",[responseTokenHash(token)]);
    if(!link||link.used_at||new Date(link.expires_at).getTime()<=Date.now())reject("El enlace ya se utilizó o venció. Contacte al emisor.");
    const [quote]=await tx.query<{status:string;issuer:Quote["issuer"];folio:string;display_folio:string|null}>(
      "SELECT status,issuer,folio,display_folio FROM client_quotes WHERE id=$1 FOR UPDATE",[link.quote_id]);
    if(!quote||quote.status!=="enviada")reject("Esta cotización ya no admite una respuesta por correo.");
    await tx.query("UPDATE client_quotes SET status=$2 WHERE id=$1",[link.quote_id,decision]);
    await tx.query("UPDATE quote_response_tokens SET used_at=now() WHERE quote_id=$1",[link.quote_id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,$2,'client_quote',$3,$4)",
      [link.issued_by,decision,link.quote_id,JSON.stringify({status:decision,source:"enlace_correo",recipient:link.recipient,
        identity:"posesion_enlace",issued_by:link.issued_by})]);
    return {recipient:link.recipient,folio:quoteFolio(quote),issuer:quote.issuer};
  });
  if(!quoteMailConfigured())return {ackSent:false};
  try{
    const port=Number(process.env.SMTP_PORT);
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,
      auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}});
    await transport.sendMail({from:process.env.SMTP_FROM,to:result.recipient,
      subject:`Respuesta registrada · Cotización ${result.folio}`,
      text:`Su respuesta (${decision}) a la cotización ${result.folio} de ${issuers[result.issuer].name} quedó registrada. Si necesita corregirla, comuníquese con la empresa emisora.`});
    return {ackSent:true};
  }catch(error){console.error("Acuse de cotización pendiente",error);return {ackSent:false};}
}
export function quoteDefaultCc(issuer:Quote["issuer"]){
  return issuer==="e_y_j"?process.env.QUOTE_CC_E_Y_J??"":process.env.QUOTE_CC_RERCHAR??"";
}
export function quoteCcAddresses(input:string){
  const addresses=[...new Set(input.split(/[;,\n]+/).map(value=>value.trim()).filter(Boolean))];
  if(addresses.length>10||addresses.some(address=>!z.email().safeParse(address).success))
    reject("Indique hasta diez correos válidos, separados por coma o punto y coma.");
  return addresses;
}
export async function sendQuote(actor:Actor,quoteId:string,ccInput=""){
  canEdit(actor);
  if(!quoteMailConfigured())reject("Configure el correo remitente SMTP del sistema antes de enviar cotizaciones.");
  const baseUrl=quoteResponseBaseUrl();
  const id=uuid.parse(quoteId);
  const {quote,lines,route}=await getQuote(actor,id);
  if(quote.status!=="borrador")reject("Esta cotización ya no está en borrador.");
  if(!quote.client_email||!z.email().safeParse(quote.client_email).success)reject("Complete el correo del cliente y cree una nueva cotización para guardar sus datos de emisión.");
  const cc=quoteCcAddresses(ccInput);
  const issues=await quoteDeliveryIssues(quote,lines);
  if(issues.length)reject(`Antes de enviar: ${issues[0]}`);
  const pdf=await renderQuotePdf(quote,lines,"",route);
  const [claimed]=await db.query<{id:string}>("UPDATE client_quotes SET status='enviando' WHERE id=$1 AND status='borrador' RETURNING id",[id]);
  if(!claimed)reject("La cotización cambió de estado. Recargue la pantalla.");
  const token=randomBytes(32).toString("hex");
  try{
    await db.query(`INSERT INTO quote_response_tokens(quote_id,token_hash,recipient,issued_by,expires_at)
      VALUES($1,$2,$3,$4,LEAST(($5::date+1)::timestamptz,now()+interval '14 days'))
      ON CONFLICT(quote_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,recipient=EXCLUDED.recipient,
        issued_by=EXCLUDED.issued_by,expires_at=EXCLUDED.expires_at,used_at=NULL,created_at=now()`,
      [id,responseTokenHash(token),quote.client_email,actor.id,quote.valid_until]);
    const port=Number(process.env.SMTP_PORT);
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Puerto SMTP inválido.");
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,
      auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}});
    await transport.sendMail({from:process.env.SMTP_FROM,to:quote.client_email,cc:cc.length?cc:undefined,
      subject:`Cotización ${quoteFolio(quote)} · ${issuers[quote.issuer].name}`,
      text:`Estimada empresa ${quote.client_name}:\n\nAdjuntamos la cotización ${quoteFolio(quote)} por ${quote.title}.\n\nPara aceptarla o rechazarla, responda desde este enlace antes de su vencimiento:\n${baseUrl}/cotizaciones/responder/${token}\n\nEl enlace es personal: cualquier persona que lo posea puede registrar una sola respuesta.\n\nSaludos cordiales,\n${issuers[quote.issuer].name}`,
      attachments:[{filename:`cotizacion-${quoteFolio(quote).toLowerCase()}.pdf`,content:Buffer.from(pdf),contentType:"application/pdf"}]});
  }catch(error){
    console.error("Fallo de envío de cotización",error);
    // El servidor SMTP podría haber aceptado el mensaje antes de cortar la conexión: evite un segundo envío automático.
    throw new QuoteError("No se pudo confirmar el envío. Revise el correo saliente antes de reintentar; la cotización queda en estado de verificación.");
  }
  await transaction(async tx=>{
    await tx.query("UPDATE client_quotes SET status='enviada',sent_at=now() WHERE id=$1 AND status='enviando'",[id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES ($1,'send','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify({recipient:quote.client_email,cc,folio:quote.folio})]);
  });
}
