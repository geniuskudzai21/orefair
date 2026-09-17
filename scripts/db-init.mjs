import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("DATABASE_URL is missing. Create a .env.local with your Neon connection string.");
  process.exit(1);
}

const sql = postgres(dbUrl, { ssl: "require", max: 3 });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
const seedSql = fs.readFileSync(path.join(__dirname, "..", "db", "seed.sql"), "utf8");

try {
  await sql.unsafe(schemaSql, [], { multiple: true });
  console.log("[1/3] Schema applied (reference_prices, transactions, ledger_state).");

  await sql.unsafe(seedSql, [], { multiple: true });
  console.log("[2/3] Reference prices seeded.");

  await sql`
    INSERT INTO ledger_state (id, block_index, head_hash)
    VALUES (1, 0, ${"0".repeat(64)})
    ON CONFLICT (id) DO NOTHING
  `;
  console.log("[3/3] Ledger state initialized (genesis anchor, block_index = 0).");

  const prices = await sql`SELECT mineral_key, price_per_gram FROM reference_prices ORDER BY price_per_gram DESC`;
  for (const p of prices) {
    console.log(`       ${p.mineral_key.padEnd(10)} ${p.price_per_gram} USD/g`);
  }

  const blocks = await sql`SELECT count(*)::int AS n FROM transactions`;
  console.log(`       Ledger blocks so far: ${blocks[0].n}`);

  console.log("Database ready.");
} catch (err) {
  console.error("Init failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}