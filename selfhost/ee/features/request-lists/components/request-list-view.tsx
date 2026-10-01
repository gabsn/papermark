// Self-hosted edition: request lists are switched off.
import { NotAvailableCard } from "../../workflows/components/_not-available";

export function RequestListView(_props: { dataroomId: string }) {
  return <NotAvailableCard feature="Request List" />;
}
