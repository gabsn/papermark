// Self-hosted implementation (AGPL). Freezing a data room (read-only lock plus
// a ZIP archive built by a Lambda) is not part of the self-hosted build.
import { SnowflakeIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function FreezeSettings({
  isFrozen,
}: {
  dataroomId: string;
  dataroomName: string;
  isFrozen: boolean;
  frozenAt?: string | Date | null;
  frozenByUser?: unknown;
  freezeArchiveUrl?: string | null;
  freezeArchiveHash?: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SnowflakeIcon className="h-4 w-4" />
          Freeze data room
        </CardTitle>
        <CardDescription>
          {isFrozen
            ? "This data room is frozen. Unfreezing and archive downloads are not available in this self-hosted build."
            : "Freezing (read-only lock with a signed ZIP archive) is not available in this self-hosted build. Archive or delete the links instead to stop access."}
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
