// GET /api/teams/:teamId/limits (self-hosted, AGPL, written for this fork).
import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getServerSession } from "next-auth/next";

import { TeamError, errorhandler } from "@/lib/errorHandler";
import { CustomUser } from "@/lib/types";

import { getLimits } from "./server";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).end("Unauthorized");
  }

  const { teamId } = req.query as { teamId: string };
  const userId = (session.user as CustomUser).id;

  try {
    return res.status(200).json(await getLimits({ teamId, userId }));
  } catch (error) {
    if (error instanceof TeamError) {
      return res.status(403).end("Unauthorized");
    }
    errorhandler(error, res);
  }
}
