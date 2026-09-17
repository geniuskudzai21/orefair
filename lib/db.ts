import postgres, { type Sql } from "postgres";

let sql: Sql | null = null;

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql(): Sql | null {
  if (!isDbConfigured()) return null;
  if (!sql) {
    sql = postgres(process.env.DATABASE_URL as string, {
      max: process.env.NODE_ENV === "production" ? 1 : 10,
      ssl: "require",
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export function requireSql(): Sql {
  const client = getSql();
  if (!client) {
    throw new Error(
      "DATABASE_URL is not configured. Add a Neon Postgres connection string to .env.local"
    );
  }
  return client;
}