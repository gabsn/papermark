// Self-hosted replacement for "@vercel/blob": public blobs (logos, banners, link
// preview images, CSV exports) stored under dataPath("files", "public", ...) and
// served by pages/api/selfhost/public/[...path].ts.
// This module is also bundled for the browser (lib/files/get-file.ts), so it
// must not import Node built-ins statically (see selfhost/lib/node.ts).
import { baseUrl, nodeCrypto } from "../lib/node";
import * as store from "../lib/object-store";
import { PUBLIC_ROUTE, encodeKeyPath } from "../lib/signing";

export class BlobError extends Error {
  constructor(message: string) {
    super(`Vercel Blob: ${message}`);
    this.name = "BlobError";
  }
}
export class BlobNotFoundError extends BlobError {
  constructor() {
    super("The requested blob does not exist");
    this.name = "BlobNotFoundError";
  }
}

export type PutBlobResult = {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
};

export type HeadBlobResult = PutBlobResult & {
  size: number;
  uploadedAt: Date;
  cacheControl: string;
};

type PutOptions = {
  access?: "public" | "private";
  addRandomSuffix?: boolean;
  allowOverwrite?: boolean;
  contentType?: string;
  cacheControlMaxAge?: number;
  token?: string;
  multipart?: boolean;
};

const ONE_MONTH = 30 * 24 * 60 * 60; // Vercel Blob's default cacheControlMaxAge

export const blobUrl = (pathname: string) =>
  `${baseUrl()}${PUBLIC_ROUTE}/${encodeKeyPath(pathname)}`;

export function getDownloadUrl(url: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("download", "1");
  return parsed.toString();
}

/** Blob pathname from one of our blob URLs (or a bare pathname); null for foreign URLs. */
export function pathnameFromUrl(urlOrPathname: string): string | null {
  let url: URL;
  try {
    url = new URL(urlOrPathname);
  } catch {
    return urlOrPathname.replace(/^\/+/, "");
  }
  const prefix = `${PUBLIC_ROUTE}/`;
  if (!url.pathname.startsWith(prefix)) return null;
  return url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
}

/** Vercel-style random suffix: "logo.png" -> "logo-<21 chars>.png". */
export function withRandomSuffix(pathname: string) {
  const suffix = nodeCrypto()
    .randomBytes(16)
    .toString("base64url")
    .replace(/[-_]/g, "")
    .slice(0, 21);
  const slash = pathname.lastIndexOf("/");
  const dot = pathname.lastIndexOf(".");
  return dot > slash + 1
    ? `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}`
    : `${pathname}-${suffix}`;
}

const contentDisposition = (pathname: string) =>
  `inline; filename="${(pathname.split("/").pop() ?? "file").replace(/"/g, "")}"`;

const toResult = (info: store.ObjectInfo): HeadBlobResult => ({
  url: blobUrl(info.key),
  downloadUrl: getDownloadUrl(blobUrl(info.key)),
  pathname: info.key,
  contentType: info.contentType ?? store.guessContentType(info.key),
  contentDisposition: info.contentDisposition ?? contentDisposition(info.key),
  cacheControl: info.cacheControl ?? `public, max-age=${ONE_MONTH}`,
  size: info.size,
  uploadedAt: info.lastModified,
});

export async function put(
  pathname: string,
  body: store.BodyInput,
  options: PutOptions = {},
): Promise<PutBlobResult> {
  if (!pathname) throw new BlobError("pathname is required");
  const finalPathname = options.addRandomSuffix ? withRandomSuffix(pathname) : pathname;
  const info = await store.putObject(store.PUBLIC_AREA, finalPathname, body, {
    contentType:
      options.contentType ??
      (body instanceof Blob && body.type ? body.type : store.guessContentType(finalPathname)),
    contentDisposition: contentDisposition(finalPathname),
    cacheControl: `public, max-age=${options.cacheControlMaxAge ?? ONE_MONTH}`,
  });
  const { url, downloadUrl, contentType, contentDisposition: cd } = toResult(info);
  return { url, downloadUrl, pathname: finalPathname, contentType, contentDisposition: cd };
}

export async function head(urlOrPathname: string): Promise<HeadBlobResult> {
  const pathname = pathnameFromUrl(urlOrPathname);
  const info = pathname ? await store.statObject(store.PUBLIC_AREA, pathname) : null;
  if (!info) throw new BlobNotFoundError();
  return toResult(info);
}

export async function del(urlOrPathname: string | string[]): Promise<void> {
  const list = Array.isArray(urlOrPathname) ? urlOrPathname : [urlOrPathname];
  for (const item of list) {
    const pathname = pathnameFromUrl(item);
    // Foreign URLs (e.g. blobs from the hosted Vercel store) have nothing to delete here.
    if (pathname) await store.deleteObject(store.PUBLIC_AREA, pathname);
  }
}

export async function copy(
  fromUrlOrPathname: string,
  toPathname: string,
  options: PutOptions = {},
): Promise<PutBlobResult> {
  const from = pathnameFromUrl(fromUrlOrPathname);
  if (!from || !(await store.statObject(store.PUBLIC_AREA, from))) {
    throw new BlobNotFoundError();
  }
  const finalPathname = options.addRandomSuffix ? withRandomSuffix(toPathname) : toPathname;
  const source = (await store.statObject(store.PUBLIC_AREA, from))!;
  const info = await store.copyObject(
    { area: store.PUBLIC_AREA, key: from },
    { area: store.PUBLIC_AREA, key: finalPathname },
    {
      contentType: options.contentType ?? source.contentType,
      contentDisposition: contentDisposition(finalPathname),
      cacheControl: `public, max-age=${options.cacheControlMaxAge ?? ONE_MONTH}`,
    },
  );
  const { url, downloadUrl, contentType, contentDisposition: cd } = toResult(info);
  return { url, downloadUrl, pathname: finalPathname, contentType, contentDisposition: cd };
}

export async function list(
  options: { prefix?: string; limit?: number; cursor?: string; mode?: "expanded" | "folded" } = {},
) {
  const limit = Math.min(options.limit ?? 1000, 1000);
  const after = options.cursor ? Buffer.from(options.cursor, "base64url").toString() : "";
  const keys = (await store.listKeys(store.PUBLIC_AREA, options.prefix ?? "")).filter(
    (key) => key > after,
  );
  const page = keys.slice(0, limit);
  const blobs = [];
  for (const key of page) {
    const info = await store.statObject(store.PUBLIC_AREA, key);
    if (!info) continue;
    const { url, downloadUrl, pathname, size, uploadedAt } = toResult(info);
    blobs.push({ url, downloadUrl, pathname, size, uploadedAt });
  }
  const hasMore = keys.length > limit;
  return {
    blobs,
    hasMore,
    ...(hasMore && { cursor: Buffer.from(page[page.length - 1]).toString("base64url") }),
    folders: [] as string[],
  };
}
