import { NextRequest, NextResponse } from "next/server";
import { CREDENTIALS_ERROR, listBuckets } from "@/lib/s3";
import { rejectUnauthorizedGptRequest } from "@/lib/gpt-auth";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  const unauthorized = rejectUnauthorizedGptRequest(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();
  const limit = parseLimit(searchParams.get("limit"));

  try {
    const allBuckets = await listBuckets();
    const matched = search
      ? allBuckets.filter((name) => name.toLowerCase().includes(search))
      : allBuckets;
    const buckets = matched.slice(0, limit).map((name) => ({ id: name, name }));

    return NextResponse.json({
      buckets,
      total: matched.length,
      limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list buckets";
    const isCredentials = message === CREDENTIALS_ERROR;
    console.error("GPT bucket list error:", err);
    return NextResponse.json(
      { error: isCredentials ? "AWS credentials are not configured" : "Failed to list buckets" },
      { status: isCredentials ? 503 : 500 }
    );
  }
}
