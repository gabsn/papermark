// Self-hosted implementation (AGPL). Checks whether a brand lookup
// (/api/branding/auto-fill) returned anything worth applying.

export const AUTO_FILL_NOT_FOUND_MESSAGE =
  "No logo or brand colors found for this website.";

type AutoFillResult = {
  logo?: string | null;
  banner?: string | null;
  brandColor?: string | null;
  accentColor?: string | null;
  accentButtonColor?: string | null;
} | null;

export function autoFillHasBrandAssets(
  data: AutoFillResult | undefined,
  { allowBanner = false }: { allowBanner?: boolean } = {},
): boolean {
  if (!data) return false;
  return Boolean(
    data.logo ||
      data.brandColor ||
      data.accentColor ||
      data.accentButtonColor ||
      (allowBanner && data.banner),
  );
}
