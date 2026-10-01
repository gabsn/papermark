// Self-hosted replacement for "@aws-sdk/lib-storage": the filesystem store has
// no part-size limits, so an Upload is a single streamed PutObject.
import { EventEmitter } from "node:events";

import { PutObjectCommand, type S3Client } from "./aws-client-s3";

type UploadOptions = {
  client: S3Client;
  params: Record<string, any> & { Bucket: string; Key: string };
  queueSize?: number;
  partSize?: number;
  leavePartsOnError?: boolean;
  tags?: { Key: string; Value: string }[];
};

export class Upload extends EventEmitter {
  private aborted = false;
  constructor(private readonly options: UploadOptions) {
    super();
  }

  async done() {
    if (this.aborted) throw Object.assign(new Error("Upload aborted."), { name: "AbortError" });
    const { client, params } = this.options;
    const result = await client.send(new PutObjectCommand(params));
    this.emit("httpUploadProgress", { Bucket: params.Bucket, Key: params.Key, part: 1 });
    return {
      $metadata: result.$metadata,
      Bucket: params.Bucket,
      Key: params.Key,
      ETag: result.ETag as string,
      Location: `/${params.Bucket}/${params.Key}`,
    };
  }

  async abort() {
    this.aborted = true;
  }
}
