// Self-hosted implementation (AGPL). A visitor was refused by the link's
// allow/deny list: log it to stdout (no email to the owner).
import type { Link } from "@prisma/client";

export async function reportDeniedAccessAttempt(
  link: Partial<Link>,
  email: string,
  accessType: "global" | "allow" | "deny" = "global",
): Promise<void> {
  console.info(
    `[access-denied] link=${link.id ?? "?"} team=${link.teamId ?? "?"} ` +
      `${link.dataroomId ? `dataroom=${link.dataroomId}` : `document=${link.documentId ?? "?"}`} ` +
      `email=${email || "(none)"} list=${accessType}`,
  );
}
