import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";

const MODEL_NAME = "gemini-3.6-flash";

export interface Appraisal {
  mineralType: string;
  mineralName: string;
  quality: string;
  qualityScore: number;
  confidence: number;
  notes: string;
  rawType: string;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Normalize free-text mineral answers to stable catalogue keys.
const ALIASES: Record<string, string> = {
  "gold ore": "gold",
  "native gold": "gold",
  "platinum ore": "platinum",
  "platinum group metals": "platinum",
  chromite: "chrome",
  "chrome ore": "chrome",
  "chromium ore": "chrome",
  "copper ore": "copper",
  "native copper": "copper",
  "silver ore": "silver",
  "native silver": "silver",
};

function normalizeMineralType(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
  const key = ALIASES[cleaned] ?? cleaned.replace(/\s+/g, "_");
  return key === "" ? "unknown" : key;
}

function clampUnit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function cleanJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1]?.trim() ?? trimmed;
  return trimmed;
}

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    mineralType: {
      type: SchemaType.STRING,
      description:
        "Primary mineral or ore type detected from the photo, e.g. 'gold', 'chrome', 'platinum', 'copper', 'silver'. Use lowercase, single-word keys. If unidentifiable use 'unknown'.",
    },
    mineralName: {
      type: SchemaType.STRING,
      description: "Human-readable mineral name, e.g. 'Gold' or 'Chromite ore'.",
    },
    quality: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["clean sample", "minor impurities", "high visible impurities", "cannot assess"],
      description:
        "Visible quality flag based only on what can be seen in the photo (visible gangue, matrix rock, coating, rust, etc.).",
    },
    qualityScore: {
      type: SchemaType.NUMBER,
      description: "Visual purity or quality score from 0 (heavily contaminated) to 1 (clean sample).",
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: "Confidence in mineral identification from 0 to 1.",
    },
    notes: {
      type: SchemaType.STRING,
      description: "One short sentence describing visible features: color, lustre, matrix rock, impurities.",
    },
  },
  required: ["mineralType", "mineralName", "quality", "qualityScore", "confidence", "notes"],
};

const PROMPT = `You are a field mineralogist helping artisanal miners get fair and honest prices for their ore.
Analyze the mineral/ore sample in the photo. Judge ONLY what is visible in the image:
- Identify the dominant mineral or ore type.
- Assess visible quality: clean pure-looking sample, minor impurities, or high visible impurities
  (heavy gangue/matrix rock, rust, coating, mixed rock).
- Keep notes brief and factual.
Respond with STRICT JSON matching the requested schema. Do not add commentary outside the JSON.`;

export async function classifyMineralImage(
  imageBase64: string,
  mimeType: string
): Promise<Appraisal> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Add it to .env.local");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const result = await model.generateContent([
    { text: PROMPT },
    { inlineData: { mimeType, data: imageBase64 } },
  ]);

  const text = result.response.text();
  const parsed = JSON.parse(cleanJson(text)) as Record<string, unknown>;
  const rawType = String(parsed.mineralType ?? "unknown");

  return {
    mineralType: normalizeMineralType(rawType),
    mineralName: String(parsed.mineralName ?? "Unknown mineral").slice(0, 80),
    quality: String(parsed.quality ?? "cannot assess").slice(0, 40),
    qualityScore: clampUnit(parsed.qualityScore),
    confidence: clampUnit(parsed.confidence),
    notes: String(parsed.notes ?? "").slice(0, 300),
    rawType,
  };
}
