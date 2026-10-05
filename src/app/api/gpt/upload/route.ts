import { NextRequest, NextResponse } from "next/server";
import { CREDENTIALS_ERROR, listBuckets, uploadFileAndGetUrl } from "@/lib/s3";
import { rejectUnauthorizedGptRequest } from "@/lib/gpt-auth";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base
    .replace(/\.\./g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 180);
  return cleaned || "file";
}

function dateFolder(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function POST(request: NextRequest) {
  const unauthorized = rejectUnauthorizedGptRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const formData = await request.formData();
    const bucketInput = formData.get("bucket");
    const file = formData.get("file");
    const bucket =
      typeof bucketInput === "string" ? bucketInput.trim() : "";

    if (!bucket) {
      return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "A file is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds the 20 MB limit" }, { status: 400 });
    }

    const availableBuckets = await listBuckets();
    const actualBucket = availableBuckets.find(
      (name) => name.toLowerCase() === bucket.toLowerCase()
    );
    if (!actualBucket) {
      return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
    }

    const now = new Date();
    const key = `chatgpt/${dateFolder(now)}/${now.getTime()}-${sanitizeFilename(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { objectUrl, presignedUrl, cdnDomain } = await uploadFileAndGetUrl(
      actualBucket,
      key,
      buffer,
      file.type || undefined
    );

    return NextResponse.json({
      success: true,
      bucket: actualBucket,
      key,
      url: objectUrl,
      presignedUrl: presignedUrl ?? null,
      cdnDomain: cdnDomain ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    const isCredentials = message === CREDENTIALS_ERROR;
    console.error("GPT upload error:", err);
    return NextResponse.json(
      { error: isCredentials ? "AWS credentials are not configured" : "Upload failed" },
      { status: isCredentials ? 503 : 500 }
    );
  }
}
