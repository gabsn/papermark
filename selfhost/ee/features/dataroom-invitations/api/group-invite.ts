// Self-hosted implementation (AGPL).
// POST /api/teams/:teamId/datarooms/:id/groups/:groupId/invite
// Body: { emails: string[], customMessage?: string, linkId?: string }
// Invitees are added to the group and receive one of the group's links (the
// given linkId, else the most recent active one).
import { NextApiRequest, NextApiResponse } from "next";

import { withTeamApi } from "@/lib/api/auth/with-session-team";
import prisma from "@/lib/prisma";

import { inviteViewersSchema } from "../lib/schema/dataroom-invitations";
import {
  invitableLinkSelect,
  sendDataroomInvitations,
} from "../lib/send-invitations";

const postHandler = withTeamApi(
  async ({ req, res, teamId, userId }) => {
    const { id: dataroomId, groupId } = req.query as {
      id: string;
      groupId: string;
    };

    const parsed = inviteViewersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.errors[0]?.message ?? "Invalid request body",
      });
    }

    const group = await prisma.viewerGroup.findFirst({
      where: { id: groupId, dataroomId, teamId },
      select: { id: true, dataroom: { select: { name: true } } },
    });
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const link = await prisma.link.findFirst({
      where: {
        teamId,
        dataroomId,
        groupId,
        linkType: "DATAROOM_LINK",
        deletedAt: null,
        isArchived: false,
        ...(parsed.data.linkId ? { id: parsed.data.linkId } : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      select: invitableLinkSelect,
    });
    if (!link) {
      return res.status(400).json({
        message:
          "This group has no active link. Create a link for the group first.",
      });
    }

    const result = await sendDataroomInvitations({
      teamId,
      dataroomId,
      dataroomName: group.dataroom.name,
      link,
      groupId,
      emails: parsed.data.emails,
      customMessage: parsed.data.customMessage,
      inviterUserId: userId,
    });

    return res.status(200).json(result);
  },
  { requiredPermissions: ["datarooms.write"], dataroomParam: "id" },
);

export default async function handleRoute(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  return postHandler(req, res);
}
