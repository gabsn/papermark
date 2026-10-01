// Self-hosted implementation (AGPL). Saving a dataroom's own brand detaches
// the dataroom from any team brand (Dataroom.brandId = null), so the custom
// DataroomBrand row is what visitors see.
import { DataroomBrand, Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

export type DataroomBrandWriteData = Omit<
  Prisma.DataroomBrandUncheckedCreateInput,
  "id" | "dataroomId" | "createdAt" | "updatedAt"
>;

export async function upsertDataroomBrandAndClearInherited({
  dataroomId,
  teamId,
  data,
}: {
  dataroomId: string;
  teamId: string;
  data: DataroomBrandWriteData;
}): Promise<DataroomBrand> {
  return prisma.$transaction(async (tx) => {
    const brand = await tx.dataroomBrand.upsert({
      where: { dataroomId },
      create: { ...data, dataroomId },
      update: data,
    });
    await tx.dataroom.update({
      where: { id: dataroomId, teamId },
      data: { brandId: null },
    });
    return brand;
  });
}
