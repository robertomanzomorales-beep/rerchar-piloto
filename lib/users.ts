import {z} from "zod";
import type {Actor,Role} from "./auth";
import {db,transaction,type Db} from "./db";
import {hashPassword} from "./password";
import {lastRecordPage,recordPage,recordsPerPage} from "./record-pagination";
import {userContext,userId,type UserContext} from "./user-form-state";

const uuid=z.uuid();
const role=z.enum(["admin","operaciones","conductor","cliente"]);
export class UsersError extends Error {}
function reject(message:string):never{throw new UsersError(message);}
function admin(actor:Actor){if(actor.role!=="admin")reject("Sólo administración puede gestionar usuarios.");}

export type UserSummary={id:string;name:string;email:string;role:Role;client_id:string|null;
  client_name:string|null;active:boolean;locked_until:Date|null;created_at:Date;sessions:string};

const userSelect=`SELECT u.id,u.name,u.email,u.role,u.client_id,c.name AS client_name,
  u.active,u.locked_until,u.created_at,
  (SELECT count(*)::text FROM sessions s WHERE s.user_id=u.id AND s.expires_at>now()) AS sessions
  FROM users u LEFT JOIN clients c ON c.id=u.client_id`;
const userOrder=" ORDER BY u.active DESC,u.name,u.email,u.id";
async function authorizeRead(actor:Actor){
  admin(actor);
  const [current]=await db.query<{id:string}>("SELECT id FROM users WHERE id=$1 AND role='admin' AND active=true",[actor.id]);
  if(!current)reject("Su acceso de administración ya no está activo.");
}
export async function listUsers(actor:Actor){
  await authorizeRead(actor);
  return db.query<UserSummary>(userSelect+userOrder);
}

export async function listUserBoard(actor:Actor,input:UserContext,selectedId=""){
  await authorizeRead(actor);
  const context=userContext(input),params:unknown[]=[],conditions:string[]=[];
  if(context.buscar){
    params.push(`%${context.buscar.replace(/[\\%_]/g,"\\$&")}%`);
    conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }
  if(context.perfil){params.push(context.perfil);conditions.push(`u.role=$${params.length}`);}
  if(context.estado==="activas")conditions.push("u.active=true");
  if(context.estado==="suspendidas")conditions.push("u.active=false");
  if(context.estado==="bloqueadas")conditions.push("u.active=true AND u.locked_until>now()");
  const where=conditions.length?` WHERE ${conditions.join(" AND ")}`:"";
  const [[stats],[count]]=await Promise.all([
    db.query<{total:number;active:number;suspended:number;locked:number;active_admins:number}>(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE active)::int AS active,count(*) FILTER(WHERE NOT active)::int AS suspended,
      count(*) FILTER(WHERE active AND locked_until>now())::int AS locked,
      count(*) FILTER(WHERE active AND role='admin')::int AS active_admins FROM users`),
    db.query<{total:number}>(`SELECT count(*)::int AS total FROM users u LEFT JOIN clients c ON c.id=u.client_id${where}`,params),
  ]);
  const total=count.total,pages=lastRecordPage(total),page=Math.min(recordPage(context.pagina),pages);
  const rows=await db.query<UserSummary>(`${userSelect}${where}${userOrder} LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,recordsPerPage,(page-1)*recordsPerPage]);
  const selectedKey=userId(selectedId);
  const selected=selectedKey&&!rows.some(row=>row.id===selectedKey)?
    (await db.query<UserSummary>(`${userSelect} WHERE u.id=$1`,[selectedKey]))[0]??null:null;
  return {rows,total,pages,page,stats,selected};
}

async function lockActiveAdmins(tx:Db,actor:Actor){
  const active=await tx.query<{id:string}>("SELECT id FROM users WHERE role='admin' AND active=true ORDER BY id FOR UPDATE");
  if(!active.some(user=>user.id===actor.id))reject("Su acceso de administración ya no está activo.");
  return active;
}

async function activeClient(tx:Db,clientId:string){
  const [client]=await tx.query<{id:string}>("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL",[clientId]);
  if(!client)reject("Seleccione un cliente activo para esta cuenta.");
}

