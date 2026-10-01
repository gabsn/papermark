// Self-hosted (AGPL, written for this fork): subscriptions cannot be paused without
// billing, so no team is ever paused.
import type { Team } from "@prisma/client";

export function isTeamPaused(
  _team: Pick<Team, "pausedAt" | "pauseStartsAt" | "pauseEndsAt">,
): boolean {
  return false;
}

export async function isTeamPausedById(_teamId: string): Promise<boolean> {
  return false;
}
