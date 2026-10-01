// HMAC signatures (NEXTAUTH_SECRET) for the URLs and upload tokens that replace
// S3 presigned URLs, CloudFront signed URLs and Vercel Blob client tokens.
import { baseUrl, nodeCrypto } from "./node";

export const FILES_ROUTE = "/api/selfhost/files";
export const PUBLIC_ROUTE = "/api/selfhost/public";

const secret = () => {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is required to sign file URLs");
  return value;
};

const hmac = (message: string) =>
  nodeCrypto()
    .createHmac("sha256", `selfhost-files:${secret()}`)
    .update(message)
    .digest("base64url");

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && nodeCrypto().timingSafeEqual(ab, bb);
};

const canonical = (key: string, params: Record<string, string>) =>
  [
    key,
    ...Object.keys(params)
      .filter((name) => name !== "sig")
      .sort()
      .map((name) => `${name}=${params[name]}`),
  ].join("\n");

export const encodeKeyPath = (key: string) =>
  key.split("/").map(encodeURIComponent).join("/");

export type FileOp = "get" | "put" | "part";

/** URL of the files route, valid until `expiresAt` (unix seconds). */
export function signedFileUrl({
  key,
  op,
  expiresAt,
  params = {},
}: {
  key: string;
  op: FileOp;
  expiresAt: number;
  params?: Record<string, string | undefined>;
}) {
  const all: Record<string, string> = { op, exp: String(Math.floor(expiresAt)) };
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") all[name] = value;
  }
  const query = new URLSearchParams(all);
  query.set("sig", hmac(canonical(key, all)));
  return `${baseUrl()}${FILES_ROUTE}/${encodeKeyPath(key)}?${query}`;
}

/** Checks signature and expiry; returns the signed parameters or an error. */
export function verifyFileUrl(
  key: string,
  query: URLSearchParams,
): { ok: true; params: Record<string, string> } | { ok: false; error: string } {
  const params: Record<string, string> = {};
  query.forEach((value, name) => {
    if (name !== "sig") params[name] = value;
  });
  const sig = query.get("sig");
  if (!sig || !safeEqual(sig, hmac(canonical(key, params)))) {
    return { ok: false, error: "Invalid signature" };
  }
  const exp = Number(params.exp);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) {
    return { ok: false, error: "Request has expired" };
  }
  return { ok: true, params };
}

/** Compact signed token `<base64url(json)>.<hmac>` carrying an expiry `e` (unix seconds). */
export function signToken(payload: Record<string, unknown> & { e: number }) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(`token\n${body}`)}`;
}

export function verifyToken<T extends { e: number }>(token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, hmac(`token\n${body}`))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    return payload.e >= Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}
