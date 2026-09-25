import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db, transaction } from "../lib/db";

async function main() {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const directory = resolve(process.cwd(), "db");
  for (const name of (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort()) {
    const applied = await db.query("SELECT name FROM schema_migrations WHERE name = $1", [name]);
    if (applied.length) continue;
    const sql = await readFile(resolve(directory, name), "utf8");
    const statements = sql.split(/;\s*(?:\n|$)/).map((part) => part.trim()).filter(Boolean);
    await transaction(async (tx) => {
      for (const statement of statements) await tx.query(statement);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    console.log(`Migración aplicada: ${name}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
