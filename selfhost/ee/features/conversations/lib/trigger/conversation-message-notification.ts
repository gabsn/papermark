// Self-hosted edition: conversations are switched off. These are not Trigger.dev tasks
// (nothing is registered); triggering one is a no-op.
type DisabledTask = {
  id: string;
  trigger: (payload: unknown, options?: unknown) => Promise<undefined>;
};

function disabledTask(id: string): DisabledTask {
  return { id, trigger: async () => undefined };
}

export const sendConversationMessageNotificationTask = disabledTask(
  "send-conversation-message-notification",
);
export const sendConversationMentionNotificationTask = disabledTask(
  "send-conversation-mention-notification",
);
export const sendConversationTeamMemberNotificationTask = disabledTask(
  "send-conversation-team-member-notification",
);
