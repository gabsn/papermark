// Self-hosted (AGPL, written for this fork): subscriptions are never paused, so there is
// nothing to resume. The task exists so callers can trigger it.
import { logger, task } from "@trigger.dev/sdk";

export const automaticUnpauseTask = task({
  id: "automatic-unpause-subscription",
  run: async (payload: { teamId: string }) => {
    logger.info("Billing is disabled in self-hosted mode; nothing to unpause", payload);
  },
});
