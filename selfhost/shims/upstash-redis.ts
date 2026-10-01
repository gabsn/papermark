// Self-hosted replacement for "@upstash/redis": an in-process key-value store with the
// subset of Redis commands Papermark uses, persisted to $PAPERMARK_DATA/kv.json.
//
// Semantics follow the Upstash client, not raw Redis: values are JSON-serialized on
// write (strings are stored as-is) and JSON-parsed on read when possible, so
// `get` of a stored object returns the object and `get` of "1" returns 1.
//
// One store per process, kept on globalThis: Next bundles the pages router, the app
// router and API routes separately, and they must share state. Writes are flushed to
// disk at most every 200 ms (atomic rename) and on exit, so a restart keeps sessions,
// login codes and job state. Expiry is lazy (checked on access) plus a sweep on save.
//
// The Edge runtime (middleware) cannot use node:fs; next.config.mjs aliases this
// package to upstash-redis.edge.ts there.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { dataPath } from "../lib/paths";

type Entry =
  | { t: "string"; v: string; e?: number }
  | { t: "hash"; v: Map<string, string>; e?: number }
  | { t: "set"; v: Set<string>; e?: number }
  | { t: "zset"; v: Map<string, number>; e?: number }
  | { t: "list"; v: string[]; e?: number };

type SetOptions = {
  ex?: number;
  px?: number;
  exat?: number;
  pxat?: number;
  nx?: boolean;
  xx?: boolean;
  keepTtl?: boolean;
  get?: boolean;
};

type ZRangeOptions = {
  byScore?: boolean;
  byLex?: boolean;
  rev?: boolean;
  withScores?: boolean;
  offset?: number;
  count?: number;
};

const SAVE_DELAY_MS = 200;

class KvStore {
  data = new Map<string, Entry>();
  private file: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(file: string) {
    this.file = file;
    this.load();
    process.on("exit", () => this.flush());
  }

  private load() {
    let raw: string;
    try {
      raw = readFileSync(this.file, "utf8");
    } catch {
      return; // first start
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, { t: Entry["t"]; v: any; e?: number }>;
      const now = Date.now();
      for (const [key, item] of Object.entries(parsed)) {
        if (item.e !== undefined && item.e <= now) continue;
        const v =
          item.t === "hash"
            ? new Map(Object.entries(item.v as Record<string, string>))
            : item.t === "set"
              ? new Set(item.v as string[])
              : item.t === "zset"
                ? new Map(item.v as [string, number][])
                : item.v;
        this.data.set(key, { t: item.t, v, e: item.e } as Entry);
      }
    } catch (error) {
      console.error(`[selfhost/kv] ignoring unreadable ${this.file}:`, error);
    }
  }

  /** Returns the live entry for a key, dropping it when expired. */
  entry(key: string): Entry | undefined {
    const entry = this.data.get(key);
    if (entry && entry.e !== undefined && entry.e <= Date.now()) {
      this.data.delete(key);
      this.changed();
      return undefined;
    }
    return entry;
  }

  changed() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, SAVE_DELAY_MS);
    this.timer.unref?.();
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const now = Date.now();
    const out: Record<string, { t: Entry["t"]; v: unknown; e?: number }> = {};
    for (const [key, entry] of this.data) {
      if (entry.e !== undefined && entry.e <= now) {
        this.data.delete(key);
        continue;
      }
      const v =
        entry.t === "hash"
          ? Object.fromEntries(entry.v)
          : entry.t === "set"
            ? [...entry.v]
            : entry.t === "zset"
              ? [...entry.v]
              : entry.v;
      out[key] = entry.e === undefined ? { t: entry.t, v } : { t: entry.t, v, e: entry.e };
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(out));
      renameSync(tmp, this.file);
    } catch (error) {
      console.error(`[selfhost/kv] could not write ${this.file}:`, error);
    }
  }
}

