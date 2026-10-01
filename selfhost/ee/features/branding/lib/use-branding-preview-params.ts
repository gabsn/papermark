// Self-hosted implementation (AGPL). Read by the *_ppreview_demo pages shown
// in an iframe of the branding editor: seeded from the query string, then
// updated live by postMessage from BrandingPreviewChrome (same origin only).
import { useRouter } from "next/router";

import { useEffect, useState } from "react";

export const BRANDING_PREVIEW_MESSAGE = "papermark:branding-preview-params";
/** Sent by the preview page to its parent once it listens for params. */
export const BRANDING_PREVIEW_READY = "papermark:branding-preview-ready";

export type BrandingPreviewParams = {
  brandLogo?: string;
  hideLogo?: string;
  brandColor?: string;
  brandBanner?: string;
  accentColor?: string;
  accentButtonColor?: string;
  applyAccentColorToDataroomView?: string;
  welcomeMessage?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  cardLayout?: string;
  showFolderTree?: string;
  viewerHeaderStyle?: string;
  hideFolderIconsInMain?: string;
};

function fromQuery(
  query: Record<string, string | string[] | undefined>,
): BrandingPreviewParams {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") out[key] = first;
  }
  return out as BrandingPreviewParams;
}

export function useBrandingPreviewParams(): BrandingPreviewParams {
  const router = useRouter();
  const [live, setLive] = useState<BrandingPreviewParams | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        params?: Record<string, unknown>;
      } | null;
      if (data?.type !== BRANDING_PREVIEW_MESSAGE || !data.params) return;
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(data.params)) {
        if (typeof value === "string") next[key] = value;
      }
      setLive(next as BrandingPreviewParams);
    };
    window.addEventListener("message", onMessage);
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: BRANDING_PREVIEW_READY },
        window.location.origin,
      );
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return live ?? fromQuery(router.query);
}
