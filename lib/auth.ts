import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { verifyPassword } from "./password";

export type Role = "admin" | "operaciones" | "conductor" | "cliente";
export type Actor = { id: string; name: string; email: string; role: Role; client_id: string | null };
const cookieName = "rerchar_session";
const sessionSeconds = 12 * 60 * 60;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

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
  const normalized = email.trim().toLowerCase();
  const rows = await db.query<Actor & { password_hash: string; locked_until: Date | null }>(
    `SELECT id, name, email, role, client_id, password_hash, locked_until
     FROM users WHERE email = $1 AND active = true`, [normalized],
  );
  const user = rows[0];
  // Equalize the expensive check when the address is unknown.
  const dummy = "scrypt:9c3c60306be04dc11919b5f8a6769a41:95f00ace85a03f54fa932b402129c732570284482762c56416e06783da238daf0727267de0a4b0c18cb5ac1259a1ab8a6b9e6a33ce991cd0da70ea312406a";
  const valid = await verifyPassword(password, user?.password_hash ?? dummy);
  if (!user || !valid || (user.locked_until && new Date(user.locked_until) > new Date())) {
    if (user) await db.query(
      `UPDATE users SET failed_attempts = failed_attempts + 1,
       locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
       WHERE id = $1`, [user.id],
    );
    return false;
  }
  await db.query("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [user.id]);
  const token = randomBytes(32).toString("hex");
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '12 hours')", [tokenHash(token), user.id]);
  (await cookies()).set(cookieName, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: sessionSeconds,
  });
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
