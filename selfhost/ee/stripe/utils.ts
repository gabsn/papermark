// Self-hosted plan catalogue (AGPL, written for this fork). Billing is disabled: every
// plan is listed at 0 with no Stripe price ids, so pricing widgets render but nothing
// can be bought.
import { PlanEnum } from "./constants";

type PriceIds = {
  test: { old: string; new: string };
  production: { old: string; new: string };
};

type PlanPrice = {
  amount: number;
  amountUsd?: number;
  unitPrice: number;
  priceIds: PriceIds;
};

export type Plan = {
  name: PlanEnum;
  slug: string;
  minQuantity: number;
  price: { monthly: PlanPrice; yearly: PlanPrice };
};

const NO_PRICE_IDS: PriceIds = {
  test: { old: "", new: "" },
  production: { old: "", new: "" },
};

const free = (): PlanPrice => ({
  amount: 0,
  amountUsd: 0,
  unitPrice: 0,
  priceIds: NO_PRICE_IDS,
});

const SLUGS: Record<PlanEnum, string> = {
  [PlanEnum.Pro]: "pro",
  [PlanEnum.Business]: "business",
  [PlanEnum.DataRooms]: "datarooms",
  [PlanEnum.DataRoomsPlus]: "datarooms-plus",
  [PlanEnum.DataRoomsPremium]: "datarooms-premium",
  [PlanEnum.DataRoomsUnlimited]: "datarooms-unlimited",
};

export const PLANS: Plan[] = Object.values(PlanEnum).map((name) => ({
  name,
  slug: SLUGS[name],
  minQuantity: 1,
  price: { monthly: free(), yearly: free() },
}));

export function getPlanFromPriceId(_priceId: string): Plan | null {
  return null;
}

/** "+old" marks teams billed on Papermark's legacy Stripe account. */
export const isOldAccount = (plan: string) => plan.includes("old");
