import { NextResponse } from "next/server";
import { appendTransactionForData, getRecentBlocks, verifyChain } from "@/lib/ledger";
import { adjustedRatePerGram, computeTotal, findReferencePrice, listReferencePrices, qualityMultiplier } from "@/lib/prices";
import { isDbConfigured } from "@/lib/db";
import type { Appraisal } from "@/lib/gemini";

export const runtime = "nodejs";

function configuredError(): NextResponse {
  return NextResponse.json(
    {
      configured: false,
      error: "DATABASE_URL is not configured. Add a Neon Postgres connection string to .env.local.",
    },
    { status: 503 }
  );
}

export async function GET(request: Request) {
  if (!isDbConfigured()) return configuredError();

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.floor(rawLimit)), 100) : 30;

  try {
    const [transactions, referencePrices, verification] = await Promise.all([
      getRecentBlocks(limit),
      listReferencePrices(),
      verifyChain(),
    ]);

    return NextResponse.json({ configured: true, transactions, referencePrices, verification });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load ledger.";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) return configuredError();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const appraisal = body.appraisal as Partial<Appraisal> | undefined;
  const weightGrams = Number(body.weightGrams);
  const imageHash = typeof body.imageHash === "string" ? body.imageHash : undefined;
  const originalFilename =
    typeof body.originalFilename === "string" ? body.originalFilename.trim().slice(0, 200) : undefined;

  if (!appraisal || typeof appraisal.mineralType !== "string" || appraisal.mineralType.trim() === "") {
    return NextResponse.json(
      { error: "An appraisal with a mineralType is required. Analyze a photo first." },
      { status: 400 }
    );
  }

  if (!Number.isFinite(weightGrams) || weightGrams <= 0 || weightGrams > 2_000_000) {
    return NextResponse.json(
      { error: "weightGrams must be a positive number (grams)." },
      { status: 400 }
    );
  }

  if (imageHash !== undefined && !/^[a-f0-9]{64}$/i.test(imageHash)) {
    return NextResponse.json(
      { error: "imageHash must be a lowercase hex SHA-256 (64 chars)." },
      { status: 400 }
    );
  }

  const mineralType = appraisal.mineralType.trim();

  try {
    const referencePrice = await findReferencePrice(mineralType);
    const pricePerGram = referencePrice?.pricePerGram ?? null;
    const multiplier =
      referencePrice != null ? qualityMultiplier(appraisal.quality ?? "", Number(appraisal.qualityScore) || 0) : null;
    const ratePerGram =
      referencePrice != null
        ? adjustedRatePerGram(pricePerGram ?? 0, appraisal.quality ?? "", Number(appraisal.qualityScore) || 0)
        : null;
    const totalPrice = ratePerGram != null && pricePerGram != null ? computeTotal(ratePerGram, weightGrams) : null;

    const data: Record<string, unknown> = {
      $schema: "orefair.transaction.v1",
      recordedAt: new Date().toISOString(),
      appraisal: { ...appraisal, mineralType },
      weightGrams,
      pricePerGram,
      ratePerGram,
      qualityMultiplier: multiplier,
      totalPrice,
      currency: referencePrice?.currency ?? "USD",
      priceStatus: referencePrice ? "catalogued" : "no_reference_price",
    };

    if (imageHash) data.imageHash = imageHash.toLowerCase();
    if (originalFilename) data.originalFilename = originalFilename;

    const block = await appendTransactionForData(data);

    const storedData = block.data as { priceStatus?: string };
    return NextResponse.json(
      {
        ok: true,
        transaction: block,
        priceStatus: storedData.priceStatus,
        price: { pricePerGram, ratePerGram, qualityMultiplier: multiplier, totalPrice },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not record transaction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}