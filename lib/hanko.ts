import { tenant } from "@teamhanko/passkeys-next-auth-provider";

const hankoConfigured = !!(
  process.env.HANKO_API_KEY && process.env.NEXT_PUBLIC_HANKO_TENANT_ID
);

// selfhost: passkeys are optional; without Hanko credentials they are disabled
// (no provider in lib/auth/auth-options.ts, no button on the login page).
if (!hankoConfigured && process.env.PAPERMARK_SELFHOST !== "1") {
  // These need to be set in .env.local
  // You get them from the Passkey API itself, e.g. when first setting up the server.
  throw new Error(
    "Please set HANKO_API_KEY and NEXT_PUBLIC_HANKO_TENANT_ID in your .env.local file.",
  );
}

const hanko = hankoConfigured
  ? tenant({
      apiKey: process.env.HANKO_API_KEY!,
      tenantId: process.env.NEXT_PUBLIC_HANKO_TENANT_ID!,
    })
  : null;

export default hanko;
