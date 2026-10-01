// /api/jobs/send-pause-resume-notification (self-hosted, AGPL, written for this fork):
// billing is disabled, no team is ever paused, so there is nothing to notify.
import { NextApiRequest, NextApiResponse } from "next";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  return res
    .status(200)
    .json({ message: "Billing is disabled in self-hosted mode; no notification sent." });
}
