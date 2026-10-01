// Self-hosted edition: shared 404 answer for API routes of features that are switched off.
import type { NextApiRequest, NextApiResponse } from "next";

export const NOT_AVAILABLE_MESSAGE = "Not available in the self-hosted edition";

export async function notAvailableHandler(
  _req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  res.status(404).json({ error: NOT_AVAILABLE_MESSAGE });
}
