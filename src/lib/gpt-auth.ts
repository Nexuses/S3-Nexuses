import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Returns an error response when the bearer token is missing or wrong. */
export function rejectUnauthorizedGptRequest(request: NextRequest): NextResponse | null {
  const expected = process.env.GPT_UPLOAD_API_KEY?.trim();
  if (!expected) {
    return NextResponse.json({ error: "GPT upload is not configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const provided = digest(token);
  const required = digest(expected);
  if (!timingSafeEqual(provided, required)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
