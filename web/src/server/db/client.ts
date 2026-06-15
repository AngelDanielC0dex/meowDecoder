import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Singleton DB client. Lazily created so importing schema in tooling
 * (drizzle-kit) or in client bundles never opens a connection.
 * DATABASE_URL is server-only and must never be exposed to the browser.
 */
let client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  client ??= postgres(url, { prepare: false });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof getDb>;
