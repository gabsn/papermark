// Self-hosted rate limits (AGPL, written for this fork), counted by the in-memory
// @upstash/ratelimit replacement (selfhost/shims/upstash-ratelimit.ts).
import { Ratelimit } from "@upstash/ratelimit";

import { redis } from "@/lib/redis";

const limiter = (prefix: string, tokens: number, window: `${number} m` | `${number} h`) =>
  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(tokens, window), prefix });

export const rateLimiters = {
  // Sign-in attempts (email links, passkeys) per client IP.
  auth: limiter("rl:auth", 10, "20 m"),
  billing: limiter("rl:billing", 10, "20 m"),
  // Custom-domain verification checks per user and team.
  domainVerification: limiter("rl:domain-verification", 30, "1 h"),
  // Bulk link imports per team.
  bulkLinkImport: limiter("rl:bulk-link-import", 10, "1 h"),
};

/**
 * Consume one token. A limiter failure lets the request through: rate limiting must
 * never lock the owner out of their own instance.
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<{ success: boolean; remaining?: number; error?: string }> {
  try {
    const { success, remaining } = await limiter.limit(identifier);
    return success
      ? { success, remaining }
      : { success, remaining, error: "Too many requests. Please try again later." };
  } catch (error) {
    console.error("[ratelimit] check failed, request allowed", error);
    return { success: true };
  }
}
