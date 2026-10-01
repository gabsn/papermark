// Self-hosted implementation (AGPL).
// POST /api/teams/:teamId/datarooms/:id/links/:linkId/invite
// Body: { emails: string[], customMessage?: string }
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
    const { id: dataroomId, linkId } = req.query as {
      id: string;
      linkId: string;
    };

    const parsed = inviteViewersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.errors[0]?.message ?? "Invalid request body",
      });
    }

    const link = await prisma.link.findFirst({
      where: {
        id: linkId,
        teamId,
        dataroomId,
        linkType: "DATAROOM_LINK",
        deletedAt: null,
        isArchived: false,
      },
      select: {
        ...invitableLinkSelect,
        dataroom: { select: { name: true } },
      },
    });
    if (!link || !link.dataroom) {
      return res.status(404).json({ message: "Link not found" });
    }

    const result = await sendDataroomInvitations({
      teamId,
      dataroomId,
      dataroomName: link.dataroom.name,
      link,
      groupId: link.groupId,
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
