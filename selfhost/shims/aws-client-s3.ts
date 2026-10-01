// Self-hosted replacement for "@aws-sdk/client-s3": the commands used by the app,
// executed against the local filesystem store (selfhost/lib/object-store.ts).
// Objects live under dataPath("files", "s3", <bucket>, <key>).
import type { Readable } from "node:stream";

import * as store from "../lib/object-store";
import { nodeStream } from "../lib/node";

type Input = Record<string, any>;

/** Error shaped like the SDK's ServiceException (name, $metadata.httpStatusCode). */
export class S3ServiceException extends Error {
  $fault: "client" | "server";
  $metadata: { httpStatusCode: number };
  Code: string;
  constructor(name: string, message: string, httpStatusCode: number) {
    super(message);
    this.name = name;
    this.Code = name;
    this.$fault = httpStatusCode >= 500 ? "server" : "client";
    this.$metadata = { httpStatusCode };
  }
}
export class NoSuchKey extends S3ServiceException {
  constructor(message = "The specified key does not exist.") {
    super("NoSuchKey", message, 404);
  }
}
export class NotFound extends S3ServiceException {
  constructor(message = "Not Found") {
    super("NotFound", message, 404);
  }
}
export class NoSuchUpload extends S3ServiceException {
  constructor(message = "The specified upload does not exist.") {
    super("NoSuchUpload", message, 404);
  }
}

const translate = (error: unknown): unknown => {
  if (!(error instanceof store.StoreError)) return error;
  switch (error.code) {
    case "NoSuchKey":
      return new NoSuchKey(error.message);
    case "NoSuchUpload":
      return new NoSuchUpload(error.message);
    case "InvalidPart":
      return new S3ServiceException("InvalidPart", error.message, 400);
    default:
      return new S3ServiceException("InvalidArgument", error.message, 400);
  }
};

const meta = (input: Input): store.ObjectMeta => ({
  contentType: input.ContentType,
  contentDisposition: input.ContentDisposition,
  cacheControl: input.CacheControl,
  metadata: input.Metadata,
});

const output = <T extends Input>(extra: T = {} as T) => ({
  $metadata: { httpStatusCode: 200, attempts: 1, totalRetryDelay: 0 },
  ...extra,
});

/** What the presigner needs to build an app URL for a command. */
export type PresignTarget = {
  op: "get" | "put" | "part";
  bucket: string;
  key: string;
  params: Record<string, string | undefined>;
};

export abstract class Command<I extends Input = Input, O = any> {
  readonly middlewareStack = { add() {}, use() {}, remove() {} };
  constructor(readonly input: I) {}
  abstract execute(client: S3Client): Promise<O>;
  presign(): PresignTarget {
    throw new Error(`${this.constructor.name} cannot be presigned in self-hosted mode`);
  }
}

// GetObject Body: a Node stream with the SDK's stream mixin helpers.
export type StreamingBody = Readable & {
  transformToByteArray(): Promise<Uint8Array>;
  transformToString(encoding?: BufferEncoding): Promise<string>;
  transformToWebStream(): ReadableStream;
};

const withMixin = (stream: Readable): StreamingBody => {
  const collect = async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  };
  return Object.assign(stream, {
    transformToByteArray: async () => new Uint8Array(await collect()),
    transformToString: async (encoding: BufferEncoding = "utf8") =>
      (await collect()).toString(encoding),
    transformToWebStream: () =>
      nodeStream().Readable.toWeb(stream) as unknown as ReadableStream,
  });
};

/** Parses a single "bytes=a-b" range against `size`. */
export function parseRange(header: string | undefined, size: number) {
  const match = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return undefined;
  let start: number;
  let end: number;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return null; // unsatisfiable
  return { start, end };
}

export class PutObjectCommand extends Command {
  async execute() {
    const info = await store.putObject(
      store.S3_AREA(this.input.Bucket),
      this.input.Key,
      this.input.Body,
      meta(this.input),
    );
    return output({ ETag: info.etag });
  }
  presign(): PresignTarget {
    return {
      op: "put",
      bucket: this.input.Bucket,
      key: this.input.Key,
      params: { ct: this.input.ContentType, cd: this.input.ContentDisposition },
    };
  }
}

const headers = (info: store.ObjectInfo) => ({
  ContentLength: info.size,
  ContentType: info.contentType,
  ContentDisposition: info.contentDisposition,
  CacheControl: info.cacheControl,
  ETag: info.etag,
  LastModified: info.lastModified,
  Metadata: info.metadata ?? {},
  AcceptRanges: "bytes",
});

