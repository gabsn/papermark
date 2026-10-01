// Object storage on the local filesystem, shared by the S3, Vercel Blob and tus
// replacements. Layout under dataPath("files"):
//   s3/<bucket>/<key>          objects of an S3 bucket
//   public/<pathname>          public blobs (Vercel Blob replacement)
//   .meta/<area>/<key>.json    content type, disposition, ETag... of each object
//   .multipart/<uploadId>/     parts of S3 multipart uploads in progress
//   .tus/<area>/<id>.json|data tus uploads in progress
//   .tmp/                      files being written, renamed into place when complete
import type { Readable } from "node:stream";

import {
  filesPath,
  nodeCrypto,
  nodeFs,
  nodeFsp,
  nodePath,
  nodeStream,
  nodeStreamPromises,
} from "./node";

export type ObjectMeta = {
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
};

export type ObjectInfo = ObjectMeta & {
  key: string;
  size: number;
  etag: string; // quoted, like S3
  lastModified: Date;
};

export type BodyInput =
  | string
  | Uint8Array
  | ArrayBuffer
  | Readable
  | ReadableStream
  | Blob
  | NodeJS.ReadableStream;

export class StoreError extends Error {
  constructor(
    public code: "NoSuchKey" | "NoSuchUpload" | "InvalidKey" | "InvalidPart",
    message: string,
  ) {
    super(message);
    this.name = code;
  }
}

export const S3_AREA = (bucket: string) => {
  if (!/^[a-z0-9][a-z0-9._-]{0,62}$/i.test(bucket) || bucket.includes("..")) {
    throw new StoreError("InvalidKey", `Invalid bucket name: ${bucket}`);
  }
  return `s3/${bucket}`;
};
export const PUBLIC_AREA = "public";

/** Rejects keys that could escape their area (.., absolute paths, NUL...). */
export function assertSafeKey(key: string) {
  const segments = key.split("/");
  const bad =
    !key ||
    key.length > 1024 ||
    key.includes("\0") ||
    key.includes("\\") ||
    segments.some((s) => s === "" || s === "." || s === "..");
  if (bad) throw new StoreError("InvalidKey", `Invalid object key: ${key}`);
}

const areaRoot = (area: string) => filesPath(...area.split("/"));

function objectFile(area: string, key: string) {
  assertSafeKey(key);
  const root = areaRoot(area);
  const file = nodePath().resolve(root, ...key.split("/"));
  if (!file.startsWith(root + nodePath().sep)) {
    throw new StoreError("InvalidKey", `Invalid object key: ${key}`);
  }
  return file;
}

const metaFile = (area: string, key: string) =>
  filesPath(".meta", ...area.split("/"), ...`${key}.json`.split("/"));

async function tmpFile() {
  const dir = filesPath(".tmp");
  await nodeFsp().mkdir(dir, { recursive: true });
  return nodePath().join(dir, nodeCrypto().randomUUID());
}

async function writeFileAtomic(file: string, data: string) {
  const tmp = await tmpFile();
  await nodeFsp().writeFile(tmp, data);
  await nodeFsp().mkdir(nodePath().dirname(file), { recursive: true });
  await nodeFsp().rename(tmp, file);
}

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await nodeFsp().readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
};

/** Converts every body type the AWS SDK and Vercel Blob accept to a Node stream. */
export function toReadable(body: BodyInput | undefined | null): Readable {
  const { Readable } = nodeStream();
  if (body === undefined || body === null) return Readable.from([]);
  if (typeof body === "string") return Readable.from([Buffer.from(body)]);
  if (body instanceof Uint8Array) return Readable.from([Buffer.from(body)]);
  if (body instanceof ArrayBuffer) return Readable.from([Buffer.from(body)]);
  if (typeof (body as Readable).pipe === "function") return body as Readable;
  if (typeof (body as Blob).arrayBuffer === "function") {
    return Readable.fromWeb((body as Blob).stream() as never);
  }
  if (typeof (body as ReadableStream).getReader === "function") {
    return Readable.fromWeb(body as never);
  }
  throw new TypeError("Unsupported body type");
}

