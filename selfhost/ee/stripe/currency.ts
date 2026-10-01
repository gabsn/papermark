// Self-hosted currency constants (AGPL, written for this fork). Prices are never shown
// for a real purchase in self-hosted mode; these only keep the pricing widgets rendering.

export type Currency = "usd" | "eur";

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  usd: "$",
  eur: "€",
};

export const CURRENCY_LABEL: Record<Currency, string> = {
  usd: "USD",
  eur: "EUR",
};
