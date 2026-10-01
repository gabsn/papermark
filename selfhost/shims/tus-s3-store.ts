// Self-hosted replacement for "@tus/s3-store": a tus DataStore on the local
// filesystem. Bytes are appended to dataPath("files", ".tus", ...) and, once the
// upload is complete, moved to the S3 object path of the same key, where the S3
// replacement (and the tus route's onUploadFinish CopyObject) find it.
import type http from "node:http";
import type { Readable } from "node:stream";

import { DataStore, ERRORS, Upload } from "@tus/utils";

import { filesPath, nodeFs, nodeFsp, nodePath, nodeStreamPromises } from "../lib/node";
import * as store from "../lib/object-store";
import { S3 } from "./aws-client-s3";

type Options = {
  partSize?: number;
  minPartSize?: number;
  maxMultipartParts?: number;
  useTags?: boolean;
  maxConcurrentPartUploads?: number;
  expirationPeriodInMilliseconds?: number;
  cache?: unknown;
  s3ClientConfig: Record<string, unknown> & { bucket: string };
};

type UploadInfo = {
  id: string;
  size?: number;
  metadata?: Record<string, string | null>;
  creation_date?: string;
  completed?: boolean;
};

export class S3Store extends DataStore {
  // Subclasses switch `bucket` per upload (ee MultiRegionS3Store); `client` is kept for them.
  protected bucket: string;
  protected client: S3;

  constructor(options: Options) {
    super();
    const { bucket, ...clientConfig } = options.s3ClientConfig;
    this.bucket = bucket;
    this.client = new S3(clientConfig);
    this.extensions = [
      "creation",
      "creation-with-upload",
      "creation-defer-length",
      "termination",
    ];
  }

  private files(id: string) {
    store.assertSafeKey(id);
    const area = store.S3_AREA(this.bucket);
    const base = filesPath(".tus", ...area.split("/"), ...id.split("/"));
    return { area, info: `${base}.json`, data: `${base}.data` };
  }

  private async readInfo(id: string): Promise<UploadInfo> {
    try {
      return JSON.parse(await nodeFsp().readFile(this.files(id).info, "utf8"));
    } catch {
      throw ERRORS.FILE_NOT_FOUND;
    }
  }

  private async writeInfo(info: UploadInfo) {
    const file = this.files(info.id).info;
    await nodeFsp().mkdir(nodePath().dirname(file), { recursive: true });
    await nodeFsp().writeFile(`${file}.tmp`, JSON.stringify(info));
    await nodeFsp().rename(`${file}.tmp`, file);
  }

  private async dataSize(id: string) {
    try {
      return (await nodeFsp().stat(this.files(id).data)).size;
    } catch {
      return 0;
    }
  }

  private toUpload(info: UploadInfo, offset: number) {
    return new Upload({
      id: info.id,
      size: info.size,
      offset,
      metadata: info.metadata,
      creation_date: info.creation_date,
      storage: { type: "s3", path: info.id, bucket: this.bucket },
    });
  }

  async create(upload: Upload): Promise<Upload> {
    const { data } = this.files(upload.id);
    upload.creation_date = upload.creation_date ?? new Date().toISOString();
    await this.writeInfo({
      id: upload.id,
      size: upload.size,
      metadata: upload.metadata,
      creation_date: upload.creation_date,
    });
    await nodeFsp().writeFile(data, "");
    upload.storage = { type: "s3", path: upload.id, bucket: this.bucket };
    return upload;
  }

  async write(
    stream: http.IncomingMessage | Readable,
    id: string,
    offset: number,
  ): Promise<number> {
    const info = await this.readInfo(id);
    if (info.completed) return info.size ?? offset;
    const { area, data } = this.files(id);
    if ((await this.dataSize(id)) !== offset) throw ERRORS.INVALID_OFFSET;
    await nodeStreamPromises().pipeline(
      stream,
      nodeFs().createWriteStream(data, { flags: "a" }),
    );
    const newOffset = await this.dataSize(id);
    if (info.size !== undefined && newOffset >= info.size) {
      await store.putObjectFromFile(area, id, data, {
        contentType: info.metadata?.contentType ?? undefined,
      });
      await this.writeInfo({ ...info, completed: true });
    }
    return newOffset;
  }

  async getUpload(id: string): Promise<Upload> {
    const info = await this.readInfo(id);
    const offset = info.completed ? (info.size ?? 0) : await this.dataSize(id);
    return this.toUpload(info, offset);
  }

  async declareUploadLength(id: string, length: number): Promise<void> {
    const info = await this.readInfo(id);
    await this.writeInfo({ ...info, size: length });
  }

  async remove(id: string): Promise<void> {
    await this.readInfo(id);
    const { info, data } = this.files(id);
    await nodeFsp().rm(data, { force: true });
    await nodeFsp().rm(info, { force: true });
  }

  async read(id: string): Promise<Readable> {
    const info = await this.readInfo(id);
    const { area, data } = this.files(id);
    return info.completed ? store.readObject(area, id) : nodeFs().createReadStream(data);
  }

  getExpiration(): number {
    return 0;
  }

  async deleteExpired(): Promise<number> {
    return 0;
  }
}
