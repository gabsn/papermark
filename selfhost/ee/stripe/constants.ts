// Self-hosted plan constants (AGPL, written for this fork; not the Papermark EE module).
// Billing is off: the instance owner has every feature. The values below are the plan
// names and slugs the core code compares against (team.plan, usePlan, upgrade modals).

export enum PlanEnum {
  Pro = "Pro",
  Business = "Business",
  DataRooms = "Data Rooms",
  DataRoomsPlus = "Data Rooms Plus",
  DataRoomsPremium = "Data Rooms Premium",
  DataRoomsUnlimited = "Data Rooms Unlimited",
}

/** team.plan slug -> display name. */
export const PLAN_NAME_MAP: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  trial: "Trial",
  business: "Business",
  datarooms: "Data Rooms",
  "datarooms-plus": "Data Rooms Plus",
  "datarooms-premium": "Data Rooms Premium",
  "datarooms-unlimited": "Data Rooms Unlimited",
};

/** The plan every team runs on in a self-hosted instance. */
export const SELFHOST_PLAN_SLUG = "datarooms-unlimited";

export type PeriodType = "monthly" | "yearly";

export interface Feature {
  id: string;
  text: string;
  aliasIds?: string[];
  highlight?: boolean;
  tooltip?: string;
  isCustomDomain?: boolean;
  isUsers?: boolean;
  usersIncluded?: number;
  isHighlighted?: boolean;
  isNotIncluded?: boolean;
}

export interface PlanFeatures {
  featureIntro: string;
  features: Feature[];
}

export interface FeatureOptions {
  period?: PeriodType;
  currency?: string;
  showHighlighted?: boolean;
  maxFeatures?: number;
  excludeFeatures?: string[];
  includeFeatures?: string[];
  highlightFeatures?: string[];
  showDataRoomsPlus?: boolean;
}

const SELFHOST_FEATURES: Feature[] = [
  { id: "everything", text: "Every feature is included in this self-hosted instance" },
];

/**
 * Upgrade modals list a plan's features. Nothing is sold here, so every plan reports
 * the same single line; the modals are only reachable from leftover upgrade buttons.
 */
export function getPlanFeatures(
  _plan: PlanEnum,
  options: FeatureOptions = {},
): PlanFeatures {
  const features =
    options.maxFeatures !== undefined
      ? SELFHOST_FEATURES.slice(0, options.maxFeatures)
      : SELFHOST_FEATURES;
  return { featureIntro: "Self-hosted:", features };
}
