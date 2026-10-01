import { NextResponse } from "next/server";

import { getFeatureFlags } from "@/lib/featureFlags";

// selfhost: Node runtime so flags come from the same local config (read from disk by
// selfhost/shims/vercel-edge-config.ts) as the server-side getFeatureFlags calls.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");

  try {
    const features = await getFeatureFlags({ teamId: teamId || undefined });
    return NextResponse.json(features);
  } catch (error) {
    console.error("Error fetching feature flags:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flags" },
      { status: 500 },
    );
  }
}
