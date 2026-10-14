import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db,transaction} from "./db";
import {wasteCategories,facilityTypes,disposalUnits} from "./destination-catalog";

const uuid=z.uuid();
const optional=(limit:number)=>z.string().trim().max(limit).default("");
const coordinate=(min:number,max:number)=>z.string().trim().refine(value=>value===""||(/^-?\d+(?:\.\d{1,6})?$/.test(value)&&Number(value)>=min&&Number(value)<=max),"Coordenada inválida.");
const category=z.enum(wasteCategories.map(item=>item.value) as [typeof wasteCategories[number]["value"],...typeof wasteCategories[number]["value"][]]);
const facility=z.enum(facilityTypes.map(item=>item.value) as [typeof facilityTypes[number]["value"],...typeof facilityTypes[number]["value"][]]);
const unit=z.enum(disposalUnits.map(item=>item.value) as [typeof disposalUnits[number]["value"],...typeof disposalUnits[number]["value"][]]);
const base=z.object({name:z.string().trim().min(3).max(180),facility_type:facility,address:optional(250),commune:optional(100),
  latitude:coordinate(-90,90),longitude:coordinate(-180,180),location_url:optional(500)});
const updateSchema=base.extend({status:z.enum(["pendiente","habilitado","suspendido"]),accepted_categories:z.array(category).max(6),
  authorization_reference:optional(180),authorization_valid_until:z.union([z.iso.date(),z.literal("")]),
  disposal_unit:z.union([unit,z.literal("")]),
  disposal_price_clp:z.string().trim().refine(value=>value===""||(/^\d+(?:\.\d{1,2})?$/.test(value)&&Number(value)<=100_000_000),"Tarifa inválida.")});

export class DestinationError extends Error {}
const reject=(message:string):never=>{throw new DestinationError(message);};
export type QuoteDestination={id:string;name:string;facility_type:string;address:string|null;commune:string|null;
  latitude:string|null;longitude:string|null;location_url:string|null;status:"pendiente"|"habilitado"|"suspendido";
  accepted_categories:string[];authorization_reference:string|null;authorization_valid_until:Date|string|null;
  authorization_document_name:string|null;disposal_unit:string|null;disposal_price_clp:string|null;updated_at:Date|string};

