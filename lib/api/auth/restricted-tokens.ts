// API token subject types. Written for the self-hosted fork: the module is imported by
// the core but missing upstream. A "user" token belongs to the member who created it and
// dies with their team membership; a "machine" token stays with the team.
import { z } from "zod";

import prisma from "@/lib/prisma";

export const RestrictedTokenSubjectTypeSchema = z.enum(["user", "machine"]);

export type RestrictedTokenSubjectType = z.infer<typeof RestrictedTokenSubjectTypeSchema>;

/** Stored values are free strings; anything unknown is treated as a user token. */
export function parseRestrictedTokenSubjectType(
  value: string | null | undefined,
): RestrictedTokenSubjectType {
  const parsed = RestrictedTokenSubjectTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : "user";
}

/** Revoke the user-bound tokens a member holds in a team (called when they are removed). */
export async function revokeUserBoundTeamTokens(userId: string, teamId: string) {
  return prisma.restrictedToken.deleteMany({
    where: { userId, teamId, subjectType: { not: "machine" } },
  });
}
