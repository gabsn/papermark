// Self-hosted implementation (AGPL). Open Graph tags for a public link: the
// link's own custom meta wins, then the dataroom brand preview, then the team
// brand preview; each empty field falls through to the next enabled layer.

export type ResolvedPublicLinkMeta = {
  enableCustomMetatag: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaImage: string | null;
  metaFavicon: string;
};

type LinkMeta = {
  enableCustomMetatag: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaImage: string | null;
  metaFavicon: string | null;
};

type BrandPreview = {
  customLinkPreviewEnabled?: boolean | null;
  linkPreviewTitle?: string | null;
  linkPreviewDescription?: string | null;
  linkPreviewImage?: string | null;
  linkPreviewFavicon?: string | null;
};

const DEFAULT_FAVICON = "/favicon.ico";

function fromBrand(brand: BrandPreview | null | undefined): LinkMeta | null {
  if (!brand?.customLinkPreviewEnabled) return null;
  return {
    enableCustomMetatag: true,
    metaTitle: brand.linkPreviewTitle ?? null,
    metaDescription: brand.linkPreviewDescription ?? null,
    metaImage: brand.linkPreviewImage ?? null,
    metaFavicon: brand.linkPreviewFavicon ?? null,
  };
}

const pick = (
  layers: LinkMeta[],
  key: "metaTitle" | "metaDescription" | "metaImage" | "metaFavicon",
) => {
  for (const layer of layers) {
    const value = layer[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
};

export function resolvePublicLinkMeta({
  link,
  teamBrand,
  dataroomBrand,
  defaultTitle,
}: {
  link: LinkMeta;
  teamBrand: BrandPreview | null | undefined;
  dataroomBrand: BrandPreview | null | undefined;
  defaultTitle: string;
}): ResolvedPublicLinkMeta {
  const layers = [
    link.enableCustomMetatag ? link : null,
    fromBrand(dataroomBrand),
    fromBrand(teamBrand),
  ].filter((layer): layer is LinkMeta => layer !== null);

  if (layers.length === 0) {
    return {
      enableCustomMetatag: false,
      metaTitle: null,
      metaDescription: null,
      metaImage: null,
      metaFavicon: DEFAULT_FAVICON,
    };
  }

  return {
    enableCustomMetatag: true,
    metaTitle: pick(layers, "metaTitle") ?? defaultTitle,
    metaDescription: pick(layers, "metaDescription"),
    metaImage: pick(layers, "metaImage"),
    metaFavicon: pick(layers, "metaFavicon") ?? DEFAULT_FAVICON,
  };
}
