// Self-hosted implementation (AGPL). Open Graph defaults (title, description,
// image, favicon). Images are kept as data URLs; the page uploads them on save.
import { type ChangeEvent, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function readImage(
  event: ChangeEvent<HTMLInputElement>,
  onChange: (value: string | null) => void,
) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > MAX_IMAGE_BYTES || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => onChange(reader.result as string);
  reader.readAsDataURL(file);
}

function ImageField({
  id,
  label,
  value,
  onChange,
  previewClassName,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  previewClassName: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={previewClassName} />
        ) : null}
        <Input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/x-icon,image/svg+xml"
          onChange={(e) => readImage(e, onChange)}
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function BrandingLinkPreviewForm({
  enabled,
  onEnabledChange,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  imageUrl,
  onImageChange,
  faviconUrl,
  onFaviconChange,
  inheritanceHint,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  imageUrl: string | null;
  onImageChange: (value: string | null) => void;
  faviconUrl: string | null;
  onFaviconChange: (value: string | null) => void;
  inheritanceHint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <Label htmlFor={`${id}-enabled`}>Custom Link Preview</Label>
          {inheritanceHint ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {inheritanceHint}
            </p>
          ) : null}
        </div>
        <Switch
          id={`${id}-enabled`}
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>
      {enabled ? (
        <div className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-title`}>Title</Label>
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={120}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-description`}>Description</Label>
            <Textarea
              id={`${id}-description`}
              value={description}
              maxLength={300}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />
          </div>
          <ImageField
            id={`${id}-image`}
            label="Image (1200×630 recommended, max 2 MB)"
            value={imageUrl}
            onChange={onImageChange}
            previewClassName="h-12 w-20 rounded border object-cover"
          />
          <ImageField
            id={`${id}-favicon`}
            label="Favicon"
            value={faviconUrl}
            onChange={onFaviconChange}
            previewClassName="h-8 w-8 rounded border object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
