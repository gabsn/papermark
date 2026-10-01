import type { NextApiRequest, NextApiResponse } from "next";

import { canRead, listRuns, toTriggerRun, verifyAccessToken } from "@/selfhost/lib/queue";

// GET /api/selfhost/runs?tag=a&tag=b – runs carrying any of the tags, newest first, for
// the self-hosted "@trigger.dev/react-hooks" replacement. Auth: a public access token.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.PAPERMARK_SELFHOST !== "1") return res.status(404).end();
  if (req.method !== "GET") return res.status(405).end();

  const scopes = verifyAccessToken(req.headers.authorization?.replace(/^Bearer /, ""));
  if (!scopes) return res.status(401).json({ error: "Invalid or expired token" });

  const tags = ([] as string[]).concat(req.query.tag ?? []);
  const runs = (await listRuns())
    .filter((run) => tags.some((tag) => run.tags.includes(tag)) && canRead(scopes, run))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map((run) => toTriggerRun(run, { withPayload: false }));

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ runs });
}
