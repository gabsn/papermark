// Self-hosted implementation (AGPL). Shared "not available" dialog.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const REDACTION_DISABLED_MESSAGE =
  "Redaction is not available in this self-hosted build. Redact the file before uploading it.";

export function RedactionDisabledDialog({
  open,
  onOpenChange,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{REDACTION_DISABLED_MESSAGE}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