export class GetObjectCommand extends Command {
  async execute() {
    const area = store.S3_AREA(this.input.Bucket);
    const info = await store.statObject(area, this.input.Key);
    if (!info) throw new NoSuchKey();
    const range = parseRange(this.input.Range, info.size);
    if (range === null) {
      throw new S3ServiceException("InvalidRange", "The requested range is not satisfiable", 416);
    }
    return output({
      ...headers(info),
      ...(this.input.ResponseContentType && { ContentType: this.input.ResponseContentType }),
      ...(this.input.ResponseContentDisposition && {
        ContentDisposition: this.input.ResponseContentDisposition,
      }),
      ...(range && {
        ContentLength: range.end - range.start + 1,
        ContentRange: `bytes ${range.start}-${range.end}/${info.size}`,
      }),
      Body: withMixin(store.readObject(area, this.input.Key, range)),
    });
  }
  presign(): PresignTarget {
    return {
      op: "get",
      bucket: this.input.Bucket,
      key: this.input.Key,
      params: {
        rct: this.input.ResponseContentType,
        rcd: this.input.ResponseContentDisposition,
        rcc: this.input.ResponseCacheControl,
      },
    };
  }
}

export class HeadObjectCommand extends Command {
  async execute() {
    const info = await store.statObject(store.S3_AREA(this.input.Bucket), this.input.Key);
    if (!info) throw new NotFound();
    return output(headers(info));
  }
  presign(): PresignTarget {
    return { op: "get", bucket: this.input.Bucket, key: this.input.Key, params: {} };
  }
}

export class DeleteObjectCommand extends Command {
  async execute() {
    await store.deleteObject(store.S3_AREA(this.input.Bucket), this.input.Key);
    return output({});
  }
}

export class DeleteObjectsCommand extends Command {
  async execute() {
    const area = store.S3_AREA(this.input.Bucket);
    const Deleted: { Key: string }[] = [];
    const Errors: { Key: string; Code: string; Message: string }[] = [];
    for (const { Key } of (this.input.Delete?.Objects ?? []) as { Key: string }[]) {
      try {
        await store.deleteObject(area, Key);
        Deleted.push({ Key });
      } catch (error) {
        Errors.push({ Key, Code: "InternalError", Message: String(error) });
      }
    }
    return output({ Deleted, ...(Errors.length && { Errors }) });
  }
}

