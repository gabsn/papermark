// Self-hosted edition: the AI viewer chat is switched off. The provider and layout only
// render their children, and the context is never available.
import type { ReactNode } from "react";

import type { DataroomFolder } from "@prisma/client";

export interface DataroomDocumentForChat {
  dataroomDocumentId: string;
  id: string;
  name: string;
  folderId: string | null;
}

export interface ViewerChatContextType {
  isOpen: boolean;
  isEnabled: boolean;
  documents: DataroomDocumentForChat[];
  folders: DataroomFolder[];
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export function ViewerChatProvider({
  children,
}: {
  children: ReactNode;
  enabled?: boolean;
  dataroomId?: string;
  dataroomName?: string;
  documentId?: string;
  documentName?: string;
  linkId?: string;
  viewId?: string;
  viewerId?: string;
  documents?: DataroomDocumentForChat[];
  folders?: DataroomFolder[];
}) {
  return <>{children}</>;
}

export function ViewerChatLayout({
  children,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <>{children}</>;
}

/** Always null: there is no viewer chat in the self-hosted edition. */
export function useViewerChatSafe(): ViewerChatContextType | null {
  return null;
}
