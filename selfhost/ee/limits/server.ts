// Self-hosted plan limits (AGPL, written for this fork): every team is unlimited.
// Usage counts are still returned because some screens display them.
import { z } from "zod";

import { TeamError } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";

import { UNLIMITED_LIMITS } from "./constants";

const limit = z.number().nullable(); // null = unlimited (JSON has no Infinity)

export const configSchema = z.object({
  datarooms: limit,
  links: limit,
  documents: limit,
  users: limit,
  domains: limit,
  customDomainOnPro: z.boolean().optional(),
  customDomainInDataroom: z.boolean().optional(),
  advancedLinkControlsOnPro: z.boolean().nullish(),
  watermarkOnBusiness: z.boolean().nullish(),
  agreementOnBusiness: z.boolean().nullish(),
  conversationsInDataroom: z.boolean().nullish(),
  linkCustomFields: z.number().nullish(),
  fileSizeLimits: z
    .object({
      video: limit.optional(), // MB
      document: limit.optional(), // MB
      image: limit.optional(), // MB
      excel: limit.optional(), // MB
      maxFiles: limit.optional(),
      maxPages: limit.optional(),
    })
    .optional(),
});

export type LimitsConfig = z.infer<typeof configSchema>;

export async function getLimits({
  teamId,
  userId,
}: {
  teamId: string;
  userId: string;
}) {
  const team = await prisma.team.findUnique({
    where: { id: teamId, users: { some: { userId } } },
    select: {
      _count: { select: { documents: true, links: true, users: true } },
    },
  });
  if (!team) {
    throw new TeamError("Team not found");
  }

  return {
    ...(UNLIMITED_LIMITS as LimitsConfig),
    usage: {
      documents: team._count.documents,
      links: team._count.links,
      users: team._count.users,
    },
    dataroomUpload: true,
  };
}
