import { NextRequest, NextResponse } from "next/server";
import { listBuckets, createBucket, CREDENTIALS_ERROR } from "@/lib/s3";
import { requireAuth, requireAdmin } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  try {
    const buckets = await listBuckets();
    return NextResponse.json({ buckets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list buckets";
    const isCredentials = message === CREDENTIALS_ERROR;
    console.error("List buckets error:", err);
    return NextResponse.json(
      { error: message, code: isCredentials ? "CREDENTIALS_MISSING" : undefined },
      { status: isCredentials ? 503 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Bucket name is required" },
        { status: 400 }
      );
    }
    await createBucket(name, {
      makePublic: Boolean(body.makePublic),
      addCors: Boolean(body.addCors),
    });
    const buckets = await listBuckets();
    return NextResponse.json({ bucket: name.toLowerCase(), buckets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create bucket";
    const isCredentials = message === CREDENTIALS_ERROR;
    console.error("Create bucket error:", err);
    return NextResponse.json(
      { error: message, code: isCredentials ? "CREDENTIALS_MISSING" : undefined },
      { status: isCredentials ? 503 : 500 }
    );
  }
}