/** Streams `body` to a temporary file; returns its path, size and MD5. */
async function spool(body: BodyInput | undefined | null) {
  const tmp = await tmpFile();
  const hash = nodeCrypto().createHash("md5");
  let size = 0;
  const { Transform } = nodeStream();
  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      size += chunk.length;
      cb(null, chunk);
    },
  });
  try {
    await nodeStreamPromises().pipeline(
      toReadable(body),
      tap,
      nodeFs().createWriteStream(tmp),
    );
  } catch (error) {
    await nodeFsp().rm(tmp, { force: true });
    throw error;
  }
  return { tmp, size, md5: hash.digest() };
}

async function md5OfFile(file: string) {
  const hash = nodeCrypto().createHash("md5");
  await nodeStreamPromises().pipeline(nodeFs().createReadStream(file), hash);
  return hash.digest("hex");
}

async function install(
  area: string,
  key: string,
  tmp: string,
  meta: ObjectMeta & { etag: string },
) {
  const file = objectFile(area, key);
  await nodeFsp().mkdir(nodePath().dirname(file), { recursive: true });
  await nodeFsp().rename(tmp, file);
  await writeFileAtomic(metaFile(area, key), JSON.stringify(meta));
  return (await statObject(area, key))!;
}

const cleanMeta = (meta: ObjectMeta): ObjectMeta => ({
  ...(meta.contentType && { contentType: meta.contentType }),
  ...(meta.contentDisposition && { contentDisposition: meta.contentDisposition }),
  ...(meta.cacheControl && { cacheControl: meta.cacheControl }),
  ...(meta.metadata &&
    Object.keys(meta.metadata).length > 0 && { metadata: meta.metadata }),
});

export async function putObject(
  area: string,
  key: string,
  body: BodyInput | undefined | null,
  meta: ObjectMeta = {},
): Promise<ObjectInfo> {
  objectFile(area, key); // validate before spooling the body
  const { tmp, md5 } = await spool(body);
  return install(area, key, tmp, {
    ...cleanMeta(meta),
    etag: `"${md5.toString("hex")}"`,
  });
}

/** Moves an existing local file into the store (tus uploads). */
export async function putObjectFromFile(
  area: string,
  key: string,
  source: string,
  meta: ObjectMeta = {},
) {
  objectFile(area, key);
  const etag = `"${await md5OfFile(source)}"`;
  const tmp = await tmpFile();
  await nodeFsp().rename(source, tmp);
  return install(area, key, tmp, { ...cleanMeta(meta), etag });
}

