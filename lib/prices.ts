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