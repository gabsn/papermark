// Self-hosted edition: conversations are switched off; the sidebar is never open.
import type { ReactNode } from "react";

export type ConversationSidebarContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

export function ConversationSidebarProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}

export function ConversationSidebarLayout({
  children,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <>{children}</>;
}

/** Always null: no conversation sidebar exists in the self-hosted edition. */
export function useConversationSidebarSafe(): ConversationSidebarContextValue | null {
  return null;
}