export async function statObject(
  area: string,
  key: string,
): Promise<ObjectInfo | null> {
  const file = objectFile(area, key);
  let stat;
  try {
    stat = await nodeFsp().stat(file);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const meta = await readJson<ObjectMeta & { etag?: string }>(
    metaFile(area, key),
  );
  return {
    contentType: guessContentType(key),
    ...meta,
    key,
    size: stat.size,
    etag: meta?.etag ?? `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`,
    lastModified: stat.mtime,
  };
}

export function readObject(
  area: string,
  key: string,
  range?: { start: number; end: number },
): Readable {
  return nodeFs().createReadStream(objectFile(area, key), range);
}

/** Removes empty folders between `dir` and `stop`, so listings stay clean. */
async function prune(dir: string, stop: string) {
  while (dir.startsWith(stop + nodePath().sep)) {
    try {
      await nodeFsp().rmdir(dir);
    } catch {
      return;
    }
    dir = nodePath().dirname(dir);
  }
}

export async function deleteObject(area: string, key: string) {
  const file = objectFile(area, key);
  const meta = metaFile(area, key);
  await nodeFsp().rm(file, { force: true });
  await nodeFsp().rm(meta, { force: true });
  await prune(nodePath().dirname(file), areaRoot(area));
  await prune(nodePath().dirname(meta), filesPath(".meta"));
}

export async function copyObject(
  from: { area: string; key: string },
  to: { area: string; key: string },
  replaceMeta?: ObjectMeta,
): Promise<ObjectInfo> {
  const source = await statObject(from.area, from.key);
  if (!source) {
    throw new StoreError("NoSuchKey", `No such key: ${from.key}`);
  }
  const meta = replaceMeta
    ? cleanMeta(replaceMeta)
    : cleanMeta({
        contentType: source.contentType,
        contentDisposition: source.contentDisposition,
        cacheControl: source.cacheControl,
        metadata: source.metadata,
      });
  if (from.area === to.area && from.key === to.key) {
    await writeFileAtomic(
      metaFile(to.area, to.key),
      JSON.stringify({ ...meta, etag: source.etag }),
    );
    return (await statObject(to.area, to.key))!;
  }
  const tmp = await tmpFile();
  await nodeFsp().copyFile(objectFile(from.area, from.key), tmp);
  return install(to.area, to.key, tmp, { ...meta, etag: source.etag });
}

/** All keys of an area starting with `prefix`, sorted. */
export async function listKeys(area: string, prefix = ""): Promise<string[]> {
  const root = areaRoot(area);
  // Only walk the folder the prefix points into.
  const dirPrefix = prefix.includes("/")
    ? prefix.slice(0, prefix.lastIndexOf("/"))
    : "";
  if (dirPrefix) {
    try {
      assertSafeKey(dirPrefix);
    } catch {
      return [];
    }
  }
  const keys: string[] = [];
  const walk = async (dir: string, rel: string) => {
    let entries;
    try {
      entries = await nodeFsp().readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const key = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(nodePath().join(dir, entry.name), key);
      } else if (entry.isFile() && key.startsWith(prefix)) {
        keys.push(key);
      }
    }
  };
  await walk(dirPrefix ? nodePath().join(root, ...dirPrefix.split("/")) : root, dirPrefix);
  return keys.sort();
}

// ---- Multipart uploads (S3 CreateMultipartUpload / UploadPart / Complete) ----

type MultipartInfo = { area: string; key: string; meta: ObjectMeta; initiated: string };

const multipartDir = (uploadId: string) => {
  if (!/^[a-f0-9]{32}$/.test(uploadId)) {
    throw new StoreError("NoSuchUpload", "The specified upload does not exist");
  }
  return filesPath(".multipart", uploadId);
};
const partName = (n: number) => `part-${String(n).padStart(5, "0")}`;

export async function createMultipartUpload(
  area: string,
  key: string,
  meta: ObjectMeta = {},
) {
  objectFile(area, key);
  const uploadId = nodeCrypto().randomBytes(16).toString("hex");
  const info: MultipartInfo = {
    area,
    key,
    meta: cleanMeta(meta),
    initiated: new Date().toISOString(),
  };
  await writeFileAtomic(
    nodePath().join(multipartDir(uploadId), "upload.json"),
    JSON.stringify(info),
  );
  return uploadId;
}

export async function getMultipartUpload(uploadId: string) {
  const info = await readJson<MultipartInfo>(
    nodePath().join(multipartDir(uploadId), "upload.json"),
  );
  if (!info) {
    throw new StoreError("NoSuchUpload", "The specified upload does not exist");
  }
  return info;
}

export async function uploadPart(
  uploadId: string,
  partNumber: number,
  body: BodyInput | undefined | null,
) {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    throw new StoreError("InvalidPart", `Invalid part number: ${partNumber}`);
  }
  await getMultipartUpload(uploadId);
  const dir = multipartDir(uploadId);
  const { tmp, md5, size } = await spool(body);
  const etag = `"${md5.toString("hex")}"`;
  await nodeFsp().rename(tmp, nodePath().join(dir, partName(partNumber)));
  await writeFileAtomic(
    nodePath().join(dir, `${partName(partNumber)}.json`),
    JSON.stringify({ etag, size, lastModified: new Date().toISOString() }),
  );
  return { etag, size };
}

