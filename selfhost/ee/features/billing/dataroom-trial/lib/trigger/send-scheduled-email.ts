// Self-hosted (AGPL, written for this fork): every team already has data rooms, so the
// data room trial drip (info, 24h reminder, expiry) sends nothing and changes no plan.
import { logger, task } from "@trigger.dev/sdk";

const skip = (id: string) =>
  task({
    id,
    run: async (payload: { to: string; name?: string; teamId?: string; useCase?: string }) => {
      logger.info("Data room trial emails are disabled in self-hosted mode", {
        task: id,
        teamId: payload.teamId,
      });
    },
  });

export const sendDataroomTrialInfoEmailTask = skip("send-dataroom-trial-info-email");
export const sendDataroomTrial24hReminderEmailTask = skip("send-dataroom-trial-24h-reminder-email");
export const sendDataroomTrialExpiredEmailTask = skip("send-dataroom-trial-expired-email");
