// Self-hosted (AGPL, written for this fork): every team a user creates starts on the top
// plan ("datarooms-unlimited"), so pages/api/teams/index.ts always takes that branch.

export async function canCreateUnlimitedTeam(_userId: string): Promise<boolean> {
  return true;
}
