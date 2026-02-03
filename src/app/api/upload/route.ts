import { NextRequest, NextResponse } from "next/server";
import { uploadFileAndGetUrl, CREDENTIALS_ERROR } from "@/lib/s3";
import { requireAuth } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role === "admin") {
    return NextResponse.json(
      { error: "Admins cannot upload files. Use a user account to upload." },
      { status: 403 }
    );
  }
  try {
    const formData = await request.formData();
    const bucket = formData.get("bucket") as string | null;
    const file = formData.get("file") as File | null;

    if (!bucket?.trim()) {
      return NextResponse.json(
        { error: "Bucket name is required" },
        { status: 400 }
      );
    }
    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "Please select a file to upload" },
        { status: 400 }
      );
    }

    const key = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || undefined;

    const { objectUrl, presignedUrl } = await uploadFileAndGetUrl(
      bucket.trim(),
      key,
      buffer,
      contentType
    );

    return NextResponse.json({
      objectUrl,
      presignedUrl,
      key,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    const isCredentials = message === CREDENTIALS_ERROR;
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: message, code: isCredentials ? "CREDENTIALS_MISSING" : undefined },
      { status: isCredentials ? 503 : 500 }
    );
  }
}
