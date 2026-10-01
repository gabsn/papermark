// Self-hosted Stripe entry point (AGPL, written for this fork). Billing is disabled: no
// Stripe client is created and no subscription exists to cancel.

export const BILLING_DISABLED_MESSAGE = "Billing is disabled in self-hosted mode.";

export function stripeInstance(_oldAccount: boolean = false): never {
  throw new Error(BILLING_DISABLED_MESSAGE);
}

/**
 * Called when a team is deleted and it has a Stripe customer id. Self-hosted teams never
 * get one; if a row imported from papermark.com still carries it, deletion goes on and
 * only a warning is logged.
 */
export async function cancelSubscription(
  customerId?: string | null,
  _isOldAccount: boolean = false,
): Promise<null> {
  if (customerId) {
    console.warn(
      `[selfhost] ${BILLING_DISABLED_MESSAGE} Subscription of customer ${customerId} was not cancelled.`,
    );
  }
  return null;
}
