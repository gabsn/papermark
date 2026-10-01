"use client";

// Self-hosted implementation (AGPL). Dataroom links use the core link sheet.
// Per-link file permissions (choosing which files one link can see) are not
// part of the self-hosted build: restrict access per audience with viewer
// groups (Data room > Groups) instead.
import type { Dispatch, SetStateAction } from "react";

import type { ItemType, LinkType } from "@prisma/client";

import LinkSheet, {
  type DEFAULT_LINK_TYPE,
} from "@/components/links/link-sheet";
import type { LinkWithViews } from "@/lib/types";

export type ItemPermission = Record<
  string,
  { view: boolean; download: boolean; itemType: ItemType }
>;

export function DataroomLinkSheet({
  isOpen,
  setIsOpen,
  linkType,
  currentLink,
  existingLinks,
  linkTargetId,
  onLinkCreatedNavigate,
}: {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>> | ((open: boolean) => void);
  linkType: Omit<LinkType, "WORKFLOW_LINK">;
  currentLink?: DEFAULT_LINK_TYPE;
  existingLinks?: LinkWithViews[];
  linkTargetId?: string | null;
  /** Upstream opens straight on the file-permission view; not available here. */
  initialView?: string;
  onLinkCreatedNavigate?: (targetId: string) => void;
}) {
  return (
    <LinkSheet
      isOpen={isOpen}
      setIsOpen={setIsOpen as Dispatch<SetStateAction<boolean>>}
      linkType={linkType}
      currentLink={currentLink}
      existingLinks={existingLinks}
      linkTargetId={linkTargetId}
      onLinkCreatedNavigate={onLinkCreatedNavigate}
    />
  );
}
