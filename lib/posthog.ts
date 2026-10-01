export function getPostHogConfig(): { key: string; host: string } | null {
  // selfhost: no product analytics (posthog-js is a no-op shim). Server-side only: the
  // flag is not exposed to the browser, where the missing key already disables it.
  if (process.env.PAPERMARK_SELFHOST === "1") {
    return null;
  }

  const postHogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const postHogHost = `${process.env.NEXT_PUBLIC_BASE_URL}/ingest`;

  if (!postHogKey || !postHogHost) {
    return null;
  }

  return {
    key: postHogKey,
    host: postHogHost,
  };
}