export async function listParts(uploadId: string) {
  await getMultipartUpload(uploadId);
  const dir = multipartDir(uploadId);
  const parts: { partNumber: number; etag: string; size: number; lastModified: Date }[] = [];
  for (const name of (await nodeFsp().readdir(dir)).sort()) {
    const match = /^part-(\d{5})\.json$/.exec(name);
    if (!match) continue;
    const part = await readJson<{ etag: string; size: number; lastModified: string }>(
      nodePath().join(dir, name),
    );
    if (part) {
      parts.push({
        partNumber: Number(match[1]),
        etag: part.etag,
        size: part.size,
        lastModified: new Date(part.lastModified),
      });
    }
  }
  return parts;
}

export async function completeMultipartUpload(
  uploadId: string,
  requested?: { PartNumber?: number; ETag?: string }[],
): Promise<ObjectInfo> {
  const info = await getMultipartUpload(uploadId);
  const dir = multipartDir(uploadId);
  const stored = new Map((await listParts(uploadId)).map((p) => [p.partNumber, p]));
  const order = requested?.length
    ? requested.map((p) => p.PartNumber!)
    : [...stored.keys()].sort((a, b) => a - b);
  const unquote = (etag?: string) => (etag ?? "").replace(/"/g, "");
  for (const [index, partNumber] of order.entries()) {
    const part = stored.get(partNumber);
    const expected = requested?.[index]?.ETag;
    if (!part || (expected && unquote(expected) !== unquote(part.etag))) {
      throw new StoreError("InvalidPart", `Part ${partNumber} was not uploaded`);
    }
  }
  if (order.length === 0) {
    throw new StoreError("InvalidPart", "No parts were uploaded");
  }
  const tmp = await tmpFile();
  const out = nodeFs().createWriteStream(tmp);
  try {
    for (const partNumber of order) {
      await nodeStreamPromises().pipeline(
        nodeFs().createReadStream(nodePath().join(dir, partName(partNumber))),
        out,
        { end: false },
      );
    }
    await new Promise<void>((resolve, reject) =>
      out.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
  } catch (error) {
    out.destroy();
    await nodeFsp().rm(tmp, { force: true });
    throw error;
  }
  // S3's multipart ETag: md5 of the concatenated part md5s, then "-<count>".
  const digest = nodeCrypto().createHash("md5");
  for (const partNumber of order) {
    digest.update(Buffer.from(unquote(stored.get(partNumber)!.etag), "hex"));
  }
  const etag = `"${digest.digest("hex")}-${order.length}"`;
  const result = await install(info.area, info.key, tmp, { ...info.meta, etag });
  await nodeFsp().rm(dir, { recursive: true, force: true });
  return result;
}

export async function abortMultipartUpload(uploadId: string) {
  await nodeFsp().rm(multipartDir(uploadId), { recursive: true, force: true });
}

// ---- Content types ----

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  avif: "image/avif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  csv: "text/csv",
  txt: "text/plain",
  json: "application/json",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  key: "application/vnd.apple.keynote",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  dwg: "image/vnd.dwg",
  dxf: "image/vnd.dxf",
};

export function guessContentType(key: string) {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Files are served from the app's own origin: anything that could run script
 * there (HTML, SVG, XML...) gets a sandboxing CSP. PDFs, raster images, audio and
 * video are left alone (browsers refuse to render a PDF in a sandbox).
 */
export function contentSecurityPolicy(contentType: string | undefined) {
  const safe =
    /^(application\/pdf|image\/(png|jpe?g|gif|webp|avif|x-icon|vnd\.microsoft\.icon)|video\/|audio\/)/i;
  return contentType && safe.test(contentType)
    ? undefined
    : "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";
}
