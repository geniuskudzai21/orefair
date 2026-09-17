import { NextResponse } from "next/server";
import { getChain, verifyChain } from "@/lib/ledger";
import { isDbConfigured } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        error: "DATABASE_URL is not configured. Add a Neon Postgres connection string to .env.local.",
      },
      { status: 503 }
    );
  }

  try {
    const [verification, chain] = await Promise.all([verifyChain(), getChain()]);
    return NextResponse.json({ configured: true, verification, chain });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not verify chain.";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}