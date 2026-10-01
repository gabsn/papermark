// Self-hosted implementation (AGPL). Loaded by selfhost/tasks.ts. Dataroom
// freeze archives are disabled in the self-hosted build, so this module
// registers no task.

export type FreezeArchivePayload = {
  dataroomId: string;
  teamId: string;
  userId: string;
};

export const DATAROOM_FREEZE_DISABLED_MESSAGE =
  "Dataroom freeze is not available in the self-hosted build.";
