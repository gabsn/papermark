// Self-hosted (AGPL, written for this fork): subscriptions are never paused, so there is
// no "your pause ends soon" email to send. The task exists so callers can trigger it.
import { logger, task } from "@trigger.dev/sdk";

export const sendPauseResumeNotificationTask = task({
  id: "send-pause-resume-notification",
  run: async (payload: { teamId: string }) => {
    logger.info("Billing is disabled in self-hosted mode; no pause notification", payload);
  },
});
