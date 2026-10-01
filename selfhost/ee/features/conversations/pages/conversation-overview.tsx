// Self-hosted edition: conversations are switched off.
import { NotAvailablePage } from "../../workflows/components/_not-available";

export default function ConversationOverview(_props: {
  initialConversationId?: string;
}) {
  return <NotAvailablePage feature="Conversations" />;
}
