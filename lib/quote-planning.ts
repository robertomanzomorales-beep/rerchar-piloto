import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction,type Db} from "./db";

const uuid=z.uuid();
const location=z.string().trim().min(5).max(250);
const places=z.object({origin:location,pickup:location,destination:location,return_to:location});
const twoDecimals=(value:number)=>Math.abs(Math.round(value*100)-value*100)<0.000001;
const distance=z.union([z.string(),z.number()]).transform(Number).pipe(z.number().finite().min(0).max(100000).refine(twoDecimals));
const manual=places.extend({pickup_km:distance,destination_km:distance,return_km:distance,
  reviewed_for_truck:z.boolean(),correction_reason:z.string().trim().min(5).max(500)});
const nonnegative=(max=100_000_000)=>z.union([z.string(),z.number()]).transform(Number).pipe(z.number().finite().min(0).max(max).refine(twoDecimals));
const costingSchema=z.object({trips:z.coerce.number().int().min(1).max(10000),asset_id:z.union([uuid,z.literal("")]),
  equipment:z.string().trim().max(120),capacity:nonnegative(100000),capacity_unit:z.enum(["tonelada","m³"]),
  km_per_liter:nonnegative(1000),fuel_price_clp:nonnegative(),equipment_cost_clp:nonnegative(),tolls_clp:nonnegative(),
  driver_hours:nonnegative(10000),driver_hour_clp:nonnegative(),support_hours:nonnegative(10000),support_hour_clp:nonnegative(),
  per_diem_clp:nonnegative(),loading_clp:nonnegative(),disposal_quantity:nonnegative(100000),disposal_unit:z.enum(["tonelada","m³"]),
  disposal_unit_clp:nonnegative(),stay_clp:nonnegative(),other_clp:nonnegative(),contingency_pct:nonnegative(100),margin_pct:nonnegative(90)});

