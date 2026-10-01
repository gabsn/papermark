// Self-hosted implementation (AGPL). Deletes a team brand; links and datarooms
// that used it fall back to the team default (FKs are ON DELETE SET NULL).
// When the default itself is deleted, the oldest remaining brand becomes the
// default.
import { del } from "@vercel/blob";

import prisma from "@/lib/prisma";
import {
  clearCachedBrandLogo,
  writeCachedBrandLogo,
} from "@/lib/redis/brand-logo-cache";

type DeletableBrand = {
  id: string;
  logo?: string | null;
  banner?: string | null;
  linkPreviewImage?: string | null;
  linkPreviewFavicon?: string | null;
};

function deleteStoredAsset(url: string | null | undefined): Promise<void> {
  if (!url || url === "no-banner") return Promise.resolve();
  if (url.startsWith("/") || url.startsWith("data:")) return Promise.resolve();
  return del(url).catch(() => {});
}

export async function deleteTeamBrand({
  teamId,
  brand,
}: {
  teamId: string;
  brand: DeletableBrand;
}): Promise<void> {
  const nextDefault = await prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({
      where: { id: teamId },
      select: { defaultBrandId: true },
    });

    await tx.brand.delete({ where: { id: brand.id, teamId } });

    const wasDefault =
      !team?.defaultBrandId || team.defaultBrandId === brand.id;
    if (!wasDefault) return undefined;

    const replacement = await tx.brand.findFirst({
      where: { teamId },
      orderBy: { createdAt: "asc" },
    });
    await tx.team.update({
      where: { id: teamId },
      data: { defaultBrandId: replacement?.id ?? null },
    });
    return replacement;
  });

  if (nextDefault === null) {
    await clearCachedBrandLogo(teamId);
  } else if (nextDefault) {
    await writeCachedBrandLogo(teamId, nextDefault);
  }

  await Promise.all([
    deleteStoredAsset(brand.logo),
    deleteStoredAsset(brand.banner),
    deleteStoredAsset(brand.linkPreviewImage),
    deleteStoredAsset(brand.linkPreviewFavicon),
  ]);
}
