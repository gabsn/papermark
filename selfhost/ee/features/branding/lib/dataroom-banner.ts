// Self-hosted implementation (AGPL). Classifies a saved dataroom banner value
// ("no-banner" sentinel, image URL, video file URL or YouTube link).

export type DataroomBannerKind = "none" | "image" | "video" | "youtube";

export type ClassifiedDataroomBanner = {
  kind: DataroomBannerKind;
  src: string | null;
  youtubeId?: string;
};

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i;

function youtubeIdFrom(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") {
    return url.pathname.slice(1).split("/")[0] || null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const match = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
    if (match) return match[2];
  }
  return null;
}

export function classifyDataroomBanner(
  src: string | null | undefined,
): ClassifiedDataroomBanner {
  const value = src?.trim();
  if (!value || value === "no-banner") return { kind: "none", src: null };

  if (value.startsWith("data:")) {
    return {
      kind: value.startsWith("data:video/") ? "video" : "image",
      src: value,
    };
  }

  try {
    const url = new URL(value, "http://localhost");
    const youtubeId = youtubeIdFrom(url);
    if (youtubeId && /^[\w-]{6,20}$/.test(youtubeId)) {
      return { kind: "youtube", src: value, youtubeId };
    }
    if (VIDEO_EXTENSIONS.test(url.pathname)) {
      return { kind: "video", src: value };
    }
  } catch {
    // Not a URL: treat as an image path.
  }

  return { kind: "image", src: value };
}