export class QuotePlanningError extends Error {}
function reject(message:string):never{throw new QuotePlanningError(message);}
function staff(actor:Actor){if(!canManage(actor))reject("Sólo administración y operaciones pueden ver rutas y costos internos.");}
function validateCircuit(input:z.infer<typeof places>){
  if(input.origin.toLocaleLowerCase("es-CL")!==input.return_to.toLocaleLowerCase("es-CL"))
    reject("El retorno debe ser la misma planta de origen. Use la misma dirección completa.");
}
export function routeLink(input:z.infer<typeof places>){
  const params=new URLSearchParams({api:"1",origin:input.origin,destination:input.return_to,
    waypoints:`${input.pickup}|${input.destination}`,travelmode:"driving"});
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
export function circuitKm(legs:[number,number,number]){
  if(legs.some(km=>!Number.isFinite(km)||km<0||km>100000))reject("Revise los kilómetros de cada tramo.");
  const total=Math.round(legs.reduce((sum,km)=>sum+Math.round(km*100)/100,0)*100)/100;
  if(total<=0||total>100000)reject("El circuito debe tener un total positivo de hasta 100.000 km.");
  return total;
}
export type QuoteRoute={quote_id:string;origin:string;pickup:string;destination:string;return_to:string;
  pickup_km:string;destination_km:string;return_km:string;total_km:string;source:"manual"|"mapa";
  reviewed_for_truck:boolean;correction_reason:string|null;route_url:string;calculated_at:Date|string;updated_at:Date|string};
export type QuoteCosting={quote_id:string;updated_at:Date|string;asset_id:string|null}&{
  [K in Exclude<keyof z.infer<typeof costingSchema>,"asset_id">]:string};
const fields=["trips","asset_id","equipment","capacity","capacity_unit","km_per_liter","fuel_price_clp","equipment_cost_clp",
  "tolls_clp","driver_hours","driver_hour_clp","support_hours","support_hour_clp","per_diem_clp","loading_clp",
  "disposal_quantity","disposal_unit","disposal_unit_clp","stay_clp","other_clp","contingency_pct","margin_pct"] as const;
const rateFields=["km_per_liter","fuel_price_clp","equipment_cost_clp","driver_hour_clp","support_hour_clp",
  "disposal_unit_clp","contingency_pct","margin_pct"] as const;
const rateSchema=costingSchema.pick(Object.fromEntries(rateFields.map(key=>[key,true])) as Record<typeof rateFields[number],true>);
export type QuoteCostRates=Partial<Record<typeof rateFields[number],number>>;
export async function getQuoteCostRates(actor:Actor,issuer:"rerchar"|"e_y_j"){
  staff(actor);
  const [row]=await db.query<{values_json:QuoteCostRates;version:number;updated_at:Date|string}>(
    "SELECT values_json,version,updated_at FROM quote_cost_rates WHERE issuer=$1",[issuer]);
  return row??null;
}
export async function saveQuoteCostRates(actor:Actor,quoteId:string,input:unknown){
  if(actor.role!=="admin")reject("Sólo administración puede actualizar los costos compartidos.");
  const id=uuid.parse(quoteId);
  const data=z.object({expected_version:z.coerce.number().int().min(0),rates:rateSchema}).parse(input);
  if(Object.values(data.rates).every(value=>value===0))reject("Ingrese al menos un valor real antes de guardar tarifas compartidas.");
  return transaction(async tx=>{
    const [quote]=await tx.query<{issuer:"rerchar"|"e_y_j"}>("SELECT issuer FROM client_quotes WHERE id=$1",[id]);
    if(!quote)reject("Cotización no encontrada.");
    const [current]=await tx.query<{values_json:QuoteCostRates;version:number}>(
      "SELECT values_json,version FROM quote_cost_rates WHERE issuer=$1 FOR UPDATE",[quote.issuer]);
    if(Number(current?.version??0)!==data.expected_version)reject("Los costos compartidos cambiaron. Actualice la página antes de volver a guardar.");
    if(current)await tx.query("UPDATE quote_cost_rates SET values_json=$2::jsonb,version=version+1,updated_by=$3,updated_at=now() WHERE issuer=$1",
      [quote.issuer,JSON.stringify(data.rates),actor.id]);
    else await tx.query("INSERT INTO quote_cost_rates(issuer,values_json,updated_by) VALUES($1,$2::jsonb,$3)",
      [quote.issuer,JSON.stringify(data.rates),actor.id]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES($1,'update_rates','client_quote',$2,$3,$4)`,[actor.id,id,JSON.stringify(current??{}),
      JSON.stringify({issuer:quote.issuer,version:data.expected_version+1,rates:data.rates})]);
  });
}

export function calculateQuoteCost(input:z.infer<typeof costingSchema>|QuoteCosting,km:number,vatRate:number){
  const n=(key:keyof z.infer<typeof costingSchema>)=>Number(input[key]);
  if(!Number.isFinite(km)||km<0||!Number.isFinite(vatRate)||vatRate<0||vatRate>1)reject("Ruta o IVA inválidos.");
  if(km>0&&n("fuel_price_clp")>0&&n("km_per_liter")<=0)reject("Indique rendimiento del vehículo en km/L para calcular combustible.");
  const fuel=Math.round((n("km_per_liter")>0?km*n("trips")/n("km_per_liter")*n("fuel_price_clp"):0));
  const perTrip=n("equipment_cost_clp")+n("tolls_clp")+n("driver_hours")*n("driver_hour_clp")+
    n("support_hours")*n("support_hour_clp")+n("per_diem_clp")+n("loading_clp")+
    n("disposal_quantity")*n("disposal_unit_clp")+n("stay_clp")+n("other_clp");
  const direct=Math.round(fuel+perTrip*n("trips"));
  const contingency=Math.round(direct*n("contingency_pct")/100);
  const cost=direct+contingency;
  const net=Math.ceil(cost/(1-n("margin_pct")/100));
  if(!Number.isSafeInteger(net)||net>1_000_000_000_000)reject("El cálculo supera el límite permitido.");
  const vat=Math.round(net*vatRate);
  return {fuel,direct,contingency,cost,net,vat,total:net+vat,
    difference:net-cost};
}

export async function getQuotePlanning(actor:Actor,quoteId:string){
  staff(actor);uuid.parse(quoteId);
  const [route]=await db.query<QuoteRoute>("SELECT * FROM client_quote_routes WHERE quote_id=$1",[quoteId]);
  const [cost]=await db.query<QuoteCosting>("SELECT * FROM client_quote_costings WHERE quote_id=$1",[quoteId]);
  return {route:route??null,cost:cost??null};
}
export async function listPlanningAssets(actor:Actor){
  staff(actor);
  return db.query<{id:string;code:string;label:string;kind:string}>("SELECT id,code,label,kind FROM assets WHERE deleted_at IS NULL ORDER BY code");
}
async function draft(tx:Db,id:string){
  const [quote]=await tx.query<{status:string;vat_rate:string}>("SELECT status,vat_rate FROM client_quotes WHERE id=$1 FOR UPDATE",[id]);
  if(quote?.status!=="borrador")reject("Sólo se puede planificar una cotización en borrador.");
  return quote;
}
async function upsertRoute(tx:Db,actor:Actor,id:string,input:z.infer<typeof places>,legs:[number,number,number],source:"manual"|"mapa",reason:string|null,reviewed:boolean){
  const rounded=legs.map(km=>Math.round(km*100)/100) as [number,number,number];
  const total=circuitKm(rounded);
  await tx.query(`INSERT INTO client_quote_routes(quote_id,origin,pickup,destination,return_to,pickup_km,destination_km,return_km,total_km,
    source,reviewed_for_truck,correction_reason,route_url,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT(quote_id) DO UPDATE SET origin=EXCLUDED.origin,pickup=EXCLUDED.pickup,destination=EXCLUDED.destination,
    return_to=EXCLUDED.return_to,pickup_km=EXCLUDED.pickup_km,destination_km=EXCLUDED.destination_km,return_km=EXCLUDED.return_km,
    total_km=EXCLUDED.total_km,source=EXCLUDED.source,reviewed_for_truck=EXCLUDED.reviewed_for_truck,
    correction_reason=EXCLUDED.correction_reason,route_url=EXCLUDED.route_url,calculated_at=now(),updated_by=EXCLUDED.updated_by,updated_at=now()`,
    [id,input.origin,input.pickup,input.destination,input.return_to,...rounded,total,source,reviewed,reason,routeLink(input),actor.id]);
  await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'route','client_quote',$2,$3)",
    [actor.id,id,JSON.stringify({source,total_km:total,reviewed_for_truck:reviewed,reason})]);
  return total;
}
export async function saveQuoteRoute(actor:Actor,quoteId:string,input:unknown){
  staff(actor);const id=uuid.parse(quoteId),data=manual.parse(input);validateCircuit(data);
  if(!data.reviewed_for_truck)reject("Confirme que revisó el trayecto y las restricciones del vehículo.");
  return transaction(async tx=>{await draft(tx,id);return upsertRoute(tx,actor,id,data,
    [data.pickup_km,data.destination_km,data.return_km],"manual",data.correction_reason,true);});
}
export function mapsConfigured(){return Boolean(process.env.GOOGLE_MAPS_ROUTES_API_KEY);}
export async function calculateMapRoute(actor:Actor,quoteId:string,input:unknown){
  staff(actor);const id=uuid.parse(quoteId),data=places.parse(input);validateCircuit(data);
  const key=process.env.GOOGLE_MAPS_ROUTES_API_KEY;
  if(!key)reject("Falta configurar GOOGLE_MAPS_ROUTES_API_KEY. Registre los kilómetros manualmente mientras tanto.");
  const [before]=await db.query<{status:string}>("SELECT status FROM client_quotes WHERE id=$1",[id]);
  if(before?.status!=="borrador")reject("Sólo se puede planificar una cotización en borrador.");
  let response:Response;
  try{response=await fetch("https://routes.googleapis.com/directions/v2:computeRoutes",{
    method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":"routes.legs.distanceMeters"},
    body:JSON.stringify({origin:{address:data.origin},intermediates:[{address:data.pickup},{address:data.destination}],
      destination:{address:data.return_to},travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE",languageCode:"es-CL",units:"METRIC"}),
    signal:AbortSignal.timeout(12000),cache:"no-store"});}
  catch{reject("El servicio de mapas no respondió. Puede registrar la ruta manualmente.");}
  if(!response.ok)reject("No se pudo calcular la ruta con mapas. Revise las direcciones o registre los tramos manualmente.");
  const result=await response.json() as {routes?:{legs?:{distanceMeters?:number}[]}[]};
  const legs=result.routes?.[0]?.legs;
  if(legs?.length!==3||legs.some(leg=>!Number.isFinite(leg.distanceMeters)||Number(leg.distanceMeters)<0))
    reject("Mapas no entregó los tres tramos esperados. Registre los kilómetros manualmente.");
  const kilometers=legs.map(leg=>Math.round(Number(leg.distanceMeters)/10)/100) as [number,number,number];
  return transaction(async tx=>{await draft(tx,id);return upsertRoute(tx,actor,id,data,kilometers,"mapa",null,false);});
}
export async function saveQuoteCosting(actor:Actor,quoteId:string,input:unknown){
  staff(actor);const id=uuid.parse(quoteId),data=costingSchema.parse(input);
  return transaction(async tx=>{
    const quote=await draft(tx,id);
    if(data.asset_id){const [asset]=await tx.query<{id:string}>("SELECT id FROM assets WHERE id=$1 AND deleted_at IS NULL",[data.asset_id]);if(!asset)reject("Seleccione un vehículo o equipo vigente.");}
    const [route]=await tx.query<{total_km:string}>("SELECT total_km FROM client_quote_routes WHERE quote_id=$1",[id]);
    const result=calculateQuoteCost(data,Number(route?.total_km??0),Number(quote.vat_rate));
    const values=fields.map(field=>field==="asset_id"?data.asset_id||null:data[field]);
    await tx.query(`INSERT INTO client_quote_costings(quote_id,${fields.join(",")},updated_by) VALUES($1,${fields.map((_,i)=>`$${i+2}`).join(",")},$${fields.length+2})
      ON CONFLICT(quote_id) DO UPDATE SET ${fields.map(field=>`${field}=EXCLUDED.${field}`).join(",")},updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [id,...values,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'costing','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify({cost:result.cost,suggested_net:result.net})]);
    return result;
  });
}
export async function applySuggestedQuotePrice(actor:Actor,quoteId:string){
  staff(actor);const id=uuid.parse(quoteId);
  return transaction(async tx=>{
    const quote=await draft(tx,id);
    const [route]=await tx.query<{total_km:string;reviewed_for_truck:boolean}>("SELECT total_km,reviewed_for_truck FROM client_quote_routes WHERE quote_id=$1",[id]);
    if(!route?.reviewed_for_truck)reject("Revise y confirme la ruta antes de aplicar el precio.");
    const [cost]=await tx.query<QuoteCosting>("SELECT * FROM client_quote_costings WHERE quote_id=$1",[id]);
    if(!cost)reject("Guarde primero el cálculo interno.");
    const lines=await tx.query<{id:string;quantity:string;taxable:boolean;currency:string}>("SELECT id,quantity,taxable,currency FROM client_quote_lines WHERE quote_id=$1 ORDER BY position",[id]);
    if(lines.length!==1||Number(lines[0].quantity)!==1||!lines[0].taxable)
      reject("El precio sugerido se aplica sólo a una cotización de un concepto, cantidad 1 y afecto a IVA. En otras cotizaciones ajuste los conceptos manualmente.");
    if(lines[0].currency==="UF")reject("El precio interno está en CLP. Defina manualmente el precio de venta en UF del concepto.");
    const result=calculateQuoteCost(cost,Number(route.total_km),Number(quote.vat_rate));
    if(result.net<=0)reject("Ingrese los costos de la operación antes de aplicar el precio.");
    await tx.query("UPDATE client_quote_lines SET unit_price_clp=$2 WHERE id=$1",[lines[0].id,result.net]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'apply_cost_price','client_quote',$2,$3)",
      [actor.id,id,JSON.stringify({line_id:lines[0].id,unit_price_clp:result.net})]);
  });
}
