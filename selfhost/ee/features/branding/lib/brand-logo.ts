// Self-hosted implementation (AGPL). Decides what goes in the logo slot of the
// viewer, the access screen and the OTP email.

export type BrandLogoFields = {
  logo?: string | null;
  hideLogo?: boolean | null;
};

export type ResolvedBrandLogo =
  | { kind: "custom"; src: string }
  | { kind: "papermark" }
  | { kind: "none" };

export function resolveBrandLogo(
  brand: BrandLogoFields | null | undefined,
): ResolvedBrandLogo {
  if (brand?.hideLogo) return { kind: "none" };
  if (brand?.logo) return { kind: "custom", src: brand.logo };
  return { kind: "papermark" };
}
