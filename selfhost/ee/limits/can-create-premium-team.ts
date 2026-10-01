// Self-hosted (AGPL, written for this fork). Not reached in practice: unlimited teams take
// precedence (can-create-unlimited-team.ts always grants them).

export const PREMIUM_TEAM_LIMIT = Number.POSITIVE_INFINITY;

export type PremiumTeamEligibility = {
  isPremiumAdmin: boolean;
  canCreate: boolean;
};

export async function getPremiumTeamEligibility(
  _userId: string,
): Promise<PremiumTeamEligibility> {
  return { isPremiumAdmin: false, canCreate: false };
}
