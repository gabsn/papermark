// Self-hosted replacement for "@aws-sdk/cloudfront-signer": the "distribution"
// is the app itself. The URL's path is the object key in the default upload
// bucket; the result is a signed URL to pages/api/selfhost/files/[...key].ts.
import { signedFileUrl } from "../lib/signing";

type CloudfrontSignInput = {
  url: string;
  keyPairId?: string;
  privateKey?: string | Buffer;
  dateLessThan?: string | number | Date;
  dateGreaterThan?: string | number | Date;
  policy?: string;
  passphrase?: string;
};

const DEFAULT_LIFETIME = 3600; // seconds, when neither a date nor a policy is given

function expiresAt({ dateLessThan, policy }: CloudfrontSignInput): number {
  if (dateLessThan !== undefined) {
    const date = new Date(dateLessThan);
    if (!Number.isNaN(date.getTime())) return date.getTime() / 1000;
  }
  if (policy) {
    const parsed = JSON.parse(policy) as {
      Statement?: { Condition?: { DateLessThan?: { "AWS:EpochTime"?: number } } }[];
    };
    const epoch = parsed.Statement?.[0]?.Condition?.DateLessThan?.["AWS:EpochTime"];
    if (typeof epoch === "number") return epoch;
  }
  return Date.now() / 1000 + DEFAULT_LIFETIME;
}

export function getSignedUrl(input: CloudfrontSignInput): string {
  const url = new URL(input.url);
  const key = url.pathname
    .replace(/^\/+/, "")
    .split("/")
    .map(decodeURIComponent)
    .join("/");
  const bucket = process.env.NEXT_PRIVATE_UPLOAD_BUCKET;
  if (!bucket) throw new Error("Missing environment variable: NEXT_PRIVATE_UPLOAD_BUCKET");
  return signedFileUrl({
    key,
    op: "get",
    expiresAt: expiresAt(input),
    params: {
      b: bucket,
      rcd: url.searchParams.get("response-content-disposition") ?? undefined,
      rct: url.searchParams.get("response-content-type") ?? undefined,
    },
  });
}

export function getSignedCookies(): never {
  throw new Error("CloudFront signed cookies are not supported in self-hosted mode");
}
