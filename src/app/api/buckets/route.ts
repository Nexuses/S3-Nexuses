import { NextRequest, NextResponse } from "next/server";
import { listBuckets, createBucket, deleteBucket, CREDENTIALS_ERROR } from "@/lib/s3";
import { requireAuth, requireAdmin } from "@/lib/session";
import bcrypt from "bcrypt";
import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Bucket from "@/lib/models/Bucket";
import { getBucketCdnMap, normalizeCdnDomain, upsertBucketCdn } from "@/lib/cdn";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  try {
    const buckets = await listBuckets();
    const cdnMap = await getBucketCdnMap(buckets);
    return NextResponse.json({ buckets, cdnMap });
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

export async function DELETE(request: NextRequest) {
  const session = await requireAuth(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const bucket = typeof body.bucket === "string" ? body.bucket.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!bucket) {
      return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }
    await connectDB();
    const user = await User.findOne({ email: session.user.email }).select("+password");
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }
    await deleteBucket(bucket);
    await Bucket.deleteOne({ name: bucket.toLowerCase() }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete bucket";
    const isCredentials = message === CREDENTIALS_ERROR;
    console.error("Delete bucket error:", err);
    return NextResponse.json(
      { error: message, code: isCredentials ? "CREDENTIALS_MISSING" : undefined },
      { status: isCredentials ? 503 : 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const bucket = typeof body.bucket === "string" ? body.bucket.trim() : "";
    const cdnDomain =
      typeof body.cdnDomain === "string" ? normalizeCdnDomain(body.cdnDomain) : "";
    if (!bucket) {
      return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
    }
    await upsertBucketCdn(bucket, cdnDomain);
    return NextResponse.json({
      bucket: bucket.toLowerCase(),
      cdnDomain: cdnDomain || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update CDN domain";
    console.error("Update CDN error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
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
    const cdnDomain =
      typeof body.cdnDomain === "string" ? normalizeCdnDomain(body.cdnDomain) : "";
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
    if (cdnDomain) {
      await upsertBucketCdn(name, cdnDomain);
    }
    const buckets = await listBuckets();
    const cdnMap = await getBucketCdnMap(buckets);
    return NextResponse.json({
      bucket: name.toLowerCase(),
      buckets,
      cdnMap,
      cdnDomain: cdnDomain || null,
    });
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
