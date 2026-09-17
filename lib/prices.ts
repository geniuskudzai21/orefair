import { getSql, requireSql } from "./db";

export interface ReferencePrice {
  key: string;
  name: string;
  pricePerGram: number;
  currency: string;
  source: string | null;
}

export function computeTotal(pricePerGram: number, weightGrams: number): number {
  return Math.round(pricePerGram * weightGrams * 100) / 100;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Quality multiplier applied to the reference rate. The reference rate is PAR:
 * it prices an average-quality sample (qualityScore 0.6).
 *   - clean (1.0) -> x1.50 premium  (e.g. $75/g -> $112.50/g)
 *   - 0.97        -> x1.46 (~ $110/g)
 *   - 0.6         -> x1.00 (par, reference rate)
 *   - 0.0         -> x0.25 floor (heavily contaminated)
 * If the model could not assess quality, no adjustment is applied (x1.0).
 */
export function qualityMultiplier(quality: string, qualityScore: number): number {
  if (quality.toLowerCase().includes("cannot assess")) return 1;
  const n = typeof qualityScore === "number" ? qualityScore : Number(qualityScore);
  if (!Number.isFinite(n)) return 1;
  return round2(0.25 + 1.25 * clamp01(n));
}

export function adjustedRatePerGram(
  pricePerGram: number,
  quality: string,
  qualityScore: number
): number {
  return round2(pricePerGram * qualityMultiplier(quality, qualityScore));
}

export async function listReferencePrices(): Promise<ReferencePrice[] | null> {
  if (!getSql()) return null;
  const sql = requireSql();
  const rows = await sql<{
    mineral_key: string;
    mineral_name: string;
    price_per_gram: number | string;
    currency: string;
    source: string | null;
  }[]>`
    SELECT mineral_key, mineral_name, price_per_gram, currency, source
    FROM reference_prices
    ORDER BY price_per_gram DESC
  `;

  return rows.map((r) => ({
    key: r.mineral_key,
    name: r.mineral_name,
    pricePerGram: Number(r.price_per_gram),
    currency: r.currency,
    source: r.source,
  }));
}

export async function findReferencePrice(mineralKey: string): Promise<ReferencePrice | null> {
  if (!getSql()) return null;
  const sql = requireSql();
  const rows = await sql<{
    mineral_key: string;
    mineral_name: string;
    price_per_gram: number | string;
    currency: string;
    source: string | null;
  }[]>`
    SELECT mineral_key, mineral_name, price_per_gram, currency, source
    FROM reference_prices
    WHERE mineral_key = ${mineralKey}
    LIMIT 1
  `;

  if (!rows[0]) return null;
  return {
    key: rows[0].mineral_key,
    name: rows[0].mineral_name,
    pricePerGram: Number(rows[0].price_per_gram),
    currency: rows[0].currency,
    source: rows[0].source,
  };
}