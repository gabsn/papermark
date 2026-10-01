// Every Trigger.dev task module (trigger.config.ts: dirs "./lib/trigger" and
// "./ee/**/lib/trigger"). The worker imports each one so its tasks register; a module
// that throws on load (e.g. a missing env var) only disables its own tasks.
// Keep in sync when a task file is added.
export const TASK_MODULES: Record<string, () => Promise<unknown>> = {
  "lib/trigger/automatic-unpause": () => import("@/lib/trigger/automatic-unpause"),
  "lib/trigger/backfill-video-lengths": () => import("@/lib/trigger/backfill-video-lengths"),
  "lib/trigger/bulk-download": () => import("@/lib/trigger/bulk-download"),
  "lib/trigger/cleanup-expired-exports": () => import("@/lib/trigger/cleanup-expired-exports"),
  "lib/trigger/conversation-message-notification": () =>
    import("@/lib/trigger/conversation-message-notification"),
  "lib/trigger/convert-pdf-direct": () => import("@/lib/trigger/convert-pdf-direct"),
  "lib/trigger/dataroom-change-notification": () =>
    import("@/lib/trigger/dataroom-change-notification"),
  "lib/trigger/dataroom-upload-notification": () =>
    import("@/lib/trigger/dataroom-upload-notification"),
  "lib/trigger/export-visits": () => import("@/lib/trigger/export-visits"),
  "lib/trigger/optimize-video-files": () => import("@/lib/trigger/optimize-video-files"),
  "lib/trigger/pause-reminder-notification": () =>
    import("@/lib/trigger/pause-reminder-notification"),
  "lib/trigger/pdf-to-image-route": () => import("@/lib/trigger/pdf-to-image-route"),
  "lib/trigger/queues": () => import("@/lib/trigger/queues"),
  "lib/trigger/send-upgrade-checkin-email": () => import("@/lib/trigger/send-upgrade-checkin-email"),
  "lib/trigger/setup-signing-template": () => import("@/lib/trigger/setup-signing-template"),
  "ee/features/ai/lib/trigger": () => import("@/ee/features/ai/lib/trigger"),
  "ee/features/billing/cancellation/lib/trigger/pause-resume-notification": () =>
    import("@/ee/features/billing/cancellation/lib/trigger/pause-resume-notification"),
  "ee/features/billing/cancellation/lib/trigger/unpause-task": () =>
    import("@/ee/features/billing/cancellation/lib/trigger/unpause-task"),
  "ee/features/conversations/lib/trigger/conversation-message-notification": () =>
    import("@/ee/features/conversations/lib/trigger/conversation-message-notification"),
  "ee/features/dataroom-freeze/lib/trigger/dataroom-freeze-archive": () =>
    import("@/ee/features/dataroom-freeze/lib/trigger/dataroom-freeze-archive"),
  // The QStash replacement's HTTP delivery task.
  "selfhost/shims/upstash-qstash": () => import("./shims/upstash-qstash"),
};

export async function loadTaskModules() {
  for (const [name, load] of Object.entries(TASK_MODULES)) {
    try {
      await load();
    } catch (error) {
      console.error(`[queue] could not load task module ${name}; its tasks are disabled:`, error);
    }
  }
}
