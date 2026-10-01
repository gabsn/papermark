// Self-hosted implementation (AGPL). Redaction is disabled.
import { RedactionDisabledDialog } from "./redaction-disabled-dialog";

export function RedactionConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName: string;
}) {
  return (
    <RedactionDisabledDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Redact document"
    />
  );
}
