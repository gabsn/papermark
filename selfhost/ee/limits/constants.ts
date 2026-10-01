// Self-hosted plan limits (AGPL, written for this fork). For numeric limits `null` means
// unlimited, as everywhere in the core (`limits.x !== null && count >= limits.x`).
// Every team of a self-hosted instance gets UNLIMITED_LIMITS; the named plan exports
// exist because pages/api/teams/index.ts stores them on new teams.

export type TFileSizeLimits = {
  video?: number | null; // MB
  document?: number | null; // MB
  image?: number | null; // MB
  excel?: number | null; // MB
  maxFiles?: number | null;
  maxPages?: number | null;
};

export type TPlanLimits = {
  users: number | null;
  links: number | null;
  documents: number | null;
  domains: number | null;
  datarooms: number | null;
  customDomainOnPro: boolean;
  customDomainInDataroom: boolean;
  advancedLinkControlsOnPro: boolean | null;
  watermarkOnBusiness?: boolean | null;
  agreementOnBusiness?: boolean | null;
  linkCustomFields?: number | null;
  conversationsInDataroom?: boolean;
  fileSizeLimits?: TFileSizeLimits;
};

export const UNLIMITED_LIMITS = {
  users: null,
  links: null,
  documents: null,
  domains: null,
  datarooms: null,
  customDomainOnPro: true,
  customDomainInDataroom: true,
  advancedLinkControlsOnPro: true,
  watermarkOnBusiness: true,
  agreementOnBusiness: true,
  // The UI reads this with `?? 0` and JSON has no Infinity: a finite, generous cap.
  linkCustomFields: 100,
  // Viewer Q&A depends on the conversations feature, which is not part of this build.
  conversationsInDataroom: false,
  fileSizeLimits: {
    video: null,
    document: null,
    image: null,
    excel: null,
    maxFiles: null,
    maxPages: null,
  },
} satisfies TPlanLimits;

export const DATAROOMS_PREMIUM_PLAN_LIMITS: TPlanLimits = UNLIMITED_LIMITS;
export const DATAROOMS_UNLIMITED_PLAN_LIMITS: TPlanLimits = UNLIMITED_LIMITS;
