"use client";

// Self-hosted implementation (AGPL). Per-link file permissions are not part of
// the self-hosted build; this sheet explains the alternative (viewer groups).
import type { ItemPermission } from "./dataroom-link-sheet";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function PermissionsSheet({
  isOpen,
  setIsOpen,
  onSave,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  dataroomId?: string;
  linkId?: string;
  permissionGroupId?: string | null;
  onSave?: (permissions: ItemPermission | null) => void;
}) {
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>File permissions</SheetTitle>
          <SheetDescription>
            Per-link file permissions are not available in this self-hosted
            build. This link gives access to the whole data room. To limit what
            a set of visitors can see, create a viewer group (Data room &gt;
            Groups), set its file access, and share the group&apos;s link.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter className="mt-6">
          <Button
            type="button"
            onClick={() => {
              onSave?.(null);
              setIsOpen(false);
            }}
          >
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
