// Self-hosted implementation (AGPL). A browser-like frame around an iframe of
// one of the *_ppreview_demo pages. The iframe loads once with the initial
// params; later changes are pushed with postMessage so it never reloads.
import { useEffect, useMemo, useRef, useState } from "react";

import {
  BRANDING_PREVIEW_MESSAGE,
  BRANDING_PREVIEW_READY,
} from "../lib/use-branding-preview-params";

export function BrandingPreviewChrome({
  name,
  basePath,
  urlLabel,
  params,
}: {
  name: string;
  basePath: string;
  urlLabel: string;
  params: Record<string, string>;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const paramsRef = useRef(params);
  const [initialParams] = useState(params);

  const src = useMemo(
    () => `${basePath}?${new URLSearchParams(initialParams).toString()}`,
    [basePath, initialParams],
  );

  // The preview page announces when it listens; (re)send the params then.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === BRANDING_PREVIEW_READY) {
        setLoaded(true);
        iframeRef.current?.contentWindow?.postMessage(
          { type: BRANDING_PREVIEW_MESSAGE, params: paramsRef.current },
          window.location.origin,
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    paramsRef.current = params;
    if (!loaded) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: BRANDING_PREVIEW_MESSAGE, params },
      window.location.origin,
    );
  }, [loaded, params]);

  return (
    <div className="flex h-full min-h-[480px] w-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-3 truncate rounded bg-background px-2 py-0.5 text-xs text-muted-foreground">
          {urlLabel}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        name={name}
        title={`${name} preview`}
        src={src}
        onLoad={() => setLoaded(true)}
        className="w-full flex-1 border-0"
        style={{ minHeight: 440 }}
      />
    </div>
  );
}
