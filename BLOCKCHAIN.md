# Blockchain in OreFair

A lightweight, single-writer hash-linked ledger stored in PostgreSQL — not a
distributed/consensus blockchain.

## Block structure (`lib/ledger.ts`)

Every recorded transaction becomes a block:

```
{ block_index, data (jsonb), timestamp, previous_hash, hash }
```

- `hash = sha256(previous_hash + "|" + canonical_record(block_index, data, timestamp))`
- The canonical string is produced by `stableStringify`, which sorts JSON keys
  so the hash is identical after a Postgres `jsonb` round-trip (jsonb does not
  preserve key order) (`lib/ledger.ts:24`, `lib/ledger.ts:44`).
- Each block's hash therefore depends on the previous block's hash → the chain.

## Append (`appendTransactionForData`, `lib/ledger.ts:73`)

- Runs in a transaction with `SELECT ... FOR UPDATE` on the single
  `ledger_state` row, so concurrent writes are serialized and can't fork the chain.
- Computes the new block hash from the current head, inserts the row, then
  advances `ledger_state.block_index` / `head_hash`.

## Verify (`verifyChain`, `lib/ledger.ts:157`)

- Walks the whole chain from the genesis zero-hash, recomputing every hash and
  checking each block's `previous_hash` links correctly to its predecessor.
- Finally confirms the recomputed head equals the stored `head_hash`.

Genesis is `"0".repeat(64)` (`lib/ledger.ts:5`). Since tampering with any block
changes its hash and breaks every subsequent link, the chain is tamper-evident —
though as the README notes it is a traceability demo for a hackathon MVP, not
distributed consensus.