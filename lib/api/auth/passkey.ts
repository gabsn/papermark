import { type Session } from "next-auth";

import hanko from "@/lib/hanko";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

// selfhost: lib/hanko.ts exports null when Hanko is not configured.
function requireHanko() {
  if (!hanko) throw new Error("Passkeys are not configured on this server");
  return hanko;
}

export async function startServerPasskeyRegistration({
  session,
}: {
  session: Session;
}) {
  if (!session) throw new Error("Not logged in");

  const sessionUser = session.user as CustomUser;

  const user = await prisma.user.findUnique({
    where: { email: sessionUser.email as string },
    select: { id: true, name: true },
  });

  const createOptions = await requireHanko().registration.initialize({
    userId: user!.id,
    username: user!.name || user!.id,
  });

  return createOptions;
}

// This is *your* server-side code; you need to implement this yourself.
// NextAuth takes care of logging in the user after they have registered their passkey.
export async function finishServerPasskeyRegistration({
  credential,
  session,
}: {
  credential: any;
  session: Session;
}) {
  if (!session) throw new Error("Not logged in");

  await requireHanko().registration.finalize(credential);

  // const sessionUser = session.user as CustomUser;

  // Now the user has registered their passkey and can use it to log in.

  // const user = await prisma.user.update({
  //   where: { email: sessionUser.email as string },
  //   select: { id: true },
  // });
}

export async function listUserPasskeys({ session }: { session: Session }) {
  if (!session) throw new Error("Not logged in");

  const sessionUser = session.user as CustomUser;

  const user = await prisma.user.findUnique({
    where: { email: sessionUser.email as string },
    select: { id: true },
  });

  if (!user) throw new Error("User not found");

  const tenantId = process.env.NEXT_PUBLIC_HANKO_TENANT_ID;
  const apiKey = process.env.HANKO_API_KEY;

  // selfhost: passkeys disabled, so the user has none.
  if ((!tenantId || !apiKey) && process.env.PAPERMARK_SELFHOST === "1") {
    return [];
  }

  if (!tenantId || !apiKey) {
    throw new Error("Passkey service configuration missing");
  }
  const response = await fetch(
    `https://passkeys.hanko.io/${tenantId}/credentials?user_id=${user.id}`,
    {
      method: "GET",
      headers: {
        apiKey: apiKey,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to list passkeys: ${response.statusText}`);
  }

  const passkeys = await response.json();

  if (!Array.isArray(passkeys)) {
    throw new Error("Invalid passkey data received");
  }

  return passkeys;
}

export async function removeUserPasskey({
  credentialId,
  session,
}: {
  credentialId: string;
  session: Session;
}) {
  if (!session) throw new Error("Not logged in");

  // First verify the credential belongs to the user
  const sessionUser = session.user as CustomUser;
  const user = await prisma.user.findUnique({
    where: { email: sessionUser.email as string },
    select: { id: true },
  });

  if (!user) throw new Error("User not found");

  // Verify ownership by listing user's passkeys first
  const userPasskeys = await listUserPasskeys({ session });
  const ownsCredential = userPasskeys.some((pk: any) => pk.id === credentialId);

  if (!ownsCredential) {
    throw new Error("Unauthorized");
  }

  const tenantId = process.env.NEXT_PUBLIC_HANKO_TENANT_ID;
  const apiKey = process.env.HANKO_API_KEY;

  if (!tenantId || !apiKey) {
    throw new Error("Passkey service configuration missing");
  }

  const isValidCredentialId = /^[a-zA-Z0-9_-]+$/.test(credentialId);
  if (!isValidCredentialId) {
    throw new Error("Invalid credential ID format");
  }

  const response = await fetch(
    `https://passkeys.hanko.io/${tenantId}/credentials/${credentialId}`,
    {
      method: "DELETE",
      headers: {
        apiKey: apiKey,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to remove passkey: ${response.statusText}`);
  }
}
