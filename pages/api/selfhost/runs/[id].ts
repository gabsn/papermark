import type { NextApiRequest, NextApiResponse } from "next";

import { canRead, readRun, toTriggerRun, verifyAccessToken } from "@/selfhost/lib/queue";

// GET /api/selfhost/runs/:id – status of one run for the self-hosted
// "@trigger.dev/react-hooks" replacement. Auth: a public access token (Bearer).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.PAPERMARK_SELFHOST !== "1") return res.status(404).end();
  if (req.method !== "GET") return res.status(405).end();

  const scopes = verifyAccessToken(req.headers.authorization?.replace(/^Bearer /, ""));
  if (!scopes) return res.status(401).json({ error: "Invalid or expired token" });

  const run = await readRun(String(req.query.id));
  if (!run || !canRead(scopes, run)) return res.status(404).json({ error: "Run not found" });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(toTriggerRun(run, { withPayload: false }));
}
