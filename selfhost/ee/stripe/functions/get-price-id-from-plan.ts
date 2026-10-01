// Self-hosted (AGPL, written for this fork). There are no Stripe prices: the lookup
// returns an empty id, which the billing routes (absent in self-hosted mode) would reject.
// It must not throw: some components call it while rendering.

export function getPriceIdFromPlan(_args: {
  planSlug?: string;
  planName?: string;
  isOld?: boolean;
  period: "monthly" | "yearly";
}): string {
  return "";
}
