// Self-hosted implementation (AGPL). Redaction is disabled.
import Link from "next/link";

import { REDACTION_DISABLED_MESSAGE } from "./redaction-disabled-dialog";

export function RedactionWorkspace({
  documentId,
}: {
  documentId: string;
  documentName: string;
  jobId: string;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 py-16 text-center">
      <h3 className="text-lg font-semibold text-foreground">Redaction</h3>
      <p className="text-sm text-muted-foreground">
        {REDACTION_DISABLED_MESSAGE}
      </p>
      <Link
        href={`/documents/${documentId}`}
        className="text-sm underline underline-offset-4"
      >
        Back to the document
      </Link>
    </div>
  );
}
