// Self-hosted replacement for "@vercel/functions". The Node server keeps running after a
// response, so waitUntil only has to keep a reference and report failures. The client IP
// and location come from the reverse proxy's headers (Vercel's, Cloudflare's, or the
// standard X-Forwarded-For / X-Real-IP).
type HeadersLike = Headers | Record<string, string | string[] | undefined>;
type RequestLike = { headers: HeadersLike };

const background = new Set<Promise<unknown>>();

export function waitUntil(promise: Promise<unknown>) {
  const tracked: Promise<unknown> = Promise.resolve(promise)
    .catch((error) => console.error("[waitUntil] background task failed:", error))
    .finally(() => background.delete(tracked));
  background.add(tracked);
}

function header(request: RequestLike, name: string): string | undefined {
  const { headers } = request;
  const value =
    typeof (headers as Headers).get === "function"
      ? (headers as Headers).get(name)
      : (headers as Record<string, string | string[] | undefined>)[name];
  return (Array.isArray(value) ? value[0] : value) ?? undefined;
}

export function ipAddress(request: RequestLike): string | undefined {
  const forwarded = header(request, "x-forwarded-for")?.split(",")[0]?.trim();
  return (
    header(request, "x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    header(request, "cf-connecting-ip") ||
    forwarded ||
    header(request, "x-real-ip") ||
    undefined
  );
}

// "FR" → 🇫🇷
const flag = (country?: string) =>
  country && /^[A-Z]{2}$/.test(country)
    ? String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : undefined;

const decoded = (value?: string) => (value ? decodeURIComponent(value) : undefined);

export function geolocation(request: RequestLike) {
  const country = header(request, "x-vercel-ip-country") ?? header(request, "cf-ipcountry");
  return {
    city: decoded(header(request, "x-vercel-ip-city") ?? header(request, "cf-ipcity")),
    country,
    flag: flag(country),
    countryRegion:
      header(request, "x-vercel-ip-country-region") ?? header(request, "cf-region-code"),
    region: "selfhost",
    latitude: header(request, "x-vercel-ip-latitude") ?? header(request, "cf-iplatitude"),
    longitude: header(request, "x-vercel-ip-longitude") ?? header(request, "cf-iplongitude"),
    postalCode:
      header(request, "x-vercel-ip-postal-code") ?? header(request, "cf-postal-code"),
  };
}
