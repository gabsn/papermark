// Self-hosted public blobs (the Vercel Blob replacement in selfhost/shims/vercel-blob.ts).
//   GET|HEAD                  serves the blob (?download=1 forces an attachment)
//   PUT ?token=<clientToken>  browser upload authorised by handleUpload() in
//                             selfhost/shims/vercel-blob-client.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Transform } from "node:stream";

import * as store from "@/selfhost/lib/object-store";
import { verifyToken } from "@/selfhost/lib/signing";
import { parseRange } from "@/selfhost/shims/aws-client-s3";
import { put } from "@/selfhost/shims/vercel-blob";
import type { ClientTokenPayload } from "@/selfhost/shims/vercel-blob-client";

export const config = {
  api: { bodyParser: false, responseLimit: false },
};

const typeAllowed = (contentType: string, allowed?: string[]) =>
  !allowed ||
  allowed.some((pattern) =>
    pattern.endsWith("/*")
      ? contentType.startsWith(pattern.slice(0, -1))
      : contentType === pattern,
  );

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const segments = req.query.path;
  const pathname = Array.isArray(segments) ? segments.join("/") : (segments ?? "");
  try {
    store.assertSafeKey(pathname);
  } catch {
    return res.status(400).json({ error: "Invalid pathname" });
  }

  try {
    if (req.method === "GET" || req.method === "HEAD") {
      return await serve(req, res, pathname);
    }
    if (req.method === "PUT") return await receive(req, res, pathname);
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (error) {
    console.error("[selfhost/public]", error);
    if (!res.headersSent) return res.status(500).json({ error: "Internal Server Error" });
    res.end();
  }
}

async function receive(req: NextApiRequest, res: NextApiResponse, pathname: string) {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const payload = verifyToken<ClientTokenPayload>(token);
  if (!payload || payload.p !== pathname) {
    return res.status(403).json({ error: "Invalid or expired upload token" });
  }
  const contentType = String(
    req.headers["x-content-type"] ?? req.headers["content-type"] ?? store.guessContentType(pathname),
  );
  if (!typeAllowed(contentType, payload.t)) {
    return res.status(400).json({ error: `Content type ${contentType} is not allowed` });
  }
  const max = payload.m;
  if (max && Number(req.headers["content-length"] ?? 0) > max) {
    return res.status(413).json({ error: "File is too large" });
  }
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      cb(max && received > max ? new Error("File is too large") : null, chunk);
    },
  });
  try {
    const blob = await put(pathname, req.pipe(limiter), {
      access: "public",
      contentType,
      cacheControlMaxAge: payload.c,
    });
    return res.status(200).json(blob);
  } catch (error) {
    if (max && received > max) return res.status(413).json({ error: "File is too large" });
    throw error;
  }
}

async function serve(req: NextApiRequest, res: NextApiResponse, pathname: string) {
  const info = await store.statObject(store.PUBLIC_AREA, pathname);
  if (!info) return res.status(404).json({ error: "Not found" });

  const contentType = info.contentType ?? "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  const csp = store.contentSecurityPolicy(contentType);
  if (csp) res.setHeader("Content-Security-Policy", csp);
  const filename = (pathname.split("/").pop() ?? "file").replace(/"/g, "");
  res.setHeader(
    "Content-Disposition",
    req.query.download ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`,
  );
  res.setHeader("Cache-Control", info.cacheControl ?? "public, max-age=2592000");
  res.setHeader("ETag", info.etag);
  res.setHeader("Last-Modified", info.lastModified.toUTCString());
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.headers["if-none-match"] === info.etag) return res.status(304).end();

  const range = parseRange(req.headers.range, info.size);
  if (range === null) {
    res.setHeader("Content-Range", `bytes */${info.size}`);
    return res.status(416).end();
  }
  if (range) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${info.size}`);
    res.setHeader("Content-Length", String(range.end - range.start + 1));
  } else {
    res.status(200);
    res.setHeader("Content-Length", String(info.size));
  }
  if (req.method === "HEAD") return res.end();

  const stream = store.readObject(store.PUBLIC_AREA, pathname, range);
  stream.on("error", (error) => res.destroy(error));
  stream.pipe(res);
}