const globalForKv = globalThis as unknown as { __papermarkKv?: KvStore };
const store = () => (globalForKv.__papermarkKv ??= new KvStore(dataPath("kv.json")));

// Upstash (de)serialization.
const serialize = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);
const deserialize = (raw: string | null | undefined): any => {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

class WrongTypeError extends Error {
  constructor() {
    super("WRONGTYPE Operation against a key holding the wrong kind of value");
  }
}

function typed<T extends Entry["t"]>(
  key: string,
  type: T,
  create: boolean,
): Extract<Entry, { t: T }> | undefined {
  const s = store();
  const entry = s.entry(key);
  if (entry) {
    if (entry.t !== type) throw new WrongTypeError();
    return entry as Extract<Entry, { t: T }>;
  }
  if (!create) return undefined;
  const fresh = {
    t: type,
    v:
      type === "hash" || type === "zset"
        ? new Map()
        : type === "set"
          ? new Set()
          : type === "list"
            ? []
            : "",
  } as Extract<Entry, { t: T }>;
  s.data.set(key, fresh);
  return fresh;
}

/** Drops a collection key once it is empty, like Redis does. */
function dropIfEmpty(key: string, entry: Entry) {
  const size =
    entry.t === "list" ? entry.v.length : entry.t === "string" ? 1 : entry.v.size;
  if (size === 0) store().data.delete(key);
}

const flatKeys = (keys: (string | string[])[]): string[] => keys.flat();

function globToRegExp(pattern: string): RegExp {
  let re = "";
  for (const ch of pattern) {
    if (ch === "*") re += ".*";
    else if (ch === "?") re += ".";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

function parseScoreBound(bound: number | string, isMin: boolean): { value: number; exclusive: boolean } {
  if (typeof bound === "number") return { value: bound, exclusive: false };
  if (bound === "-inf") return { value: -Infinity, exclusive: false };
  if (bound === "+inf" || bound === "inf") return { value: Infinity, exclusive: false };
  if (bound.startsWith("(")) return { value: Number(bound.slice(1)), exclusive: true };
  const value = Number(bound);
  return { value: Number.isNaN(value) ? (isMin ? -Infinity : Infinity) : value, exclusive: false };
}

function sliceByIndex<T>(items: T[], start: number, stop: number): T[] {
  const len = items.length;
  let from = start < 0 ? Math.max(len + start, 0) : start;
  let to = stop < 0 ? len + stop : Math.min(stop, len - 1);
  if (from > to || from >= len) return [];
  return items.slice(from, to + 1);
}

function expiryFrom(opts: SetOptions | undefined): number | undefined {
  if (!opts) return undefined;
  if (opts.ex !== undefined) return Date.now() + opts.ex * 1000;
  if (opts.px !== undefined) return Date.now() + opts.px;
  if (opts.exat !== undefined) return opts.exat * 1000;
  if (opts.pxat !== undefined) return opts.pxat;
  return undefined;
}

export class Redis {
  // Connection options are accepted and ignored: everything is local.
  constructor(_config?: unknown) {}

  static fromEnv(_config?: unknown) {
    return new Redis();
  }

  pipeline(): any {
    return createPipeline(this);
  }

  multi(): any {
    // Every command runs synchronously on one in-memory map, so a pipeline is already atomic.
    return createPipeline(this);
  }

  async ping(message?: string) {
    return message ?? "PONG";
  }

  // Strings

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = typed(key, "string", false);
    return entry ? (deserialize(entry.v) as T) : null;
  }

  async set<T = unknown>(key: string, value: T, opts?: SetOptions): Promise<any> {
    const s = store();
    const existing = s.entry(key);
    if (opts?.nx && existing) return opts.get ? this.get(key) : null;
    if (opts?.xx && !existing) return null;
    const previous = opts?.get && existing?.t === "string" ? deserialize(existing.v) : null;
    const e = expiryFrom(opts) ?? (opts?.keepTtl ? existing?.e : undefined);
    s.data.set(key, e === undefined ? { t: "string", v: serialize(value) } : { t: "string", v: serialize(value), e });
    s.changed();
    return opts?.get ? previous : "OK";
  }

  async setex<T = unknown>(key: string, seconds: number, value: T) {
    return this.set(key, value, { ex: seconds });
  }

  async psetex<T = unknown>(key: string, ms: number, value: T) {
    return this.set(key, value, { px: ms });
  }

  async setnx<T = unknown>(key: string, value: T): Promise<number> {
    return (await this.set(key, value, { nx: true })) === "OK" ? 1 : 0;
  }

  async getdel<T = unknown>(key: string): Promise<T | null> {
    const value = await this.get<T>(key);
    if (value !== null) await this.del(key);
    return value;
  }

  async getset<T = unknown>(key: string, value: unknown): Promise<T | null> {
    const previous = await this.get<T>(key);
    await this.set(key, value);
    return previous;
  }

  async mget<T extends unknown[] = unknown[]>(...keys: (string | string[])[]): Promise<T> {
    return Promise.all(flatKeys(keys).map((key) => this.get(key))) as Promise<T>;
  }

  async mset(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) await this.set(key, value);
    return "OK";
  }

  async incrby(key: string, increment: number): Promise<number> {
    const entry = typed(key, "string", false);
    const current = entry ? Number(entry.v) : 0;
    if (!Number.isInteger(current)) throw new Error("ERR value is not an integer or out of range");
    const next = current + increment;
    const s = store();
    s.data.set(key, entry?.e === undefined ? { t: "string", v: String(next) } : { t: "string", v: String(next), e: entry.e });
    s.changed();
    return next;
  }

  async incr(key: string) {
    return this.incrby(key, 1);
  }

  async decr(key: string) {
    return this.incrby(key, -1);
  }

  async decrby(key: string, decrement: number) {
    return this.incrby(key, -decrement);
  }

  // Keys

  async del(...keys: (string | string[])[]): Promise<number> {
    const s = store();
    let removed = 0;
    for (const key of flatKeys(keys)) {
      if (s.entry(key) && s.data.delete(key)) removed++;
    }
    if (removed) s.changed();
    return removed;
  }

  async unlink(...keys: (string | string[])[]) {
    return this.del(...keys);
  }

  async exists(...keys: (string | string[])[]): Promise<number> {
    return flatKeys(keys).filter((key) => store().entry(key)).length;
  }

  async type(key: string): Promise<string> {
    return store().entry(key)?.t ?? "none";
  }

  async pexpireat(key: string, unixMs: number): Promise<0 | 1> {
    const s = store();
    const entry = s.entry(key);
    if (!entry) return 0;
    entry.e = unixMs;
    s.changed();
    return 1;
  }

  async expire(key: string, seconds: number) {
    return this.pexpireat(key, Date.now() + seconds * 1000);
  }

  async pexpire(key: string, ms: number) {
    return this.pexpireat(key, Date.now() + ms);
  }

  async expireat(key: string, unixSeconds: number) {
    return this.pexpireat(key, unixSeconds * 1000);
  }

  async persist(key: string): Promise<0 | 1> {
    const s = store();
    const entry = s.entry(key);
    if (!entry || entry.e === undefined) return 0;
    delete entry.e;
    s.changed();
    return 1;
  }

  async pttl(key: string): Promise<number> {
    const entry = store().entry(key);
    if (!entry) return -2;
    if (entry.e === undefined) return -1;
    return Math.max(entry.e - Date.now(), 0);
  }

  async ttl(key: string): Promise<number> {
    const ms = await this.pttl(key);
    return ms < 0 ? ms : Math.ceil(ms / 1000);
  }

  async keys(pattern: string): Promise<string[]> {
    const re = globToRegExp(pattern);
    const s = store();
    return [...s.data.keys()].filter((key) => re.test(key) && s.entry(key));
  }

  /** Single pass: always returns cursor "0" with every match. */
  async scan(_cursor: number | string, opts?: { match?: string; count?: number; type?: string }): Promise<[string, string[]]> {
    let keys = await this.keys(opts?.match ?? "*");
    if (opts?.type) keys = keys.filter((key) => store().entry(key)?.t === opts.type);
    return ["0", keys];
  }

  async dbsize(): Promise<number> {
    return (await this.keys("*")).length;
  }

  async flushall() {
    const s = store();
    s.data.clear();
    s.changed();
    return "OK";
  }

  async flushdb() {
    return this.flushall();
  }

  // Hashes

  async hset(key: string, values: Record<string, unknown>): Promise<number> {
    const entry = typed(key, "hash", true)!;
    let added = 0;
    for (const [field, value] of Object.entries(values)) {
      if (!entry.v.has(field)) added++;
      entry.v.set(field, serialize(value));
    }
    store().changed();
    return added;
  }

  async hsetnx(key: string, field: string, value: unknown): Promise<0 | 1> {
    const entry = typed(key, "hash", true)!;
    if (entry.v.has(field)) return 0;
    entry.v.set(field, serialize(value));
    store().changed();
    return 1;
  }

  async hget<T = unknown>(key: string, field: string): Promise<T | null> {
    return deserialize(typed(key, "hash", false)?.v.get(field)) as T | null;
  }

  async hmget<T extends Record<string, unknown>>(key: string, ...fields: string[]): Promise<T | null> {
    const entry = typed(key, "hash", false);
    if (!entry) return null;
    return Object.fromEntries(fields.map((f) => [f, deserialize(entry.v.get(f))])) as T;
  }

  async hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null> {
    const entry = typed(key, "hash", false);
    if (!entry || entry.v.size === 0) return null;
    return Object.fromEntries([...entry.v].map(([f, v]) => [f, deserialize(v)])) as T;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const entry = typed(key, "hash", false);
    if (!entry) return 0;
    const removed = fields.filter((f) => entry.v.delete(f)).length;
    dropIfEmpty(key, entry);
    if (removed) store().changed();
    return removed;
  }

  async hexists(key: string, field: string): Promise<0 | 1> {
    return typed(key, "hash", false)?.v.has(field) ? 1 : 0;
  }

  async hkeys(key: string): Promise<string[]> {
    return [...(typed(key, "hash", false)?.v.keys() ?? [])];
  }

  async hvals<T = unknown>(key: string): Promise<T[]> {
    return [...(typed(key, "hash", false)?.v.values() ?? [])].map(deserialize);
  }

  async hlen(key: string): Promise<number> {
    return typed(key, "hash", false)?.v.size ?? 0;
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    const entry = typed(key, "hash", true)!;
    const next = Number(entry.v.get(field) ?? 0) + increment;
    entry.v.set(field, String(next));
    store().changed();
    return next;
  }

  // Sets

  async sadd(key: string, ...members: unknown[]): Promise<number> {
    const entry = typed(key, "set", true)!;
    let added = 0;
    for (const member of members.flat()) {
      const raw = serialize(member);
      if (!entry.v.has(raw)) {
        entry.v.add(raw);
        added++;
      }
    }
    store().changed();
    return added;
  }

  async srem(key: string, ...members: unknown[]): Promise<number> {
    const entry = typed(key, "set", false);
    if (!entry) return 0;
    const removed = members.flat().filter((m) => entry.v.delete(serialize(m))).length;
    dropIfEmpty(key, entry);
    if (removed) store().changed();
    return removed;
  }

  async smembers<T extends unknown[] = string[]>(key: string): Promise<T> {
    return [...(typed(key, "set", false)?.v ?? [])].map(deserialize) as T;
  }

  async sismember(key: string, member: unknown): Promise<0 | 1> {
    return typed(key, "set", false)?.v.has(serialize(member)) ? 1 : 0;
  }

  async smismember(key: string, members: unknown[]): Promise<(0 | 1)[]> {
    const entry = typed(key, "set", false);
    return members.map((m) => (entry?.v.has(serialize(m)) ? 1 : 0));
  }

  async scard(key: string): Promise<number> {
    return typed(key, "set", false)?.v.size ?? 0;
  }

  async spop<T = unknown>(key: string): Promise<T | null> {
    const entry = typed(key, "set", false);
    const first = entry?.v.values().next();
    if (!entry || !first || first.done) return null;
    entry.v.delete(first.value);
    dropIfEmpty(key, entry);
    store().changed();
    return deserialize(first.value) as T;
  }

  // Sorted sets

  /** zadd(key, member, ...members) or zadd(key, { nx, xx, gt, lt, ch, incr }, member, ...). */
  async zadd(key: string, ...args: any[]): Promise<number | null> {
    const opts = args[0] && !("member" in args[0]) ? args.shift() : {};
    const entry = typed(key, "zset", true)!;
    let changed = 0;
    let lastScore: number | null = null;
    for (const { score, member } of args as { score: number; member: unknown }[]) {
      const raw = serialize(member);
      const current = entry.v.get(raw);
      const exists = current !== undefined;
      if ((opts.nx && exists) || (opts.xx && !exists)) continue;
      const next = opts.incr ? (current ?? 0) + score : score;
      if (exists && ((opts.gt && next <= current) || (opts.lt && next >= current))) continue;
      if (!exists || (opts.ch && current !== next)) changed++;
      entry.v.set(raw, next);
      lastScore = next;
    }
    dropIfEmpty(key, entry);
    store().changed();
    return opts.incr ? lastScore : changed;
  }

  async zincrby(key: string, increment: number, member: unknown): Promise<number> {
    return (await this.zadd(key, { incr: true }, { score: increment, member })) as number;
  }

  async zscore(key: string, member: unknown): Promise<number | null> {
    return typed(key, "zset", false)?.v.get(serialize(member)) ?? null;
  }

  async zcard(key: string): Promise<number> {
    return typed(key, "zset", false)?.v.size ?? 0;
  }

  async zrem(key: string, ...members: unknown[]): Promise<number> {
    const entry = typed(key, "zset", false);
    if (!entry) return 0;
    const removed = members.flat().filter((m) => entry.v.delete(serialize(m))).length;
    dropIfEmpty(key, entry);
    if (removed) store().changed();
    return removed;
  }

  private sortedZset(key: string): [string, number][] {
    const entry = typed(key, "zset", false);
    if (!entry) return [];
    return [...entry.v].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }

  async zrange<T extends unknown[] = unknown[]>(
    key: string,
    min: number | string,
    max: number | string,
    opts?: ZRangeOptions,
  ): Promise<T> {
    let items = this.sortedZset(key);
    if (opts?.byScore) {
      // With REV, Redis takes the bounds as (max, min).
      const [lo, hi] = opts.rev ? [max, min] : [min, max];
      const low = parseScoreBound(lo, true);
      const high = parseScoreBound(hi, false);
      items = items.filter(
        ([, s]) =>
          (low.exclusive ? s > low.value : s >= low.value) &&
          (high.exclusive ? s < high.value : s <= high.value),
      );
      if (opts.rev) items.reverse();
      if (opts.offset !== undefined || opts.count !== undefined) {
        const offset = opts.offset ?? 0;
        items = items.slice(offset, opts.count === undefined || opts.count < 0 ? undefined : offset + opts.count);
      }
    } else {
      if (opts?.rev) items.reverse();
      items = sliceByIndex(items, Number(min), Number(max));
    }
    const out: unknown[] = [];
    for (const [member, score] of items) {
      out.push(deserialize(member));
      if (opts?.withScores) out.push(score);
    }
    return out as T;
  }

  async zrangebyscore<T extends unknown[] = unknown[]>(key: string, min: number | string, max: number | string) {
    return this.zrange<T>(key, min, max, { byScore: true });
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    const members = await this.zrange<unknown[]>(key, min, max, { byScore: true });
    return this.zrem(key, ...members);
  }

  async zrank(key: string, member: unknown): Promise<number | null> {
    const index = this.sortedZset(key).findIndex(([m]) => m === serialize(member));
    return index < 0 ? null : index;
  }

  // Lists

  private push(key: string, members: unknown[], left: boolean): number {
    const entry = typed(key, "list", true)!;
    for (const member of members) {
      if (left) entry.v.unshift(serialize(member));
      else entry.v.push(serialize(member));
    }
    store().changed();
    return entry.v.length;
  }

  async lpush(key: string, ...members: unknown[]) {
    return this.push(key, members, true);
  }

  async rpush(key: string, ...members: unknown[]) {
    return this.push(key, members, false);
  }

  private pop<T>(key: string, count: number | undefined, left: boolean): T | T[] | null {
    const entry = typed(key, "list", false);
    if (!entry) return null;
    const n = count ?? 1;
    const taken = left ? entry.v.splice(0, n) : entry.v.splice(-n).reverse();
    dropIfEmpty(key, entry);
    store().changed();
    const values = taken.map(deserialize) as T[];
    return count === undefined ? (values[0] ?? null) : values;
  }

  async lpop<T = unknown>(key: string, count?: number) {
    return this.pop<T>(key, count, true);
  }

  async rpop<T = unknown>(key: string, count?: number) {
    return this.pop<T>(key, count, false);
  }

  async lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]> {
    return sliceByIndex(typed(key, "list", false)?.v ?? [], start, stop).map(deserialize);
  }

  async llen(key: string): Promise<number> {
    return typed(key, "list", false)?.v.length ?? 0;
  }

  async lindex<T = unknown>(key: string, index: number): Promise<T | null> {
    const list = typed(key, "list", false)?.v ?? [];
    return deserialize(list[index < 0 ? list.length + index : index]) as T | null;
  }

  async ltrim(key: string, start: number, stop: number) {
    const entry = typed(key, "list", false);
    if (entry) {
      entry.v = sliceByIndex(entry.v, start, stop);
      dropIfEmpty(key, entry);
      store().changed();
    }
    return "OK";
  }

  async lrem(key: string, count: number, value: unknown): Promise<number> {
    const entry = typed(key, "list", false);
    if (!entry) return 0;
    const raw = serialize(value);
    let removed = 0;
    const limit = count === 0 ? Infinity : Math.abs(count);
    const indexes = entry.v.map((v, i) => (v === raw ? i : -1)).filter((i) => i >= 0);
    if (count < 0) indexes.reverse();
    for (const i of indexes.slice(0, limit === Infinity ? undefined : limit).sort((a, b) => b - a)) {
      entry.v.splice(i, 1);
      removed++;
    }
    dropIfEmpty(key, entry);
    if (removed) store().changed();
    return removed;
  }

  // Scripts are not supported: nothing in Papermark uses them.
  async eval(): Promise<never> {
    throw new Error("[selfhost/kv] EVAL is not supported by the local Redis replacement");
  }

  async evalsha(): Promise<never> {
    return this.eval();
  }
}

/** Upstash pipeline: chained commands, run in order by exec(). */
function createPipeline(redis: Redis): any {
  const queue: (() => Promise<unknown>)[] = [];
  const pipeline: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "exec") {
          return async () => {
            const results: unknown[] = [];
            for (const run of queue) results.push(await run());
            queue.length = 0;
            return results;
          };
        }
        if (prop === "length") return () => queue.length;
        if (prop === "then") return undefined; // not a thenable
        const method = (redis as any)[prop];
        if (typeof method !== "function") return undefined;
        return (...args: unknown[]) => {
          queue.push(() => method.apply(redis, args));
          return pipeline;
        };
      },
    },
  );
  return pipeline;
}

/** Test hook: writes pending changes now. */
export function flushSelfhostKv() {
  store().flush();
}

export default Redis;
