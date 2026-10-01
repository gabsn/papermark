// Self-hosted implementation (AGPL). Banner field of the branding editors:
// the page supplies the upload drop zone; this adds "use a URL" (image,
// video or YouTube link) and "no banner".
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BannerEditor({
  banner,
  setBanner,
  setBannerBlobUrl,
  sizeHint,
  defaultBannerImage,
  onUrlApplied,
  dropZone,
}: {
  banner: string | null;
  setBanner: (value: string | null) => void;
  setBannerBlobUrl: (value: string | null) => void;
  sizeHint?: string;
  defaultBannerImage?: string;
  onUrlApplied?: () => void;
  dropZone: ReactNode;
}) {
  const [url, setUrl] = useState("");
  const hidden = banner === "no-banner";

  const applyUrl = () => {
    const value = url.trim();
    if (!/^https:\/\//i.test(value)) return;
    setBanner(value);
    setBannerBlobUrl(null);
    setUrl("");
    onUrlApplied?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="banner">
          Banner{" "}
          {sizeHint ? (
            <span className="text-xs font-normal text-muted-foreground">
              {sizeHint}
            </span>
          ) : null}
        </Label>
        <div className="flex gap-2">
          {defaultBannerImage && banner !== defaultBannerImage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setBanner(defaultBannerImage);
                setBannerBlobUrl(null);
              }}
            >
              Default
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setBanner(hidden ? (defaultBannerImage ?? null) : "no-banner");
              setBannerBlobUrl(null);
            }}
          >
            {hidden ? "Show banner" : "No banner"}
          </Button>
        </div>
      </div>

      {hidden ? (
        <p className="text-xs text-muted-foreground">
          No banner is shown to visitors.
        </p>
      ) : (
        dropZone
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Or paste an image, video or YouTube URL (https://…)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyUrl();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!/^https:\/\//i.test(url.trim())}
          onClick={applyUrl}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
