// Self-hosted tus data store (AGPL, written for this fork). Papermark hosted routes
// uploads to a per-team region; a self-hosted instance has one storage location, so this
// is the plain S3Store (aliased to selfhost/shims/tus-s3-store.ts) on that location.
import { S3Store } from "@tus/s3-store";

import { getStorageConfig } from "./config";

const PART_SIZE = 8 * 1024 * 1024;

export class MultiRegionS3Store extends S3Store {
  constructor() {
    const config = getStorageConfig();
    super({
      partSize: PART_SIZE,
      s3ClientConfig: {
        bucket: config.bucket,
        region: config.region,
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      },
    });
  }
}
