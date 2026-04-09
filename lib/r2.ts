import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "cardiocan-videos";

function getR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Upload a video buffer to R2.
 * Returns the R2 object key for later retrieval.
 */
export async function uploadVideoToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return key;
}

/**
 * Generate a time-limited presigned URL to view/download a video from R2.
 * Default expiration: 1 hour.
 */
export async function getVideoPresignedUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const client = getR2Client();

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }),
    { expiresIn: expiresInSeconds }
  );

  return url;
}

/**
 * Delete a video from R2.
 */
export async function deleteVideoFromR2(key: string): Promise<void> {
  const client = getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

/**
 * Build the R2 object key for a measurement video.
 * Format: videos/{dogId}/{measurementId}.{ext}
 */
export function buildVideoKey(
  dogId: string,
  measurementId: string,
  contentType: string
): string {
  const ext =
    contentType === "video/quicktime"
      ? "mov"
      : contentType === "video/mp4"
        ? "mp4"
        : "webm";
  return `videos/${dogId}/${measurementId}.${ext}`;
}
