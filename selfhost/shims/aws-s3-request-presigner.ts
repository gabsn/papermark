// Self-hosted replacement for "@aws-sdk/s3-request-presigner": instead of an S3
// URL, returns a URL on the app itself (pages/api/selfhost/files/[...key].ts),
// signed with NEXTAUTH_SECRET and valid for `expiresIn` seconds.
import { signedFileUrl } from "../lib/signing";
import type { Command, S3Client } from "./aws-client-s3";

const DEFAULT_EXPIRES_IN = 900; // seconds, the SDK default

export async function getSignedUrl(
  _client: S3Client,
  command: Command,
  options: { expiresIn?: number } = {},
): Promise<string> {
  const { op, bucket, key, params } = command.presign();
  const expiresIn = options.expiresIn ?? DEFAULT_EXPIRES_IN;
  return signedFileUrl({
    key,
    op,
    expiresAt: Date.now() / 1000 + expiresIn,
    params: { ...params, b: bucket },
  });
}
