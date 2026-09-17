import { NextResponse } from "next/server";
import { classifyMineralImage, isGeminiConfigured } from "@/lib/gemini";
import { adjustedRatePerGram, findReferencePrice, qualityMultiplier } from "@/lib/prices";
import { isDbConfigured } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_BASE64_LENGTH = 20_000_000;

function parseDataUrl(image: string): { mimeType: string; base64: string } | null {
  if (!image.includes(",")) return null;
  const [meta, base64] = image.split(",");
  const match = meta.match(/^data:([^;]+);base64$/);
  if (!match) return null;
  return { mimeType: match[1] ?? "image/jpeg", base64 };
}

export async function POST(request: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "Gemini is not configured. Set GEMINI_API_KEY in .env.local." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  const parsed = parseDataUrl(image);

  if (!parsed) {
    return NextResponse.json(
      { error: "Missing image. Send a base64 data URL under the 'image' field." },
      { status: 400 }
    );
  }

  if (!ALLOWED_MIME.has(parsed.mimeType)) {
    return NextResponse.json(
      { error: `Unsupported image type '${parsed.mimeType}'. Use JPEG, PNG, WebP, or HEIC.` },
      { status: 400 }
    );
  }

  if (parsed.base64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json(
      { error: "Image is too large (max ~15 MB). Resize before uploading." },
      { status: 400 }
    );
  }

  try {
    const appraisal = await classifyMineralImage(parsed.base64, parsed.mimeType);

    let referencePrice = null;
    if (isDbConfigured()) {
      referencePrice = await findReferencePrice(appraisal.mineralType);
    }

    return NextResponse.json({
      ok: true,
      appraisal,
      referencePrice,
      qualityMultiplier: referencePrice
        ? qualityMultiplier(appraisal.quality, appraisal.qualityScore)
        : null,
      ratePerGram: referencePrice
        ? adjustedRatePerGram(referencePrice.pricePerGram, appraisal.quality, appraisal.qualityScore)
        : null,
      priceStatus: referencePrice ? "catalogued" : "no_reference_price",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image analysis failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}