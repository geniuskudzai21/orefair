-- OreFair schema (Neon / Postgres)

CREATE TABLE IF NOT EXISTS reference_prices (
  id BIGSERIAL PRIMARY KEY,
  mineral_key TEXT NOT NULL UNIQUE,
  mineral_name TEXT NOT NULL,
  price_per_gram NUMERIC(18, 8) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  block_index BIGINT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  previous_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_transactions_block_index
  ON transactions (block_index DESC);

-- Single-row "head of chain" tracker used to serialize appends
-- and to anchor the hash chain at the genesis zero-hash.
CREATE TABLE IF NOT EXISTS ledger_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  block_index BIGINT NOT NULL,
  head_hash TEXT NOT NULL
);