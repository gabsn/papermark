// Self-hosted implementation (AGPL). Estimates whether a logo is mostly light
// or dark from its pixels, so the viewer can put it on a contrasting chip.
// The caller spreads `imgProps` on its own <img crossOrigin="anonymous">.
import { type SyntheticEvent, useCallback, useEffect, useState } from "react";

export type LogoTone = "light" | "dark" | "unknown";

export function useLogoTone(src: string | null | undefined): {
  tone: LogoTone;
  imgProps: { onLoad: (event: SyntheticEvent<HTMLImageElement>) => void };
} {
  const [tone, setTone] = useState<LogoTone>("unknown");

  useEffect(() => {
    setTone("unknown");
  }, [src]);

  const onLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    try {
      const size = 32;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      let total = 0;
      let weight = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        if (alpha < 0.1) continue; // ignore transparent background
        const luminance =
          (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) /
          255;
        total += luminance * alpha;
        weight += alpha;
      }
      if (weight === 0) return;
      setTone(total / weight > 0.6 ? "light" : "dark");
    } catch {
      // Canvas tainted (no CORS on the image host): keep "unknown".
    }
  }, []);

  return { tone, imgProps: { onLoad } };
}
