// Self-hosted implementation (AGPL). Read-only social card preview.

export function BrandingSocialPreviewReadonly({
  title,
  description,
  image,
  favicon,
}: {
  title: string | null | undefined;
  description: string | null | undefined;
  image: string | null | undefined;
  favicon: string | null | undefined;
}) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="aspect-[1200/630] w-full object-cover" />
      ) : (
        <div className="flex aspect-[1200/630] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
          No preview image
        </div>
      )}
      <div className="space-y-1 p-3">
        <div className="flex items-center gap-2">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={favicon} alt="" className="h-4 w-4 object-contain" />
          ) : null}
          <p className="truncate text-sm font-semibold text-foreground">
            {title || "Shared link"}
          </p>
        </div>
        {description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