/** "bucket/key", "/bucket/key", optionally URL-encoded, as S3 accepts. */
function parseCopySource(source: string) {
  const raw = source.replace(/^\//, "").split("?")[0];
  const slash = raw.indexOf("/");
  if (slash <= 0) {
    throw new S3ServiceException("InvalidArgument", `Invalid CopySource: ${source}`, 400);
  }
  return { bucket: raw.slice(0, slash), key: raw.slice(slash + 1) };
}

export class CopyObjectCommand extends Command {
  async execute() {
    const src = parseCopySource(this.input.CopySource);
    const from = { area: store.S3_AREA(src.bucket), key: src.key };
    if (!(await store.statObject(from.area, from.key))) {
      // The SDK expects an encoded CopySource; the app passes raw keys. Accept both.
      try {
        const decoded = decodeURIComponent(src.key);
        if (await store.statObject(from.area, decoded)) from.key = decoded;
      } catch {}
    }
    const info = await store.copyObject(
      from,
      { area: store.S3_AREA(this.input.Bucket), key: this.input.Key },
      this.input.MetadataDirective === "REPLACE" ? meta(this.input) : undefined,
    );
    return output({
      CopyObjectResult: { ETag: info.etag, LastModified: info.lastModified },
    });
  }
}

export class ListObjectsV2Command extends Command {
  async execute() {
    const { Bucket, Prefix = "", Delimiter, StartAfter, ContinuationToken } = this.input;
    const maxKeys = Math.min(this.input.MaxKeys ?? 1000, 1000);
    const area = store.S3_AREA(Bucket);
    const after = ContinuationToken
      ? Buffer.from(ContinuationToken, "base64url").toString()
      : StartAfter;
    const keys = (await store.listKeys(area, Prefix)).filter((k) => !after || k > after);

    const Contents: Input[] = [];
    const prefixes = new Set<string>();
    let last: string | undefined;
    let truncated = false;
    for (const key of keys) {
      if (Contents.length + prefixes.size >= maxKeys) {
        truncated = true;
        break;
      }
      last = key;
      if (Delimiter) {
        const rest = key.slice(Prefix.length);
        const cut = rest.indexOf(Delimiter);
        if (cut >= 0) {
          prefixes.add(Prefix + rest.slice(0, cut + Delimiter.length));
          continue;
        }
      }
      const info = await store.statObject(area, key);
      if (!info) continue;
      Contents.push({
        Key: key,
        Size: info.size,
        ETag: info.etag,
        LastModified: info.lastModified,
        StorageClass: "STANDARD",
      });
    }
    const CommonPrefixes = [...prefixes].map((p) => ({ Prefix: p }));
    return output({
      Name: Bucket,
      Prefix,
      MaxKeys: maxKeys,
      KeyCount: Contents.length + CommonPrefixes.length,
      IsTruncated: truncated,
      ...(Contents.length && { Contents }),
      ...(CommonPrefixes.length && { CommonPrefixes }),
      ...(Delimiter && { Delimiter }),
      ...(ContinuationToken && { ContinuationToken }),
      ...(truncated && last && {
        NextContinuationToken: Buffer.from(last).toString("base64url"),
      }),
    });
  }
}

export class CreateMultipartUploadCommand extends Command {
  async execute() {
    const UploadId = await store.createMultipartUpload(
      store.S3_AREA(this.input.Bucket),
      this.input.Key,
      meta(this.input),
    );
    return output({ Bucket: this.input.Bucket, Key: this.input.Key, UploadId });
  }
}

/** Ensures `UploadId` belongs to `Bucket`/`Key`, like S3 does. */
async function checkUpload(input: Input) {
  const info = await store.getMultipartUpload(input.UploadId);
  if (info.area !== store.S3_AREA(input.Bucket) || info.key !== input.Key) {
    throw new NoSuchUpload();
  }
}

export class UploadPartCommand extends Command {
  async execute() {
    await checkUpload(this.input);
    const { etag } = await store.uploadPart(
      this.input.UploadId,
      Number(this.input.PartNumber),
      this.input.Body,
    );
    return output({ ETag: etag });
  }
  presign(): PresignTarget {
    return {
      op: "part",
      bucket: this.input.Bucket,
      key: this.input.Key,
      params: { uid: this.input.UploadId, pn: String(this.input.PartNumber) },
    };
  }
}

export class CompleteMultipartUploadCommand extends Command {
  async execute() {
    await checkUpload(this.input);
    const info = await store.completeMultipartUpload(
      this.input.UploadId,
      this.input.MultipartUpload?.Parts,
    );
    return output({
      Bucket: this.input.Bucket,
      Key: this.input.Key,
      ETag: info.etag,
      Location: `/${this.input.Bucket}/${this.input.Key}`,
    });
  }
}

export class AbortMultipartUploadCommand extends Command {
  async execute() {
    await checkUpload(this.input);
    await store.abortMultipartUpload(this.input.UploadId);
    return output({});
  }
}

export class ListPartsCommand extends Command {
  async execute() {
    await checkUpload(this.input);
    const marker = Number(this.input.PartNumberMarker ?? 0);
    const max = this.input.MaxParts ?? 1000;
    const all = (await store.listParts(this.input.UploadId)).filter(
      (p) => p.partNumber > marker,
    );
    const parts = all.slice(0, max);
    return output({
      Bucket: this.input.Bucket,
      Key: this.input.Key,
      UploadId: this.input.UploadId,
      IsTruncated: all.length > max,
      ...(all.length > max && {
        NextPartNumberMarker: String(parts[parts.length - 1].partNumber),
      }),
      Parts: parts.map((p) => ({
        PartNumber: p.partNumber,
        ETag: p.etag,
        Size: p.size,
        LastModified: p.lastModified,
      })),
    });
  }
}

export class HeadBucketCommand extends Command {
  async execute() {
    store.S3_AREA(this.input.Bucket);
    return output({});
  }
}

export class S3Client {
  readonly config: Input;
  readonly middlewareStack = { add() {}, use() {}, remove() {} };
  constructor(config: Input = {}) {
    this.config = config;
  }
  async send<O>(command: Command<Input, O>): Promise<O> {
    if (!command || typeof command.execute !== "function") {
      throw new Error("Unsupported S3 command in self-hosted mode");
    }
    try {
      return await command.execute(this);
    } catch (error) {
      throw translate(error);
    }
  }
  destroy() {}
}

/** Aggregated client (`new S3(config).putObject(input)`), used by @tus/s3-store callers. */
export class S3 extends S3Client {
  putObject = (input: Input) => this.send(new PutObjectCommand(input));
  getObject = (input: Input) => this.send(new GetObjectCommand(input));
  headObject = (input: Input) => this.send(new HeadObjectCommand(input));
  deleteObject = (input: Input) => this.send(new DeleteObjectCommand(input));
  deleteObjects = (input: Input) => this.send(new DeleteObjectsCommand(input));
  copyObject = (input: Input) => this.send(new CopyObjectCommand(input));
  listObjectsV2 = (input: Input) => this.send(new ListObjectsV2Command(input));
  createMultipartUpload = (input: Input) =>
    this.send(new CreateMultipartUploadCommand(input));
  uploadPart = (input: Input) => this.send(new UploadPartCommand(input));
  completeMultipartUpload = (input: Input) =>
    this.send(new CompleteMultipartUploadCommand(input));
  abortMultipartUpload = (input: Input) =>
    this.send(new AbortMultipartUploadCommand(input));
  listParts = (input: Input) => this.send(new ListPartsCommand(input));
}
