// Self-hosted implementation (AGPL). Redaction is disabled.
import { RedactionDisabledDialog } from "./redaction-disabled-dialog";

export function RedactionJobsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName: string;
  onStartNew?: () => void;
}) {
  return (
    <RedactionDisabledDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Redactions"
    />
  );
}
