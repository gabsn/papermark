// Self-hosted storage configuration (AGPL, written for this fork). One storage location
// for every team, read from the NEXT_PRIVATE_UPLOAD_* variables (selfhost/env.example);
// the S3 client behind it is the filesystem replacement in selfhost/shims/aws-client-s3.ts.

export interface StorageConfig {
  bucket: string;
  advancedBucket?: string;
  archiveBucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  distributionHost?: string;
  advancedDistributionHost?: string;
  distributionKeyId?: string;
  distributionKeyContents?: string;
  lambdaFunctionName?: string;
}

const optional = (name: string) => process.env[name] || undefined;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name} (see selfhost/env.example)`);
  }
  return value;
}

/** `storageRegion` is ignored: a self-hosted instance has a single storage location. */
export function getStorageConfig(_storageRegion?: string): StorageConfig {
  const bucket = required("NEXT_PRIVATE_UPLOAD_BUCKET");
  return {
    bucket,
    advancedBucket: optional("NEXT_PRIVATE_ADVANCED_UPLOAD_BUCKET"),
    archiveBucket: optional("NEXT_PRIVATE_ARCHIVE_BUCKET") ?? `${bucket}-archive`,
    region: optional("NEXT_PRIVATE_UPLOAD_REGION") ?? "local",
    accessKeyId: optional("NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID") ?? "local",
    secretAccessKey: optional("NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY") ?? "local",
    endpoint: optional("NEXT_PRIVATE_UPLOAD_ENDPOINT"),
    distributionHost: optional("NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST"),
    advancedDistributionHost: optional("NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST"),
    distributionKeyId: optional("NEXT_PRIVATE_UPLOAD_DISTRIBUTION_KEY_ID"),
    distributionKeyContents: optional("NEXT_PRIVATE_UPLOAD_DISTRIBUTION_KEY_CONTENTS"),
    lambdaFunctionName: optional("NEXT_PRIVATE_LAMBDA_FUNCTION_NAME"),
  };
}

export async function getTeamStorageConfigById(_teamId: string): Promise<StorageConfig> {
  return getStorageConfig();
}
