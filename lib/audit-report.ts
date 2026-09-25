import {z} from "zod";
import type {Actor} from "./auth";
import {db} from "./db";

export function auditFilter(input:{from?:string;to?:string;kind?:string}){
  const date=(value:string|undefined)=>value&&z.iso.date().safeParse(value).success?value:"";
  return {from:date(input.from),to:date(input.to),kind:input.kind&&/^[a-z_]{1,80}$/.test(input.kind)?input.kind:""};
}
export async function auditKinds(actor:Actor){
  if(actor.role!=="admin")throw new Error("La auditoría requiere administración.");
  return db.query<{entity_type:string}>("SELECT DISTINCT entity_type FROM audit_events ORDER BY entity_type");
}
export type AuditRow={id:string;actor_name:string;action:string;entity_type:string;entity_id:string;created_at:Date};
export async function auditReport(actor:Actor,filters:ReturnType<typeof auditFilter>,limit=300){
  if(actor.role!=="admin")throw new Error("La auditoría requiere administración.");
  return db.query<AuditRow>(`SELECT e.id,u.name AS actor_name,e.action,e.entity_type,e.entity_id,e.created_at
    FROM audit_events e JOIN users u ON u.id=e.actor_id WHERE
    ($1::text='' OR e.created_at >= NULLIF($1,'')::date) AND ($2::text='' OR e.created_at < (NULLIF($2,'')::date + interval '1 day'))
    AND ($3::text='' OR e.entity_type=$3) ORDER BY e.created_at DESC,e.id DESC LIMIT $4`,
    [filters.from,filters.to,filters.kind,limit]);
}
