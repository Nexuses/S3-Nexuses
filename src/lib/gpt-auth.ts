import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function rejectUnauthorizedBearerRequest(
  request: NextRequest,
  envVar: string,
  notConfiguredMessage: string
): NextResponse | null {
  const expected = process.env[envVar]?.trim();
  if (!expected) {
    return NextResponse.json({ error: notConfiguredMessage }, { status: 503 });
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

/** Returns an error response when the bearer token is missing or wrong. */
export function rejectUnauthorizedGptRequest(request: NextRequest): NextResponse | null {
  return rejectUnauthorizedBearerRequest(
    request,
    "GPT_UPLOAD_API_KEY",
    "GPT upload is not configured"
  );
}

/** Returns an error response when the Claude MCP bearer token is missing or wrong. */
export function rejectUnauthorizedClaudeRequest(request: NextRequest): NextResponse | null {
  return rejectUnauthorizedBearerRequest(
    request,
    "CLAUDE_MCP_API_KEY",
    "Claude MCP is not configured"
  );
}
