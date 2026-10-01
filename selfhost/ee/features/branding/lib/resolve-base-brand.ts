// Self-hosted implementation (AGPL). Resolves which team Brand row applies:
// the link's brand, then the dataroom's base brand, then the team default
// (Team.defaultBrandId), then the team's oldest brand.
import { Brand, Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

/** Fields the viewer (document and dataroom) reads from a team brand. */
export const teamBrandViewerSelect = {
  id: true,
  logo: true,
  hideLogo: true,
  banner: true,
  brandColor: true,
  accentColor: true,
  accentButtonColor: true,
  applyAccentColorToDataroomView: true,
  welcomeMessage: true,
  ctaLabel: true,
  ctaUrl: true,
  privacyPolicyUrl: true,
  cardLayout: true,
  showFolderTree: true,
  viewerLayoutPreset: true,
  viewerHeaderStyle: true,
  hideFolderIconsInMain: true,
  defaultLanguage: true,
} satisfies Prisma.BrandSelect;

/** Fields a workflow (entry) link page reads. */
export const teamBrandWorkflowSelect = {
  id: true,
  logo: true,
  hideLogo: true,
  brandColor: true,
  accentColor: true,
  accentButtonColor: true,
  welcomeMessage: true,
  privacyPolicyUrl: true,
  defaultLanguage: true,
} satisfies Prisma.BrandSelect;

/** Open Graph / social preview defaults. */
export const teamBrandOgSelect = {
  customLinkPreviewEnabled: true,
  linkPreviewTitle: true,
  linkPreviewDescription: true,
  linkPreviewImage: true,
  linkPreviewFavicon: true,
} satisfies Prisma.BrandSelect;

async function findTeamBrand<S extends Prisma.BrandSelect>(
  teamId: string,
  brandId: string,
  select: S,
) {
  return (await prisma.brand.findFirst({
    where: { id: brandId, teamId },
    select,
  })) as Prisma.BrandGetPayload<{ select: S }> | null;
}

/** The team's default brand id, falling back to its oldest brand. */
export async function resolveDefaultBrandId(
  teamId: string,
): Promise<string | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { defaultBrandId: true },
  });
  if (team?.defaultBrandId) return team.defaultBrandId;

  const oldest = await prisma.brand.findFirst({
    where: { teamId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return oldest?.id ?? null;
}

/** Returns `brandId` when it belongs to the team, otherwise null. */
export async function resolveOwnedBrandId(
  teamId: string,
  brandId: string | null | undefined,
): Promise<string | null> {
  if (!brandId) return null;
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, teamId },
    select: { id: true },
  });
  return brand?.id ?? null;
}

export async function resolveBaseBrand<S extends Prisma.BrandSelect>({
  teamId,
  linkBrandId,
  dataroomBrandId,
  select,
}: {
  teamId: string;
  linkBrandId?: string | null;
  dataroomBrandId?: string | null;
  select: S;
}): Promise<Prisma.BrandGetPayload<{ select: S }> | null> {
  for (const candidate of [linkBrandId, dataroomBrandId]) {
    if (!candidate) continue;
    const brand = await findTeamBrand(teamId, candidate, select);
    if (brand) return brand;
  }

  const defaultId = await resolveDefaultBrandId(teamId);
  if (!defaultId) return null;
  return findTeamBrand(teamId, defaultId, select);
}

/** Full row of the team default brand (GET /api/teams/:teamId/branding). */
export async function findDefaultBrand(teamId: string): Promise<Brand | null> {
  const defaultId = await resolveDefaultBrandId(teamId);
  if (!defaultId) return null;
  return prisma.brand.findFirst({ where: { id: defaultId, teamId } });
}

/**
 * Update the team default brand, or create it (and mark it default) when the
 * team has no brand yet.
 */
export async function persistDefaultBrand({
  teamId,
  create,
  update,
}: {
  teamId: string;
  create: Prisma.BrandUncheckedCreateInput;
  update: Prisma.BrandUncheckedUpdateInput;
}): Promise<Brand> {
  const existing = await findDefaultBrand(teamId);
  if (existing) {
    return prisma.brand.update({ where: { id: existing.id }, data: update });
  }

  return prisma.$transaction(async (tx) => {
    const brand = await tx.brand.create({ data: { ...create, teamId } });
    await tx.team.update({
      where: { id: teamId },
      data: { defaultBrandId: brand.id },
    });
    return brand;
  });
}
