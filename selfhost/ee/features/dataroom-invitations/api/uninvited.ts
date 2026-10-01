// Self-hosted implementation (AGPL).
// GET /api/teams/:teamId/datarooms/:id/groups/:groupId/uninvited
// Group members who never received an invitation for this group.
import { NextApiRequest, NextApiResponse } from "next";

import { withTeamApi } from "@/lib/api/auth/with-session-team";
import prisma from "@/lib/prisma";

export type UninvitedMembersResponse = {
  uninvitedCount: number;
  uninvitedEmails: string[];
};

const getHandler = withTeamApi(
  async ({ req, res, teamId }) => {
    const { id: dataroomId, groupId } = req.query as {
      id: string;
      groupId: string;
    };

    const group = await prisma.viewerGroup.findFirst({
      where: { id: groupId, dataroomId, teamId },
      select: { id: true },
    });
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const members = await prisma.viewerGroupMembership.findMany({
      where: {
        groupId,
        viewer: { invitations: { none: { groupId, status: "SENT" } } },
      },
      select: { viewer: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
    });

    const uninvitedEmails = members.map((m) => m.viewer.email);
    const body: UninvitedMembersResponse = {
      uninvitedCount: uninvitedEmails.length,
      uninvitedEmails,
    };
    return res.status(200).json(body);
  },
  { requiredPermissions: ["datarooms.read"], dataroomParam: "id" },
);

export default async function handleRoute(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  return getHandler(req, res);
}
