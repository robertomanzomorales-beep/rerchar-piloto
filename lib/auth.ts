import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import {createLoginSession,sessionSeconds,sessionTokenHash as tokenHash} from "./session-auth";

export type Role = "admin" | "operaciones" | "conductor" | "cliente";
export type Actor = { id: string; name: string; email: string; role: Role; client_id: string | null };
const cookieName = "rerchar_session";

export async function getActor(): Promise<Actor | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const rows = await db.query<Actor>(
    `SELECT u.id, u.name, u.email, u.role, u.client_id FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true`,
    [tokenHash(token)],
  );
  return rows[0] ?? null;
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/ingresar");
  return actor;
}

export async function signIn(email: string, password: string) {
  const jar=await cookies(),token=await createLoginSession(email,password,jar.get(cookieName)?.value);
  if(!token)return false;
  try{jar.set(cookieName,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:sessionSeconds});}
  catch(error){await db.query("DELETE FROM sessions WHERE token_hash=$1",[tokenHash(token)]).catch(()=>{});throw error;}
  return true;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token && /^[0-9a-f]{64}$/.test(token)) await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]);
  jar.delete(cookieName);
}

export function canManage(actor: Actor) { return actor.role === "admin" || actor.role === "operaciones"; }
export function canPlan(actor: Actor) { return canManage(actor); }
export function canReadService(actor: Actor, service: { client_id: string; driver_id: string | null }) {
  if (canManage(actor)) return true;
  if (actor.role === "cliente") return actor.client_id === service.client_id;
  return actor.role === "conductor" && actor.id === service.driver_id;
}
export function canWorkService(actor: Actor, service: { driver_id: string | null }) {
  return canManage(actor) || (actor.role === "conductor" && actor.id === service.driver_id);
}
