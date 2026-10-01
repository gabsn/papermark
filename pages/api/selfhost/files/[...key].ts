// Self-hosted file endpoint: serves and receives the objects of the filesystem
// S3 replacement through URLs signed by selfhost/lib/signing.ts (the stand-in for
// S3 presigned URLs and CloudFront signed URLs).
//   GET|HEAD ?op=get   download (Range supported)
//   PUT      ?op=put   whole-object upload (presigned PutObject)
//   PUT      ?op=part  multipart part upload; answers with an ETag header like S3
import type { NextApiRequest, NextApiResponse } from "next";

import { verifyFileUrl } from "@/selfhost/lib/signing";
import * as store from "@/selfhost/lib/object-store";
import { parseRange } from "@/selfhost/shims/aws-client-s3";

export const config = {
  api: { bodyParser: false, responseLimit: false },
};

function cors(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ?? "Content-Type, Range",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "ETag, Content-Length, Content-Range, Content-Disposition, Accept-Ranges",
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const segments = req.query.key;
  const key = Array.isArray(segments) ? segments.join("/") : (segments ?? "");
  const query = new URL(req.url ?? "", "http://localhost").searchParams;
  const verified = verifyFileUrl(key, query);
  if (!verified.ok) return res.status(403).json({ error: verified.error });
  const { params } = verified;

  let area: string;
  try {
    const bucket = params.b ?? process.env.NEXT_PRIVATE_UPLOAD_BUCKET;
    if (!bucket) throw new Error("No bucket");
    area = store.S3_AREA(bucket);
    store.assertSafeKey(key);
  } catch {
    return res.status(400).json({ error: "Invalid object key" });
  }

  try {
    if (params.op === "get" && (req.method === "GET" || req.method === "HEAD")) {
      return await serve(req, res, area, key, params);
    }
    if (params.op === "put" && req.method === "PUT") {
      const info = await store.putObject(area, key, req, {
        contentType: params.ct ?? req.headers["content-type"],
        contentDisposition: params.cd ?? req.headers["content-disposition"],
      });
      res.setHeader("ETag", info.etag);
      return res.status(200).end();
    }
    if (params.op === "part" && req.method === "PUT") {
      const upload = await store.getMultipartUpload(params.uid ?? "");
      if (upload.area !== area || upload.key !== key) {
        return res.status(404).json({ error: "The specified upload does not exist" });
      }
      const { etag } = await store.uploadPart(params.uid!, Number(params.pn), req);
      res.setHeader("ETag", etag);
      return res.status(200).end();
    }
    return res.status(405).json({ error: "Method not allowed for this URL" });
  } catch (error) {
    if (error instanceof store.StoreError) {
      const status = error.code === "InvalidKey" || error.code === "InvalidPart" ? 400 : 404;
      return res.status(status).json({ error: error.message });
    }
    console.error("[selfhost/files]", error);
    if (!res.headersSent) return res.status(500).json({ error: "Internal Server Error" });
    res.end();
  }
}

async function serve(
  req: NextApiRequest,
  res: NextApiResponse,
  area: string,
  key: string,
  params: Record<string, string>,
) {
  const info = await store.statObject(area, key);
  if (!info) return res.status(404).json({ error: "The specified key does not exist" });

  const maxAge = Math.max(0, Math.min(Number(params.exp) - Math.floor(Date.now() / 1000), 3600));
  const contentType = params.rct ?? info.contentType ?? "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  const csp = store.contentSecurityPolicy(contentType);
  if (csp) res.setHeader("Content-Security-Policy", csp);
  const disposition = params.rcd ?? info.contentDisposition;
  if (disposition) res.setHeader("Content-Disposition", disposition);
  res.setHeader("Cache-Control", params.rcc ?? `private, max-age=${maxAge}`);
  res.setHeader("ETag", info.etag);
  res.setHeader("Last-Modified", info.lastModified.toUTCString());
  res.setHeader("Accept-Ranges", "bytes");
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

  const stream = store.readObject(area, key, range);
  stream.on("error", (error) => {
    console.error("[selfhost/files] read error", error);
    res.destroy(error);
  });
  stream.pipe(res);
}
