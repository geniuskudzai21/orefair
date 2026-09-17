import { createHash } from "node:crypto";
import type { JSONValue, TransactionSql } from "postgres";
import { requireSql } from "./db";

export const GENESIS_HASH = "0".repeat(64);

export interface LedgerBlock {
  blockIndex: number;
  data: unknown;
  timestamp: string;
  previousHash: string;
  hash: string;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Deterministic JSON serialization with sorted keys. This guarantees the
 * canonical string is stable across a Postgres `jsonb` round-trip (jsonb
 * does not preserve key order).
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function canonicalRecord(
  blockIndex: number,
  data: unknown,
  timestampIso: string
): string {
  return stableStringify({ blockIndex, data, timestamp: timestampIso });
}

export function computeHash(
  blockIndex: number,
  data: unknown,
  timestampIso: string,
  previousHash: string
): string {
  return sha256Hex(`${previousHash}|${canonicalRecord(blockIndex, data, timestampIso)}`);
}

async function ensureLedgerState(sql: TransactionSql): Promise<void> {
  await sql`
    INSERT INTO ledger_state (id, block_index, head_hash)
    VALUES (1, 0, ${GENESIS_HASH})
    ON CONFLICT (id) DO NOTHING
  `;
}

export interface CreatedBlock {
  blockIndex: number;
  data: unknown;
  timestamp: string;
  previousHash: string;
  hash: string;
}

/**
 * Appends a transaction to the hash-chained ledger. Serialized through a
 * row lock on `ledger_state` so concurrent appends cannot fork the chain.
 */
export async function appendTransactionForData(data: unknown): Promise<CreatedBlock> {
  const sql = requireSql();

  return sql.begin(async (tx) => {
    await ensureLedgerState(tx);

    const [head] = await tx<{ block_index: number; head_hash: string }[]>`
      SELECT block_index, head_hash
      FROM ledger_state
      WHERE id = 1
      FOR UPDATE
    `;

    const blockIndex = Number(head.block_index) + 1;
    const timestamp = new Date();
    const timestampIso = timestamp.toISOString();
    const previousHash = head.head_hash;
    const hash = computeHash(blockIndex, data, timestampIso, previousHash);

    await tx`
      INSERT INTO transactions (block_index, data, timestamp, previous_hash, hash)
      VALUES (${blockIndex}, ${tx.json(data as JSONValue)}, ${timestamp}, ${previousHash}, ${hash})
    `;

    await tx`
      UPDATE ledger_state SET block_index = ${blockIndex}, head_hash = ${hash} WHERE id = 1
    `;

    return { blockIndex, data, timestamp: timestampIso, previousHash, hash };
  });
}

interface DbTransactionRow {
  block_index: number | string;
  data: unknown;
  timestamp: Date;
  previous_hash: string;
  hash: string;
}

export async function getChain(): Promise<LedgerBlock[]> {
  const sql = requireSql();
  const rows = await sql<DbTransactionRow[]>`
    SELECT block_index, data, timestamp, previous_hash, hash
    FROM transactions
    ORDER BY block_index ASC
  `;

  return rows.map((r) => ({
    blockIndex: Number(r.block_index),
    data: r.data,
    timestamp: new Date(r.timestamp).toISOString(),
    previousHash: r.previous_hash,
    hash: r.hash,
  }));
}

export async function getRecentBlocks(limit: number): Promise<LedgerBlock[]> {
  const sql = requireSql();
  const rows = await sql<DbTransactionRow[]>`
    SELECT block_index, data, timestamp, previous_hash, hash
    FROM transactions
    ORDER BY block_index DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    blockIndex: Number(r.block_index),
    data: r.data,
    timestamp: new Date(r.timestamp).toISOString(),
    previousHash: r.previous_hash,
    hash: r.hash,
  }));
}

export interface ChainVerification {
  valid: boolean;
  blocksChecked: number;
  headMatches: boolean;
  firstInvalidBlock: number | null;
  headHash: string;
  checkedAt: string;
}

export async function verifyChain(): Promise<ChainVerification> {
  const sql = requireSql();
  const blocks = await getChain();
  const checkedAt = new Date().toISOString();

  let expectedPrevious = GENESIS_HASH;

  for (const block of blocks) {
    if (block.previousHash !== expectedPrevious) {
      return {
        valid: false,
        blocksChecked: block.blockIndex,
        headMatches: false,
        firstInvalidBlock: block.blockIndex,
        headHash: block.hash,
        checkedAt,
      };
    }
    const recomputed = computeHash(block.blockIndex, block.data, block.timestamp, block.previousHash);
    if (recomputed !== block.hash) {
      return {
        valid: false,
        blocksChecked: block.blockIndex,
        headMatches: false,
        firstInvalidBlock: block.blockIndex,
        headHash: block.hash,
        checkedAt,
      };
    }
    expectedPrevious = block.hash;
  }

  const [state] = await sql<{ head_hash: string }[]>`
    SELECT head_hash FROM ledger_state WHERE id = 1
  `;

  const headHash = state?.head_hash ?? GENESIS_HASH;
  const headMatches = headHash === expectedPrevious;

  return {
    valid: headMatches,
    blocksChecked: blocks.length,
    headMatches,
    firstInvalidBlock: headMatches ? null : blocks.length + 1,
    headHash,
    checkedAt,
  };
}