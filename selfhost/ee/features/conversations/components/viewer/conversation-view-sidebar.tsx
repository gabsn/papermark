// Self-hosted edition: conversations are switched off; the viewer sidebar renders nothing.
export type ConversationSidebarProps = {
  linkId: string;
  viewId: string;
  dataroomId?: string;
  dataroomName?: string;
  documentId?: string;
  documentName?: string;
  pageNumber?: number;
  viewerId?: string;
  isEnabled?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ConversationViewSidebar(_props: ConversationSidebarProps) {
  return null;
}
