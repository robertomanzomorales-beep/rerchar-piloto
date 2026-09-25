import { access } from "node:fs/promises";
import { randomBytes, scryptSync } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const [emailInput, password, previousEmailInput = ""] = process.argv.slice(2);
const email = emailInput?.trim().toLowerCase();
const previousEmail = previousEmailInput.trim().toLowerCase();

if (process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
  throw new Error("Este ajuste de credenciales de revisión sólo se permite en la base local.");
}
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 8 || password.length > 128) {
  throw new Error("Uso: node scripts/activar-revision.mjs 'nuevo@correo.cl' 'clave-de-8-o-más' 'correo-anterior@ejemplo.cl'");
}

const directory = resolve(process.cwd(), process.env.PGLITE_DATA_DIR || ".local/rerchar-db");
await access(directory).catch(() => {
  throw new Error("No se encontró la base local. Ejecute npm run db:migrate primero.");
});

const salt = randomBytes(16).toString("hex");
const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const db = new PGlite(directory);

try {
  await db.transaction(async (tx) => {
    const [current] = (await tx.query("SELECT id,role FROM users WHERE email=$1 FOR UPDATE", [email])).rows;
    const [previous] = previousEmail && previousEmail !== email
      ? (await tx.query("SELECT id,role FROM users WHERE email=$1 FOR UPDATE", [previousEmail])).rows
      : [];
    if (current?.role !== undefined && current.role !== "admin") throw new Error("El correo indicado pertenece a un perfil distinto de administrador.");
    if (previous?.role !== undefined && previous.role !== "admin") throw new Error("La cuenta anterior no es administradora.");

    let id;
    if (current) {
      id = current.id;
      await tx.query(
        "UPDATE users SET password_hash=$2, active=true, failed_attempts=0, locked_until=NULL WHERE id=$1",
        [id, hash],
      );
      if (previous) {
        await tx.query("UPDATE users SET active=false WHERE id=$1", [previous.id]);
        await tx.query("DELETE FROM sessions WHERE user_id=$1", [previous.id]);
      }
    } else if (previous) {
      id = previous.id;
      await tx.query(
        "UPDATE users SET email=$2, password_hash=$3, active=true, failed_attempts=0, locked_until=NULL WHERE id=$1",
        [id, email, hash],
      );
    } else {
      const [created] = (await tx.query(
        "INSERT INTO users (email,name,password_hash,role) VALUES ($1,'Roberto Manzo',$2,'admin') RETURNING id",
        [email, hash],
      )).rows;
      id = created.id;
    }
    await tx.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    await tx.query(
      "INSERT INTO audit_events (actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,'review_credentials','user',$1,$2,$3)",
      [id, JSON.stringify({ email: previousEmail || null }), JSON.stringify({ email })],
    );
  });
  console.log(`Cuenta de revisión lista: ${email}. Puede iniciar sesión después de arrancar el servidor.`);
} finally {
  await db.close();
}
