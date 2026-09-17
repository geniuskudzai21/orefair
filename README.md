# OreFair

AI-powered fair pricing and traceability for artisanal miners.

Snap a photo of an ore sample, Gemini identifies the mineral and flags visible quality,
a reference price table computes a fair quote by weight, and every transaction is written
to a SHA-256 **hash-chained ledger** so the record is tamper-evident.

## Stack

- **Next.js (App Router) + TypeScript + Tailwind CSS** for both UI and API routes
- **PostgreSQL on Neon** via [`postgres.js`](https://github.com/porsager/postgres) (plain SQL, no ORM)
- **Google Gemini** (`gemini-3.6-flash`) vision model with JSON structured output
- Deploys to **Vercel**

## How it works

1. **Upload** - the browser resizes the photo to max 1024px and computes its SHA-256.
2. **Analyze** - `POST /api/analyze` sends the image to `gemini-3.6-flash` using a
   `responseSchema`, so the model returns structured JSON:
   mineral type, quality flag, quality score, confidence and notes.
3. **Weight** - the miner types the sample weight in grams.
4. **Fair price** - a reference rate (`reference_prices.price_per_gram`) is looked up by
   mineral key (`gold`, `platinum`, `chrome`, ...) and priced as PAR (an average-quality
   sample at qualityScore 0.6). Quality then sets a multiplier:
   `multiplier = 0.25 + 1.25 * qualityScore`, so a clean sample (score 1.0) earns a
   **x1.50 premium** (e.g. $75/g -> $112.50/g), while heavy contamination drops toward a
   x0.25 floor. `rate = price_per_gram * multiplier`, `price = rate * weight`. If quality
   cannot be assessed, the reference rate is used unchanged.
5. **Ledger** - `POST /api/transactions` appends a block:
   `{ data (jsonb), timestamp, previous_hash, hash }` where
   `hash = sha256(previous_hash + "|" + canonical_json(block))`.
   Blocks are serialized with a `FOR UPDATE` lock on `ledger_state`, so the chain can
   never fork. `GET /api/chain` recomputes every hash and returns a verification report.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in both values
npm run db:init              # creates tables and seeds reference prices
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable         | Where to get it                                                        |
| ---------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`   | Neon dashboard -> Connection Details -> **Pooled** connection string   |
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey                                 |

## Database

`npm run db:init` (idempotent) applies `db/schema.sql`, seeds `db/seed.sql`, and
initializes the chain head.

- `reference_prices` - `mineral_key`, `mineral_name`, `price_per_gram`, `currency`, `source`.
  Seeded with realistic USD/gram values for gold, platinum, silver, copper and chrome.
- `transactions` - `block_index`, `data (jsonb)`, `timestamp`, `previous_hash`, `hash`.
- `ledger_state` - single row holding the chain head (block index + hash), starting at the
  genesis zero-hash.

## API

| Method | Route                    | Purpose                                              |
| ------ | ------------------------ | ---------------------------------------------------- |
| `POST` | `/api/analyze`           | `{ image: dataURL }` -> structured appraisal + rate  |
| `GET`  | `/api/transactions`      | recent blocks, reference prices, verification status |
| `POST` | `/api/transactions`      | `{ appraisal, weightGrams, imageHash? }` -> new block |
| `GET`  | `/api/chain`             | full chain + hash verification report                |

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add `DATABASE_URL` and `GEMINI_API_KEY` as environment variables.
3. Deploy, then run `npm run db:init` locally against the same `DATABASE_URL`
   (or `node scripts/db-init.mjs` with the env var set).

## Notes / scope

This is a hackathon MVP:

- Reference prices are static approximations, not live market feeds.
- The image itself is not stored; only its SHA-256 hash is anchored in the ledger.
- The chain is a single-writer append log - adequate for traceability demos, not a
  distributed consensus.
