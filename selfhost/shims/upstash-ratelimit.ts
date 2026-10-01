// Self-hosted replacement for "@upstash/ratelimit": the same Ratelimit API, counted in
// memory. One process serves every request, so in-memory counters are exact; they reset
// on restart, which is acceptable for rate limits. No Node-only imports: lib/redis.ts
// (reached from the Edge middleware) imports this module.
type Duration = `${number} ms` | `${number} s` | `${number} m` | `${number} h` | `${number} d` | `${number}${"ms" | "s" | "m" | "h" | "d"}`;

type Algorithm =
  | { kind: "slidingWindow"; tokens: number; windowMs: number }
  | { kind: "fixedWindow"; tokens: number; windowMs: number }
  | { kind: "tokenBucket"; refillRate: number; intervalMs: number; maxTokens: number };

type State =
  | { kind: "log"; hits: number[]; expiresAt: number }
  | { kind: "bucket"; tokens: number; updatedAt: number; expiresAt: number };

export type RatelimitResponse = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  pending: Promise<unknown>;
  reason?: string;
};

const UNITS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function ms(duration: Duration | number): number {
  if (typeof duration === "number") return duration;
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) throw new Error(`Unable to parse window size: ${duration}`);
  return Number(match[1]) * UNITS[match[2]];
}

const globalForRl = globalThis as unknown as { __papermarkRatelimit?: Map<string, State> };
const states = (globalForRl.__papermarkRatelimit ??= new Map<string, State>());
let calls = 0;

function sweep(now: number) {
  for (const [key, state] of states) if (state.expiresAt <= now) states.delete(key);
}

export class Ratelimit {
  private algorithm: Algorithm;
  private prefix: string;

  constructor(config: { limiter: Algorithm; prefix?: string; [option: string]: unknown }) {
    this.algorithm = config.limiter;
    this.prefix = config.prefix ?? "@upstash/ratelimit";
  }

  static slidingWindow(tokens: number, window: Duration): Algorithm {
    return { kind: "slidingWindow", tokens, windowMs: ms(window) };
  }

  static fixedWindow(tokens: number, window: Duration): Algorithm {
    return { kind: "fixedWindow", tokens, windowMs: ms(window) };
  }

  static tokenBucket(refillRate: number, interval: Duration, maxTokens: number): Algorithm {
    return { kind: "tokenBucket", refillRate, intervalMs: ms(interval), maxTokens };
  }

  static cachedFixedWindow(tokens: number, window: Duration): Algorithm {
    return Ratelimit.fixedWindow(tokens, window);
  }

  // Limiters built with different windows on the same identifier stay independent,
  // as they do with Upstash (its keys include the window).
  private key(identifier: string) {
    const a = this.algorithm;
    const shape = a.kind === "tokenBucket" ? `${a.refillRate}/${a.intervalMs}/${a.maxTokens}` : `${a.tokens}/${a.windowMs}`;
    return `${this.prefix}:${a.kind}:${shape}:${identifier}`;
  }

  private take(identifier: string, rate: number, consume: boolean): RatelimitResponse {
    const now = Date.now();
    if (++calls % 1000 === 0) sweep(now);
    const key = this.key(identifier);
    const a = this.algorithm;
    const pending = Promise.resolve();

    if (a.kind === "tokenBucket") {
      let state = states.get(key);
      if (!state || state.kind !== "bucket" || state.expiresAt <= now) {
        state = { kind: "bucket", tokens: a.maxTokens, updatedAt: now, expiresAt: 0 };
      }
      const refills = Math.floor((now - state.updatedAt) / a.intervalMs);
      if (refills > 0) {
        state.tokens = Math.min(a.maxTokens, state.tokens + refills * a.refillRate);
        state.updatedAt += refills * a.intervalMs;
      }
      const success = state.tokens >= rate;
      if (success && consume) state.tokens -= rate;
      state.expiresAt = now + Math.ceil((a.maxTokens / a.refillRate) * a.intervalMs);
      states.set(key, state);
      return { success, limit: a.maxTokens, remaining: Math.max(0, state.tokens), reset: state.updatedAt + a.intervalMs, pending };
    }

    if (a.kind === "fixedWindow") {
      const windowStart = Math.floor(now / a.windowMs) * a.windowMs;
      const reset = windowStart + a.windowMs;
      let state = states.get(key);
      if (!state || state.kind !== "log" || state.expiresAt <= now) {
        state = { kind: "log", hits: [], expiresAt: reset };
      }
      const used = state.hits.length;
      const success = used + rate <= a.tokens;
      if (success && consume) for (let i = 0; i < rate; i++) state.hits.push(now);
      states.set(key, state);
      return { success, limit: a.tokens, remaining: Math.max(0, a.tokens - state.hits.length), reset, pending };
    }

    // Sliding window: exact log of hits within the last window.
    let state = states.get(key);
    if (!state || state.kind !== "log") state = { kind: "log", hits: [], expiresAt: 0 };
    state.hits = state.hits.filter((t) => t > now - a.windowMs);
    const success = state.hits.length + rate <= a.tokens;
    if (success && consume) for (let i = 0; i < rate; i++) state.hits.push(now);
    state.expiresAt = (state.hits[state.hits.length - 1] ?? now) + a.windowMs;
    states.set(key, state);
    const reset = (state.hits[0] ?? now) + a.windowMs;
    return { success, limit: a.tokens, remaining: Math.max(0, a.tokens - state.hits.length), reset, pending };
  }

  async limit(identifier: string, opts?: { rate?: number; [option: string]: unknown }): Promise<RatelimitResponse> {
    return this.take(identifier, opts?.rate ?? 1, true);
  }

  async blockUntilReady(identifier: string, timeout: number): Promise<RatelimitResponse> {
    const deadline = Date.now() + timeout;
    let res = this.take(identifier, 1, true);
    while (!res.success && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(res.reset, deadline) - Date.now())));
      res = this.take(identifier, 1, true);
    }
    return res;
  }

  async getRemaining(identifier: string): Promise<{ remaining: number; reset: number; limit: number }> {
    const { remaining, reset, limit } = this.take(identifier, 0, false);
    return { remaining, reset, limit };
  }

  async resetUsedTokens(identifier: string): Promise<void> {
    states.delete(this.key(identifier));
  }
}

export default Ratelimit;