function checkLink(url:string){
  if(!url)return;
  try{if(!["http:","https:"].includes(new URL(url).protocol))throw Error();}catch{reject("El enlace de ubicación debe usar http o https.");}
}
async function support(file?:File){
  if(!file||!file.size)return null;
  if(file.size>4*1024*1024)reject("El respaldo debe pesar hasta 4 MB.");
  const bytes=Buffer.from(await file.arrayBuffer());
  const mime=bytes.subarray(0,4).toString()==="%PDF"?"application/pdf":
    bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":
    bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":null;
  if(!mime)reject("Adjunte PDF, PNG o JPG válido.");
  return {bytes,mime,name:file.name.trim().replace(/[\r\n\\/]/g,"_").slice(0,160)||"respaldo"};
}
function clean(data:z.infer<typeof base>){
  checkLink(data.location_url);
  if(Boolean(data.latitude)!==Boolean(data.longitude))reject("Registre ambas coordenadas o deje ambas vacías.");
  return [data.name,data.facility_type,data.address||null,data.commune||null,data.latitude||null,data.longitude||null,data.location_url||null];
}
export async function listQuoteDestinations(actor:Actor){
  if(!canManage(actor))reject("No tiene acceso al maestro de destinos.");
  return db.query<QuoteDestination>(`SELECT id,name,facility_type,address,commune,latitude,longitude,location_url,status,
    accepted_categories,authorization_reference,authorization_valid_until,authorization_document_name,
    disposal_unit,disposal_price_clp,updated_at FROM quote_destinations ORDER BY name`);
}
export async function createQuoteDestination(actor:Actor,input:unknown){
  if(!canManage(actor))reject("No tiene permiso para agregar destinos.");
  const data=base.parse(input),fields=clean(data);
  return transaction(async tx=>{
    const [existing]=await tx.query<{id:string}>("SELECT id FROM quote_destinations WHERE lower(name)=lower($1)",[data.name]);
    if(existing)reject("Ya existe un destino con ese nombre.");
    const [created]=await tx.query<{id:string}>(`INSERT INTO quote_destinations(name,facility_type,address,commune,latitude,longitude,location_url,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[...fields,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'create','quote_destination',$2,$3)",
      [actor.id,created.id,JSON.stringify({name:data.name,status:"pendiente"})]);
    return created.id;
  });
}
export async function updateQuoteDestination(actor:Actor,id:string,input:unknown,file?:File){
  if(!canManage(actor))reject("No tiene permiso para configurar destinos.");
  uuid.parse(id);
  const data=updateSchema.parse(input),fields=clean(data),document=await support(file);
  const accepted=[...new Set(data.accepted_categories)];
  await transaction(async tx=>{
    const [previous]=await tx.query<QuoteDestination>(`SELECT id,name,facility_type,address,commune,latitude,longitude,location_url,status,
      accepted_categories,authorization_reference,authorization_valid_until,authorization_document_name,disposal_unit,disposal_price_clp,updated_at
      FROM quote_destinations WHERE id=$1 FOR UPDATE`,[id]);
    if(!previous)reject("Destino inexistente.");
    if(data.status==="habilitado"){
      if(!accepted.length||!data.authorization_reference||!data.authorization_valid_until||!data.disposal_unit||data.disposal_price_clp===""||!(document||previous.authorization_document_name))
        reject("Para habilitar, registre residuos admitidos, autorización, vigencia, tarifa y archivo de respaldo.");
      const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      if(data.authorization_valid_until<today)reject("La autorización del gestor ya venció.");
    }
    const [duplicate]=await tx.query<{id:string}>("SELECT id FROM quote_destinations WHERE lower(name)=lower($1) AND id<>$2",[data.name,id]);
    if(duplicate)reject("Ya existe un destino con ese nombre.");
    await tx.query(`UPDATE quote_destinations SET name=$2,facility_type=$3,address=$4,commune=$5,latitude=$6,longitude=$7,
      location_url=$8,status=$9,accepted_categories=$10,authorization_reference=$11,authorization_valid_until=$12,
      disposal_unit=$13,disposal_price_clp=$14,authorization_document=COALESCE($15,authorization_document),
      authorization_document_name=COALESCE($16,authorization_document_name),
      authorization_document_mime=COALESCE($17,authorization_document_mime),updated_by=$18,updated_at=now() WHERE id=$1`,
      [id,...fields,data.status,accepted,data.authorization_reference||null,data.authorization_valid_until||null,
       data.disposal_unit||null,data.disposal_price_clp||null,document?.bytes??null,document?.name??null,document?.mime??null,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES($1,'update','quote_destination',$2,$3,$4)",
      [actor.id,id,JSON.stringify(previous),JSON.stringify({name:data.name,status:data.status,accepted_categories:accepted,
        authorization_valid_until:data.authorization_valid_until,authorization_reference:data.authorization_reference,
        disposal_unit:data.disposal_unit,disposal_price_clp:data.disposal_price_clp,document_name:document?.name??previous.authorization_document_name})]);
  });
}
export async function getQuoteDestinationSupport(actor:Actor,id:string){
  if(!canManage(actor)||!uuid.safeParse(id).success)return null;
  const [row]=await db.query<{authorization_document_name:string|null;authorization_document_mime:string|null;authorization_document:Uint8Array|null}>(
    "SELECT authorization_document_name,authorization_document_mime,authorization_document FROM quote_destinations WHERE id=$1",[id]);
  if(!row?.authorization_document)return null;
  return {name:row.authorization_document_name??"respaldo",mime:row.authorization_document_mime??"application/octet-stream",bytes:Buffer.from(row.authorization_document)};
}
