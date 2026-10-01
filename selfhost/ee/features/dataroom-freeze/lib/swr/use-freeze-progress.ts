// Self-hosted implementation (AGPL). Freeze archives are never generated in
// the self-hosted build, so there is no progress to report.

export function useFreezeProgress(_options: {
  dataroomId: string | undefined;
  isFrozen: boolean;
  frozenAt: string | Date | null;
  freezeArchiveUrl: string | null;
  initialToken?: string;
}): {
  isArchiveInProgress: boolean;
  progress: number;
  progressText: string | null;
} {
  return { isArchiveInProgress: false, progress: 0, progressText: null };
}
