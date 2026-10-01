// selfhost: a hosted sign-in method is offered only when its credentials are set (the
// email magic link and SAML always are). Hosted builds keep every provider.
export function getEnabledAuthProviders() {
  const selfhost = process.env.PAPERMARK_SELFHOST === "1";
  return {
    google: !selfhost || !!process.env.GOOGLE_CLIENT_ID,
    linkedin: !selfhost || !!process.env.LINKEDIN_CLIENT_ID,
    passkey:
      !!process.env.HANKO_API_KEY && !!process.env.NEXT_PUBLIC_HANKO_TENANT_ID,
  };
}

export type EnabledAuthProviders = ReturnType<typeof getEnabledAuthProviders>;
