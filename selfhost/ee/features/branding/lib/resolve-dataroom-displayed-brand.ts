// Self-hosted implementation (AGPL). A dataroom shows either a team Brand
// (Dataroom.brandId, or the link's brandId) or its own DataroomBrand row
// ("custom dataroom brand"), whose empty fields fall back to the team brand.
import type { Brand, DataroomBrand } from "@prisma/client";

/** Select value meaning "use this dataroom's own DataroomBrand". */
export const CUSTOM_DATAROOM_BRAND = "custom-dataroom-brand";
export const CUSTOM_DATAROOM_BRAND_LABEL = "Custom dataroom brand";

/**
 * True when the displayed brand is a team brand: the link picked one, the
 * dataroom is attached to one, or the dataroom has no brand row of its own.
 */
export function inheritsTeamBrand({
  linkBrandId,
  dataroomBrandId,
  hasDataroomBrand,
}: {
  linkBrandId?: string | null;
  dataroomBrandId?: string | null;
  hasDataroomBrand: boolean;
}): boolean {
  if (linkBrandId) return true;
  if (dataroomBrandId) return true;
  return !hasDataroomBrand;
}

type DisplayedBrand = Partial<Brand> | Partial<DataroomBrand>;

export function resolveDisplayedDataroomBrand({
  dataroomBrand,
  teamBrand,
  inheritTeamBrand,
}: {
  dataroomBrand: Partial<DataroomBrand> | null | undefined;
  teamBrand: Partial<Brand> | null | undefined;
  inheritTeamBrand: boolean;
}): DisplayedBrand | null {
  if (inheritTeamBrand || !dataroomBrand) return teamBrand ?? null;

  const merged: Record<string, unknown> = { ...(teamBrand ?? {}) };
  for (const [key, value] of Object.entries(dataroomBrand)) {
    if (value !== null && value !== undefined) merged[key] = value;
  }
  return merged as DisplayedBrand;
}
