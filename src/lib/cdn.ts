import {
  CloudFrontClient,
  ListDistributionsCommand,
} from "@aws-sdk/client-cloudfront";
import { connectDB } from "@/lib/db";
import Bucket from "@/lib/models/Bucket";

/** Normalize to hostname only, e.g. "https://assets.6clicks.co/" → "assets.6clicks.co" */
export function normalizeCdnDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return d.split("/")[0] ?? "";
}

function parseEnvCdnMap(): Record<string, string> {
  const raw = process.env.BUCKET_CDN_MAP?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const map: Record<string, string> = {};
    for (const [bucket, domain] of Object.entries(parsed)) {
      const host = normalizeCdnDomain(domain);
      if (bucket && host) map[bucket.toLowerCase()] = host;
    }
    return map;
  } catch {
    console.error("Invalid BUCKET_CDN_MAP JSON in env");
    return {};
  }
}

let cloudFrontCache: { at: number; map: Record<string, string> } | null = null;
const CF_CACHE_MS = 5 * 60 * 1000;

async function getCloudFrontBucketMap(): Promise<Record<string, string>> {
  if (cloudFrontCache && Date.now() - cloudFrontCache.at < CF_CACHE_MS) {
    return cloudFrontCache.map;
  }

  const accessKey = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKey || !secretKey) return {};

  try {
    const client = new CloudFrontClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    const map: Record<string, string> = {};
    let Marker: string | undefined;
    do {
      const res = await client.send(
        new ListDistributionsCommand(Marker ? { Marker } : {})
      );
      const items = res.DistributionList?.Items ?? [];
      for (const dist of items) {
        if (dist.Enabled === false) continue;
        const aliases = dist.Aliases?.Items ?? [];
        const cfDomain = dist.DomainName;
        const preferred = aliases[0] || cfDomain;
        if (!preferred) continue;

        for (const origin of dist.Origins?.Items ?? []) {
          const domainName = origin.DomainName ?? "";
          // S3 website / REST origins look like: bucket.s3.region.amazonaws.com or bucket.s3.amazonaws.com
          const match = domainName.match(
            /^([a-z0-9][a-z0-9.-]*[a-z0-9])\.s3([.-]|$)/i
          );
          if (match?.[1]) {
            map[match[1].toLowerCase()] = preferred.toLowerCase();
          }
        }
      }
      Marker = res.DistributionList?.NextMarker;
      if (!res.DistributionList?.IsTruncated) break;
    } while (Marker);

    cloudFrontCache = { at: Date.now(), map };
    return map;
  } catch (err) {
    console.error("CloudFront distribution lookup failed:", err);
    return {};
  }
}

/**
 * Resolve CDN hostname for a bucket.
 * Order: MongoDB → BUCKET_CDN_MAP env → CloudFront distribution aliases → null
 */
export async function getCdnDomainForBucket(
  bucketName: string
): Promise<string | null> {
  const name = bucketName.trim().toLowerCase();
  if (!name) return null;

  try {
    await connectDB();
    const doc = await Bucket.findOne({ name }).lean();
    const fromDb = doc?.cdnDomain ? normalizeCdnDomain(doc.cdnDomain) : "";
    if (fromDb) return fromDb;
  } catch {
    // DB optional for CDN; continue to other sources
  }

  const fromEnv = parseEnvCdnMap()[name];
  if (fromEnv) return fromEnv;

  const fromCf = (await getCloudFrontBucketMap())[name];
  if (fromCf) return fromCf;

  return null;
}

/** Build public object URL — CDN when available, otherwise S3. */
export async function buildPublicObjectUrl(
  bucket: string,
  key: string,
  region: string
): Promise<{ objectUrl: string; cdnDomain: string | null }> {
  const cdnDomain = await getCdnDomainForBucket(bucket);
  if (cdnDomain) {
    return {
      objectUrl: `https://${cdnDomain}/${key}`,
      cdnDomain,
    };
  }
  return {
    objectUrl: `https://${bucket}.s3.${region}.amazonaws.com/${key}`,
    cdnDomain: null,
  };
}

export async function upsertBucketCdn(
  bucketName: string,
  cdnDomain: string
): Promise<void> {
  await connectDB();
  const name = bucketName.trim().toLowerCase();
  const domain = normalizeCdnDomain(cdnDomain);
  await Bucket.findOneAndUpdate(
    { name },
    { name, cdnDomain: domain },
    { upsert: true, new: true }
  );
}

export async function getBucketCdnMap(
  bucketNames: string[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const envMap = parseEnvCdnMap();
  let cfMap: Record<string, string> = {};

  try {
    await connectDB();
    const docs = await Bucket.find({
      name: { $in: bucketNames.map((b) => b.toLowerCase()) },
    }).lean();
    for (const doc of docs) {
      const host = doc.cdnDomain ? normalizeCdnDomain(doc.cdnDomain) : "";
      if (host) map[doc.name] = host;
    }
  } catch {
    // ignore
  }

  try {
    cfMap = await getCloudFrontBucketMap();
  } catch {
    // ignore
  }

  for (const name of bucketNames) {
    const key = name.toLowerCase();
    if (map[key]) continue;
    if (envMap[key]) {
      map[key] = envMap[key];
      continue;
    }
    if (cfMap[key]) map[key] = cfMap[key];
  }

  return map;
}
