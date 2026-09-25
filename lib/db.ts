import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";

export type Db = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
};

type Shared = { pool?: Pool; local?: PGlite };
const shared = globalThis as typeof globalThis & { __rercharDb?: Shared };
const instances = (shared.__rercharDb ??= {});

function localDb() {
  if (instances.local) return instances.local;
  const directory = process.env.PGLITE_DATA_DIR?.startsWith("memory://")
    ? process.env.PGLITE_DATA_DIR
    : resolve(process.cwd(), process.env.PGLITE_DATA_DIR || ".local/rerchar-db");
  if (!directory.startsWith("memory://")) mkdirSync(dirname(directory), { recursive: true });
  return (instances.local = new PGlite(directory));
}

function pool() {
  return (instances.pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: process.env.VERCEL ? 2 : 10,
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  }));
}

export const db: Db = {
  async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
    if (process.env.DATABASE_URL) {
      const result = await pool().query(sql, params);
      return result.rows as T[];
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL es obligatorio en producción.");
    }
    const result = await localDb().query(sql, params);
    return result.rows as T[];
  },
};

export async function transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  if (process.env.DATABASE_URL) {
    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      const result = await fn({
        async query<Row extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
          return (await client.query(sql, params)).rows as Row[];
        },
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL es obligatorio en producción.");
  return localDb().transaction(async (client) => fn({
    async query<Row extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
      return (await client.query(sql, params)).rows as Row[];
    },
  }));
}
