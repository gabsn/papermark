// Self-hosted edition: workflow links are switched off; visitors see a not-found screen.
import NotFound from "@/pages/404";

import { NOT_AVAILABLE_MESSAGE } from "./_not-available";

export default function WorkflowAccessView(_props: {
  entryLinkId: string;
  domain?: string;
  slug?: string;
  brand?: unknown;
}) {
  return (
    <NotFound
      eyebrow="Not available"
      title="This link is not available."
      message={`${NOT_AVAILABLE_MESSAGE}.`}
    />
  );
}
