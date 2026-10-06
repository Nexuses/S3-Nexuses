import { NextRequest } from "next/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { CREDENTIALS_ERROR, listBuckets, uploadFileAndGetUrl } from "@/lib/s3";
import { rejectUnauthorizedClaudeRequest } from "@/lib/gpt-auth";
import { dateFolder, sanitizeFilename } from "@/lib/upload-key";

export const dynamic = "force-dynamic";

const MAX_BUCKET_RESULTS = 50;
const MAX_FILE_SIZE = 3 * 1024 * 1024;
const BASE64_PATTERN = /^[A-Za-z0-9+/_-]*={0,2}$/;

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function awsErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : fallback;
  return message === CREDENTIALS_ERROR ? "AWS credentials are not configured" : fallback;
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_buckets",
      {
        description: "Find S3 buckets by project name. Always call this before uploading.",
        inputSchema: {
          search: z
            .string()
            .optional()
            .describe("Case-insensitive substring of the bucket name, e.g. the project name."),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ search }) => {
        try {
          const query = (search ?? "").trim().toLowerCase();
          const allBuckets = await listBuckets();
          const matched = query
            ? allBuckets.filter((name) => name.toLowerCase().includes(query))
            : allBuckets;
          return textResult({
            buckets: matched.slice(0, MAX_BUCKET_RESULTS),
            total: matched.length,
          });
        } catch (err) {
          console.error("MCP bucket list error:", err);
          return errorResult(awsErrorMessage(err, "Failed to list buckets"));
        }
      }
    );

    server.registerTool(
      "upload_file",
      {
        description:
          "Upload a file to S3. Before calling, ask the user which project, find the bucket with list_buckets, and confirm the bucket name with the user.",
        inputSchema: {
          bucket: z.string().describe("Exact bucket name returned by list_buckets."),
          filename: z.string().describe("File name including extension, e.g. report.pdf."),
          content_base64: z.string().describe("File contents encoded as base64 (max 3 MB decoded)."),
          content_type: z
            .string()
            .optional()
            .describe("MIME type of the file, e.g. image/png."),
        },
      },
      async ({ bucket, filename, content_base64, content_type }) => {
        const bucketName = bucket.trim();
        if (!bucketName) return errorResult("Bucket name is required");

        const encoded = content_base64.replace(/\s/g, "");
        if (!encoded || !BASE64_PATTERN.test(encoded)) {
          return errorResult("content_base64 must be a non-empty base64 string");
        }
        if (Math.floor((encoded.replace(/=+$/, "").length * 3) / 4) > MAX_FILE_SIZE) {
          return errorResult("File exceeds the 3 MB limit");
        }
        const buffer = Buffer.from(encoded, "base64");
        if (buffer.length === 0) return errorResult("File is empty");
        if (buffer.length > MAX_FILE_SIZE) return errorResult("File exceeds the 3 MB limit");

        try {
          const availableBuckets = await listBuckets();
          const actualBucket = availableBuckets.find(
            (name) => name.toLowerCase() === bucketName.toLowerCase()
          );
          if (!actualBucket) {
            return errorResult(`Invalid bucket "${bucketName}". Use list_buckets to find a valid name.`);
          }

          const now = new Date();
          const key = `claude/${dateFolder(now)}/${now.getTime()}-${sanitizeFilename(filename)}`;
          const { objectUrl } = await uploadFileAndGetUrl(
            actualBucket,
            key,
            buffer,
            content_type?.trim() || undefined
          );

          return textResult({ url: objectUrl, key, bucket: actualBucket });
        } catch (err) {
          console.error("MCP upload error:", err);
          return errorResult(awsErrorMessage(err, "Upload failed"));
        }
      }
    );
  },
  { serverInfo: { name: "s3-nexuses", version: "0.1.0" } },
  { basePath: "/api", disableSse: true, maxDuration: 60 }
);

async function authenticatedHandler(request: NextRequest): Promise<Response> {
  const unauthorized = rejectUnauthorizedClaudeRequest(request);
  if (unauthorized) return unauthorized;
  return handler(request);
}

export { authenticatedHandler as GET, authenticatedHandler as POST, authenticatedHandler as DELETE };
