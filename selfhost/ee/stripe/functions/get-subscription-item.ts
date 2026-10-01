// Self-hosted (AGPL, written for this fork). Only the discount type is used by the core
// (lib/swr/use-billing.ts); there is no subscription to read.

export interface SubscriptionDiscount {
  couponId: string;
  percentOff?: number;
  amountOff?: number;
  duration: string;
  durationInMonths?: number;
  valid: boolean;
}

export default async function getSubscriptionItem(
  _subscriptionId: string,
  _isOldAccount: boolean,
): Promise<null> {
  return null;
}
