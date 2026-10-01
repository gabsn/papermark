// Self-hosted replacement for "@upstash/redis" in the Edge runtime (middleware.ts).
//
// The Edge sandbox has no node:fs and runs in its own isolate, so it cannot share the
// Node process's store (upstash-redis.ts). The only Redis read reachable from the
// middleware is the custom-domain root redirect (lib/middleware/domain.ts →
// getDomainRedirectUrl); with this client it finds nothing and the middleware keeps
// its default behaviour. Reads return empty values, writes are dropped.
const empty = async (): Promise<null> => null;
const zero = async (): Promise<number> => 0;
const emptyList = async (): Promise<never[]> => [];

export class Redis {
  constructor(_config?: unknown) {}

  static fromEnv(_config?: unknown) {
    return new Redis();
  }

  get = empty;
  getdel = empty;
  hget = empty;
  hgetall = empty;
  set = async () => "OK";
  setex = async () => "OK";
  del = zero;
  exists = zero;
  incr = async () => 1;
  expire = zero;
  ttl = async () => -2;
  sismember = zero;
  sadd = zero;
  srem = zero;
  zadd = zero;
  zrem = zero;
  smembers = emptyList;
  zrange = emptyList;
  lrange = emptyList;
  mget = async (...keys: (string | string[])[]) => keys.flat().map(() => null);

  pipeline(): any {
    const pipeline: any = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "exec" ? async () => [] : prop === "then" ? undefined : () => pipeline,
      },
    );
    return pipeline;
  }

  multi() {
    return this.pipeline();
  }
}

export default Redis;
