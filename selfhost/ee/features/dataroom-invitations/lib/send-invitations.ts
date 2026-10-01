// Self-hosted implementation (AGPL). Invites visitors to a dataroom link: makes
// sure each email may open the link (group membership, or the link's allow
// list when it has one), records a ViewerInvitation and sends the email
// through lib/resend (Amazon SES in the self-hosted build).
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { constructLinkUrl } from "@/lib/utils/link-url";

import DataroomViewerInvitation from "../emails/dataroom-viewer-invitation";

export type InvitableLink = {
  id: string;
  dataroomId: string | null;
  groupId: string | null;
  allowList: string[];
  domainId: string | null;
  domainSlug: string | null;
  slug: string | null;
};

export const invitableLinkSelect = {
  id: true,
  dataroomId: true,
  groupId: true,
  allowList: true,
  domainId: true,
  domainSlug: true,
  slug: true,
} as const;

export type InvitationResult = { sent: string[]; failed: string[] };

export async function sendDataroomInvitations({
  teamId,
  dataroomId,
  dataroomName,
  link,
  groupId,
  emails,
  customMessage,
  inviterUserId,
}: {
  teamId: string;
  dataroomId: string;
  dataroomName: string;
  link: InvitableLink;
  groupId: string | null;
  emails: string[];
  customMessage?: string | null;
  inviterUserId: string;
}): Promise<InvitationResult> {
  const inviter = await prisma.user.findUnique({
    where: { id: inviterUserId },
    select: { name: true, email: true },
  });
  const senderName = inviter?.name || inviter?.email || "The data room owner";
  const url = constructLinkUrl(link);
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase())));

  // A link with an allow list only opens for listed emails: add the invitees.
  if (!groupId && link.allowList.length > 0) {
    const allowed = new Set(link.allowList.map((e) => e.toLowerCase()));
    const missing = unique.filter((email) => !allowed.has(email));
    if (missing.length > 0) {
      await prisma.link.update({
        where: { id: link.id },
        data: { allowList: [...link.allowList, ...missing] },
      });
    }
  }

  const result: InvitationResult = { sent: [], failed: [] };

  for (const email of unique) {
    const viewer = await prisma.viewer.upsert({
      where: { teamId_email: { teamId, email } },
      create: { email, teamId, dataroomId, invitedAt: new Date() },
      update: { invitedAt: new Date() },
      select: { id: true },
    });

    if (groupId) {
      await prisma.viewerGroupMembership.upsert({
        where: { viewerId_groupId: { viewerId: viewer.id, groupId } },
        create: { viewerId: viewer.id, groupId },
        update: {},
      });
    }

    let ok = true;
    try {
      await sendEmail({
        to: email,
        subject: `You are invited to view ${dataroomName}`,
        react: DataroomViewerInvitation({
          dataroomName,
          senderName,
          customMessage,
          url,
        }),
        replyTo: inviter?.email ?? undefined,
        system: true,
      });
    } catch (error) {
      ok = false;
      console.error("[dataroom-invitations] send failed", email, error);
    }

    await prisma.viewerInvitation.create({
      data: {
        viewerId: viewer.id,
        linkId: link.id,
        groupId,
        invitedBy: inviterUserId,
        customMessage: customMessage || null,
        status: ok ? "SENT" : "FAILED",
      },
    });

    (ok ? result.sent : result.failed).push(email);
  }

  return result;
}
