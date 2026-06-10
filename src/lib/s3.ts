import {
  S3Client,
  ListBucketsCommand,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  type BucketLocationConstraint,
  type CreateBucketCommandInput,
  PutPublicAccessBlockCommand,
  PutBucketPolicyCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const CREDENTIALS_ERROR =
  "AWS credentials not configured. Create a .env.local file in the project root with AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and optionally AWS_REGION, then restart the dev server (npm run dev).";

function getS3Client() {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKey?.trim() || !secretKey?.trim()) {
    throw new Error(CREDENTIALS_ERROR);
  }
  const region = process.env.AWS_REGION ?? "us-east-1";
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: accessKey.trim(),
      secretAccessKey: secretKey.trim(),
    },
  });
  return { client, region };
}

export async function listBuckets(): Promise<string[]> {
  const { client } = getS3Client();
  const { Buckets } = await client.send(new ListBucketsCommand({}));
  return (Buckets ?? []).map((b) => b.Name!).filter(Boolean);
}

/** S3 bucket names: 3–63 chars, lowercase, no underscore */
export function isValidBucketName(name: string): boolean {
  return /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name) && !name.includes("..");
}

export type CreateBucketOptions = {
  makePublic?: boolean;
  addCors?: boolean;
};

export async function createBucket(
  bucketName: string,
  options: CreateBucketOptions = {}
): Promise<void> {
  const { client, region } = getS3Client();
  const name = bucketName.trim().toLowerCase();

  if (!isValidBucketName(name)) {
    throw new Error(
      "Bucket name must be 3–63 characters, lowercase letters/numbers/hyphens only, no double hyphens or adjacent periods."
    );
  }

  const createParams: CreateBucketCommandInput = {
    Bucket: name,
  };
  if (region !== "us-east-1") {
    createParams.CreateBucketConfiguration = {
      LocationConstraint: region as BucketLocationConstraint,
    };
  }
  await client.send(new CreateBucketCommand(createParams));

  if (options.makePublic) {
    await client.send(
      new PutPublicAccessBlockCommand({
        Bucket: name,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          IgnorePublicAcls: false,
          BlockPublicPolicy: false,
          RestrictPublicBuckets: false,
        },
      })
    );
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadGetObject",
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${name}/*`,
        },
      ],
    };
    await client.send(
      new PutBucketPolicyCommand({
        Bucket: name,
        Policy: JSON.stringify(policy),
      })
    );
  }

  if (options.addCors) {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: name,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "PUT", "POST", "HEAD", "DELETE"],
              AllowedOrigins: ["*"],
              ExposeHeaders: ["ETag"],
            },
          ],
        },
      })
    );
  }
}

export async function deleteBucket(bucketName: string): Promise<void> {
  const { client } = getS3Client();
  await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
}

export async function uploadFileAndGetUrl(
  bucket: string,
  key: string,
  body: Buffer,
  contentType?: string
): Promise<{ objectUrl: string; presignedUrl?: string }> {
  const { client, region } = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType ?? undefined,
    })
  );

  const objectUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  const presignedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 3600 }
  );

  return { objectUrl, presignedUrl };
}
