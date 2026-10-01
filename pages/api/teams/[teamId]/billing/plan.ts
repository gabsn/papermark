// GET /api/teams/:teamId/billing/plan — the team's plan, read by usePlan()
// (lib/swr/use-billing.ts) to gate features in the dashboard.
// selfhost: written for the self-hosted fork; upstream serves this from an unpublished
// route. Billing is disabled, so the answer is the stored plan with no subscription.
import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getServerSession } from "next-auth/next";

import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
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

  const team = await prisma.team.findUnique({
    where: { id: teamId, users: { some: { userId } } },
    select: { plan: true, startsAt: true, endsAt: true, trialEndsAt: true },
  });
  if (!team) {
    return res.status(403).end("Unauthorized");
  }

  return res.status(200).json({
    plan: team.plan,
    startsAt: team.startsAt,
    endsAt: team.endsAt,
    pausedAt: null,
    pauseStartsAt: null,
    pauseEndsAt: null,
    isPaused: false,
    cancelledAt: null,
    trialEndsAt: team.trialEndsAt,
    isCustomer: false,
    subscriptionCycle: "monthly",
    discount: null,
  });
}
