// Self-hosted edition: AI agents are switched off, so the document dialog never opens.
export function DocumentAIDialog(_props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  teamId: string;
  agentsEnabled?: boolean | null;
  vectorStoreFileId?: string | null;
}) {
  return null;
}
