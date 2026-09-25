import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {transaction,type Db} from "./db";

const uuid=z.uuid();
const name=z.string().trim().min(2).max(180);
const optional=(limit:number)=>z.string().trim().max(limit).default("");

export class MastersError extends Error {}
function reject(message:string):never{throw new MastersError(message);}

async function authorize(tx:Db,actor:Actor){
  if(!canManage(actor))reject("Su perfil no puede modificar maestros.");
  const [user]=await tx.query<{id:string}>(
    "SELECT id FROM users WHERE id=$1 AND role IN ('admin','operaciones') AND active=true FOR SHARE",[actor.id]);
  if(!user)reject("Su acceso para modificar maestros ya no está activo.");
}

async function audit(tx:Db,actor:Actor,entityType:string,id:string,previous:object,next:object){
  await tx.query(`INSERT INTO audit_events (actor_id,action,entity_type,entity_id,previous_value,next_value)
    VALUES ($1,'update',$2,$3,$4,$5)`,[actor.id,entityType,id,JSON.stringify(previous),JSON.stringify(next)]);
}

export async function updateClient(actor:Actor,id:string,input:unknown){
  uuid.parse(id);
  const data=z.object({name,tax_id:optional(20),contact_name:optional(120),email:z.union([z.email(),z.literal("")]).default(""),address:optional(250)}).parse(input);
  await transaction(async tx=>{
    await authorize(tx,actor);
    const [client]=await tx.query<{id:string;name:string;tax_id:string|null;contact_name:string|null;email:string|null;address:string|null}>(
      "SELECT id,name,tax_id,contact_name,email,address FROM clients WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
    if(!client)reject("El cliente no existe o ya no está activo.");
    const next={name:data.name,tax_id:data.tax_id||null,contact_name:data.contact_name||null,email:data.email||null,address:data.address||null};
    const previous={name:client.name,tax_id:client.tax_id,contact_name:client.contact_name,email:client.email,address:client.address};
    if(JSON.stringify(previous)===JSON.stringify(next))return;
    await tx.query("UPDATE clients SET name=$2,tax_id=$3,contact_name=$4,email=$5,address=$6 WHERE id=$1",
      [id,next.name,next.tax_id,next.contact_name,next.email,next.address]);
    await audit(tx,actor,"client",id,previous,next);
  });
}

export async function updateSite(actor:Actor,id:string,input:unknown){
  uuid.parse(id);
  const data=z.object({name,address:optional(250)}).parse(input);
  await transaction(async tx=>{
    await authorize(tx,actor);
    const [site]=await tx.query<{id:string;name:string;address:string|null}>(
      "SELECT id,name,address FROM client_sites WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
    if(!site)reject("La faena no existe o ya no está activa.");
    const next={name:data.name,address:data.address||null};
    const previous={name:site.name,address:site.address};
    if(JSON.stringify(previous)===JSON.stringify(next))return;
    await tx.query("UPDATE client_sites SET name=$2,address=$3 WHERE id=$1",[id,next.name,next.address]);
    await audit(tx,actor,"client_site",id,previous,next);
  });
}

export async function updateAsset(actor:Actor,id:string,input:unknown){
  uuid.parse(id);
  const data=z.object({label:z.string().trim().min(2).max(120),plate:optional(15)}).parse(input);
  await transaction(async tx=>{
    await authorize(tx,actor);
    const [asset]=await tx.query<{id:string;label:string;plate:string|null}>(
      "SELECT id,label,plate FROM assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
    if(!asset)reject("El activo no existe o ya no está disponible.");
    const next={label:data.label,plate:data.plate.toUpperCase()||null};
    const previous={label:asset.label,plate:asset.plate};
    if(JSON.stringify(previous)===JSON.stringify(next))return;
    await tx.query("UPDATE assets SET label=$2,plate=$3 WHERE id=$1",[id,next.label,next.plate]);
    await audit(tx,actor,"asset",id,previous,next);
  });
}