export async function changeUserRole(actor:Actor,id:string,input:unknown){
  admin(actor);uuid.parse(id);
  const data=z.object({role,client_id:z.union([uuid,z.literal("")]).default("")}).parse(input);
  if(data.role==="cliente"&&!data.client_id)reject("Asigne un cliente a esta cuenta.");
  if(data.role!=="cliente"&&data.client_id)reject("Sólo el perfil cliente se vincula a una empresa.");
  await transaction(async tx=>{
    const activeAdmins=await lockActiveAdmins(tx,actor);
    const [user]=await tx.query<{id:string;role:Role;client_id:string|null;active:boolean}>(
      "SELECT id,role,client_id,active FROM users WHERE id=$1 FOR UPDATE",[id]);
    if(!user)reject("La cuenta no existe.");
    if(user.id===actor.id&&data.role!=="admin")reject("No puede cambiar su propio perfil de administración.");
    if(user.active&&user.role==="admin"&&data.role!=="admin"&&activeAdmins.length===1)
      reject("Debe quedar al menos una cuenta administrativa activa.");
    if(data.client_id)await activeClient(tx,data.client_id);
    const nextClient=data.client_id||null;
    if(user.role===data.role&&user.client_id===nextClient)return;
    if(user.role==="conductor"&&data.role!=="conductor"){
      const [open]=await tx.query<{id:string}>(`SELECT id FROM service_requests
        WHERE driver_id=$1 AND status IN ('programada','en_ruta') AND deleted_at IS NULL LIMIT 1`,[id]);
      if(open)reject("Reasigne o cierre los servicios activos antes de cambiar el perfil del conductor.");
    }
    await tx.query("UPDATE users SET role=$2,client_id=NULLIF($3,'')::uuid,failed_attempts=0,locked_until=NULL WHERE id=$1",
      [id,data.role,data.client_id]);
    await tx.query("DELETE FROM sessions WHERE user_id=$1",[id]);
    await tx.query(`INSERT INTO audit_events (actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES ($1,'update','user',$2,$3,$4)`,[actor.id,id,
      JSON.stringify({role:user.role,client_id:user.client_id}),JSON.stringify({role:data.role,client_id:nextClient})]);
  });
}

export async function setUserActive(actor:Actor,id:string,active:unknown){
  admin(actor);uuid.parse(id);
  const next=z.enum(["true","false"]).parse(active)==="true";
  await transaction(async tx=>{
    const activeAdmins=await lockActiveAdmins(tx,actor);
    const [user]=await tx.query<{id:string;role:Role;active:boolean}>(
      "SELECT id,role,active FROM users WHERE id=$1 FOR UPDATE",[id]);
    if(!user)reject("La cuenta no existe.");
    if(user.id===actor.id&&!next)reject("No puede suspender su propia cuenta.");
    if(user.active===next)return;
    if(!next&&user.role==="admin"&&activeAdmins.length===1)
      reject("Debe quedar al menos una cuenta administrativa activa.");
    await tx.query("UPDATE users SET active=$2,failed_attempts=0,locked_until=NULL WHERE id=$1",[id,next]);
    await tx.query("DELETE FROM sessions WHERE user_id=$1",[id]);
    await tx.query(`INSERT INTO audit_events (actor_id,action,entity_type,entity_id,previous_value,next_value)
      VALUES ($1,'update','user',$2,$3,$4)`,[actor.id,id,
      JSON.stringify({active:user.active}),JSON.stringify({active:next})]);
  });
}

export async function resetUserPassword(actor:Actor,id:string,password:unknown){
  admin(actor);uuid.parse(id);
  const next=z.string().min(12).max(128).parse(password);
  const hash=await hashPassword(next);
  await transaction(async tx=>{
    await lockActiveAdmins(tx,actor);
    const [user]=await tx.query<{id:string}>("SELECT id FROM users WHERE id=$1 FOR UPDATE",[id]);
    if(!user)reject("La cuenta no existe.");
    await tx.query("UPDATE users SET password_hash=$2,failed_attempts=0,locked_until=NULL WHERE id=$1",[id,hash]);
    await tx.query("DELETE FROM sessions WHERE user_id=$1",[id]);
    await tx.query(`INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value)
      VALUES ($1,'update','user',$2,$3)`,[actor.id,id,JSON.stringify({password_reset:true,sessions_closed:true})]);
  });
  return id===actor.id;
}
