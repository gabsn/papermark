// Self-hosted replacement for "@vercel/blob/client".
// Browser: upload() asks the app's handleUploadUrl for a client token (same JSON
// protocol as Vercel), then PUTs the file to /api/selfhost/public/<pathname>.
// Server: handleUpload() answers that request with a token signed by NEXTAUTH_SECRET.
// Bundled for the browser (lib/utils.ts): no static Node imports here.
import { PUBLIC_ROUTE, encodeKeyPath, signToken } from "../lib/signing";
import { BlobError, type PutBlobResult, withRandomSuffix } from "./vercel-blob";

export type HandleUploadBody =
  | {
      type: "blob.generate-client-token";
      payload: {
        pathname: string;
        callbackUrl?: string;
        clientPayload: string | null;
        multipart: boolean;
      };
    }
  | {
      type: "blob.upload-completed";
      payload: { blob: PutBlobResult; tokenPayload?: string | null };
    };

/** Signed upload permission, decoded by pages/api/selfhost/public/[...path].ts. */
export type ClientTokenPayload = {
  p: string; // final pathname
  e: number; // expiry, unix seconds
  t?: string[]; // allowed content types ("image/*" allowed)
  m?: number; // maximum size in bytes
  c?: number; // cacheControlMaxAge
};

type GenerateTokenOptions = {
  allowedContentTypes?: string[];
  maximumSizeInBytes?: number;
  validUntil?: number; // ms timestamp
  addRandomSuffix?: boolean;
  allowOverwrite?: boolean;
  cacheControlMaxAge?: number;
  ifMatch?: string;
  tokenPayload?: string | null;
  callbackUrl?: string;
};

const ONE_HOUR = 60 * 60;

export async function handleUpload({
  body,
  onBeforeGenerateToken,
}: {
  body: HandleUploadBody;
  request?: unknown;
  token?: string;
  onBeforeGenerateToken: (
    pathname: string,
    clientPayload: string | null,
    multipart: boolean,
  ) => Promise<GenerateTokenOptions>;
  onUploadCompleted?: (event: { blob: PutBlobResult; tokenPayload?: string | null }) => Promise<void>;
}): Promise<
  | { type: "blob.generate-client-token"; clientToken: string }
  | { type: "blob.upload-completed"; response: "ok" }
> {
  if (body?.type === "blob.generate-client-token") {
    const { pathname, clientPayload, multipart } = body.payload;
    const options = await onBeforeGenerateToken(pathname, clientPayload ?? null, !!multipart);
    const payload: ClientTokenPayload = {
      p: options.addRandomSuffix ? withRandomSuffix(pathname) : pathname,
      e: options.validUntil
        ? Math.floor(options.validUntil / 1000)
        : Math.floor(Date.now() / 1000) + ONE_HOUR,
      ...(options.allowedContentTypes && { t: options.allowedContentTypes }),
      ...(options.maximumSizeInBytes && { m: options.maximumSizeInBytes }),
      ...(options.cacheControlMaxAge && { c: options.cacheControlMaxAge }),
    };
    return { type: "blob.generate-client-token", clientToken: signToken(payload) };
  }
  if (body?.type === "blob.upload-completed") {
    // Uploads land directly in the local store: no completion webhook is sent,
    // and an unsigned one must not trigger onUploadCompleted.
    return { type: "blob.upload-completed", response: "ok" };
  }
  throw new BlobError("Invalid event type");
}

const decodeTokenPayload = (token: string): ClientTokenPayload => {
  const body = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    Array.from(atob(body), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
  );
  return JSON.parse(json);
};

export async function upload(
  pathname: string,
  body: Blob | File | ArrayBuffer | string,
  options: {
    access: "public" | "private";
    handleUploadUrl: string;
    clientPayload?: string;
    contentType?: string;
    multipart?: boolean;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  },
): Promise<PutBlobResult> {
  const tokenResponse = await fetch(options.handleUploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...options.headers },
    signal: options.abortSignal,
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: {
        pathname,
        callbackUrl: typeof window !== "undefined" ? window.location.href : "",
        clientPayload: options.clientPayload ?? null,
        multipart: !!options.multipart,
      },
    } satisfies HandleUploadBody),
  });
  if (!tokenResponse.ok) {
    const error = await tokenResponse.json().catch(() => ({}));
    throw new BlobError(error.error ?? "Failed to retrieve the client token");
  }
  const { clientToken } = (await tokenResponse.json()) as { clientToken: string };
  const target = decodeTokenPayload(clientToken).p;

  const contentType =
    options.contentType ?? (body instanceof Blob && body.type ? body.type : undefined);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const response = await fetch(
    `${origin}${PUBLIC_ROUTE}/${encodeKeyPath(target)}?token=${encodeURIComponent(clientToken)}`,
    {
      method: "PUT",
      headers: contentType ? { "x-content-type": contentType } : {},
      signal: options.abortSignal,
      body,
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new BlobError(error.error ?? `Upload failed with status ${response.status}`);
  }
  return (await response.json()) as PutBlobResult;
}
