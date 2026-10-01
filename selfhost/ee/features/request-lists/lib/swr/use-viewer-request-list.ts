// Self-hosted edition: request lists are switched off; no request is made.
export function useViewerRequestList(_params: {
  linkId?: string;
  dataroomId?: string;
  viewerId?: string;
  isPreview?: boolean;
}): { enabled: boolean; tasks: never[]; loading: boolean; error: undefined } {
  return { enabled: false, tasks: [], loading: false, error: undefined };
}
