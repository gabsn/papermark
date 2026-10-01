// Self-hosted replacement for "@trigger.dev/sdk" (and "/v3"): tasks run in this server
// process, from the disk queue in selfhost/lib/queue.ts, by the worker in selfhost/worker.ts.
//
// Supported: task, schemaTask, schedules.task (cron), queue(), tasks.trigger /
// batchTrigger / triggerAndWait / batchTriggerAndWait (and the same methods on a task),
// runs.retrieve / list / cancel, auth.createPublicToken, metadata.*, logger, wait.for /
// wait.until, idempotencyKeys.create, AbortTaskRunError, configure.
// Ignored options: machine, maxDuration, ttl, priority, lifecycle hooks (onStart, onSuccess…).
import { AsyncLocalStorage } from "node:async_hooks";

import {
  type ReadScopes,
  type RunRecord,
  type RunStatus,
  cancelRun,
  createAccessToken,
  createRun,
  isCancelRequested,
  listRuns,
  moveRun,
  parseDuration,
  readRun,
  runStatus,
  saveRun,
  toTriggerRun,
} from "../lib/queue";

// ---------------------------------------------------------------------------
// Types

export type RetryOptions = {
  maxAttempts?: number;
  minTimeoutInMs?: number;
  maxTimeoutInMs?: number;
  factor?: number;
  randomize?: boolean;
};

export type QueueOptions = { name: string; concurrencyLimit?: number };

export type TaskRunContext = {
  run: { id: string; tags: string[]; createdAt: Date; idempotencyKey?: string; isTest: boolean };
  task: { id: string };
  attempt: { number: number; maxAttempts: number };
  queue: { name: string };
  environment: { type: "PRODUCTION" };
};

type RunParams = { ctx: TaskRunContext; signal: AbortSignal };

type TaskOptions<TPayload, TOutput> = {
  id: string;
  run: (payload: TPayload, params: RunParams) => Promise<TOutput> | TOutput;
  retry?: RetryOptions;
  queue?: QueueOptions;
  schema?: { parse: (input: unknown) => TPayload };
  cron?: string | { pattern: string; timezone?: string };
  [ignored: string]: unknown; // machine, maxDuration…
};

export type TriggerOptions = {
  delay?: string | Date;
  idempotencyKey?: string | string[];
  idempotencyKeyTTL?: string;
  concurrencyKey?: string;
  queue?: string | { name: string };
  tags?: string | string[];
  metadata?: Record<string, unknown>;
  maxAttempts?: number;
  [ignored: string]: unknown; // ttl, machine, priority…
};

export type RunHandle = { id: string; taskIdentifier: string; publicAccessToken: string };

export type TaskRunResult<TOutput = any> =
  | { ok: true; id: string; taskIdentifier: string; output: TOutput }
  | { ok: false; id: string; taskIdentifier: string; error: unknown };

type TaskRunPromise<TOutput> = Promise<TaskRunResult<TOutput>> & {
  unwrap: () => Promise<TOutput>;
};

type BatchItem<TPayload> = { payload: TPayload; options?: TriggerOptions };

export class AbortTaskRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbortTaskRunError";
  }
}

// ---------------------------------------------------------------------------
// Registry: lives on globalThis so every bundle in this process shares it.

type RegisteredTask = TaskOptions<any, any>;
type RunScope = {
  run: RunRecord;
  dirty: boolean;
  saving: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
};

const registry: {
  tasks: Map<string, RegisteredTask>;
  queues: Map<string, QueueOptions>;
  unsupported: Map<string, string>;
  scope: AsyncLocalStorage<RunScope>;
} = ((globalThis as any).__selfhostTrigger ??= {
  tasks: new Map(),
  queues: new Map(),
  unsupported: new Map(),
  scope: new AsyncLocalStorage<RunScope>(),
});

// Defaults of trigger.config.ts.
const DEFAULT_RETRY: Required<RetryOptions> = {
  maxAttempts: 3,
  minTimeoutInMs: 1000,
  maxTimeoutInMs: 10000,
  factor: 2,
  randomize: true,
};
export const DEFAULT_QUEUE_CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// Triggering

const asArray = (value?: string | string[]) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

function delayToRunAt(delay?: string | Date) {
  if (!delay) return undefined;
  if (delay instanceof Date) return delay.getTime();
  const asDate = Date.parse(delay);
  return Number.isNaN(asDate) ? Date.now() + parseDuration(delay) : asDate;
}

async function enqueue(
  taskIdentifier: string,
  payload: unknown,
  options: TriggerOptions = {},
  state: "pending" | "running" = "pending",
) {
  const { run } = await createRun({
    taskIdentifier,
    payload,
    state,
    queue: typeof options.queue === "string" ? options.queue : options.queue?.name,
    concurrencyKey: options.concurrencyKey,
    idempotencyKey: asArray(options.idempotencyKey).join("-") || undefined,
    idempotencyKeyTTLMs: options.idempotencyKeyTTL
      ? parseDuration(options.idempotencyKeyTTL)
      : undefined,
    maxAttempts: options.maxAttempts,
    tags: asArray(options.tags),
    metadata: options.metadata,
    runAt: delayToRunAt(options.delay),
  });
  return run;
}

const runToken = (runId: string) =>
  createAccessToken({ runs: [runId] }, Date.now() + 24 * 3600 * 1000);

async function trigger(
  taskIdentifier: string,
  payload: unknown,
  options?: TriggerOptions,
): Promise<RunHandle> {
  const run = await enqueue(taskIdentifier, payload, options);
  return { id: run.id, taskIdentifier, publicAccessToken: runToken(run.id) };
}

async function batchTrigger(taskIdentifier: string, items: BatchItem<unknown>[]) {
  const runs = [];
  for (const item of items) runs.push(await trigger(taskIdentifier, item.payload, item.options));
  const batchId = `batch_${runs[0]?.id ?? Date.now().toString(36)}`;
  return {
    batchId,
    runCount: runs.length,
    runs,
    publicAccessToken: createAccessToken(
      { runs: runs.map((r) => r.id) },
      Date.now() + 24 * 3600 * 1000,
    ),
  };
}

// triggerAndWait: the child run is executed inline, in the caller's process, so a
// parent never waits for a worker slot (no deadlock); it is still recorded on disk.
function triggerAndWait<TOutput>(
  taskIdentifier: string,
  payload: unknown,
  options?: TriggerOptions,
): TaskRunPromise<TOutput> {
  const promise = (async (): Promise<TaskRunResult<TOutput>> => {
    const run = await enqueue(taskIdentifier, payload, options, "running");
    await executeRun(run, new AbortController().signal, { inline: true });
    if (run.state === "done") {
      return { ok: true, id: run.id, taskIdentifier, output: run.output as TOutput };
    }
    return { ok: false, id: run.id, taskIdentifier, error: run.error };
  })();
  return Object.assign(promise, {
    unwrap: async () => {
      const result = await promise;
      if (result.ok) return result.output;
      const error = result.error as { message?: string } | undefined;
      throw new Error(error?.message ?? `Run ${result.id} failed`);
    },
  });
}

async function batchTriggerAndWait<TOutput>(taskIdentifier: string, items: BatchItem<unknown>[]) {
  const runs = await Promise.all(
    items.map((item) => triggerAndWait<TOutput>(taskIdentifier, item.payload, item.options)),
  );
  return { id: `batch_${runs[0]?.id ?? Date.now().toString(36)}`, runs };
}

export const tasks = {
  trigger: <_T = unknown>(id: string, payload: unknown, options?: TriggerOptions) =>
    trigger(id, payload, options),
  batchTrigger: <_T = unknown>(id: string, items: BatchItem<unknown>[]) => batchTrigger(id, items),
  triggerAndWait: <TOutput = any>(id: string, payload: unknown, options?: TriggerOptions) =>
    triggerAndWait<TOutput>(id, payload, options),
  batchTriggerAndWait: <TOutput = any>(id: string, items: BatchItem<unknown>[]) =>
    batchTriggerAndWait<TOutput>(id, items),
};

// ---------------------------------------------------------------------------
// Task definitions

export function task<TPayload = any, TOutput = any>(options: TaskOptions<TPayload, TOutput>) {
  registry.tasks.set(options.id, options);
  if (options.queue) queue(options.queue);
  return {
    id: options.id,
    trigger: (payload: TPayload, opts?: TriggerOptions) => trigger(options.id, payload, opts),
    batchTrigger: (items: BatchItem<TPayload>[]) => batchTrigger(options.id, items),
    triggerAndWait: (payload: TPayload, opts?: TriggerOptions) =>
      triggerAndWait<TOutput>(options.id, payload, opts),
    batchTriggerAndWait: (items: BatchItem<TPayload>[]) =>
      batchTriggerAndWait<TOutput>(options.id, items),
  };
}

export const schemaTask = <TPayload = any, TOutput = any>(
  options: TaskOptions<TPayload, TOutput> & { schema: { parse: (input: unknown) => TPayload } },
) => task(options);

export type ScheduledPayload = {
  timestamp: Date;
  lastTimestamp?: Date;
  timezone: string;
  scheduleId: string;
  type: "DECLARATIVE";
  upcoming: Date[];
};

export const schedules = {
  task: <TOutput = any>(
    options: TaskOptions<ScheduledPayload, TOutput> & {
      cron: string | { pattern: string; timezone?: string };
    },
  ) => task(options),
};

export function queue(options: QueueOptions) {
  registry.queues.set(options.name, options);
  return options;
}

// ---------------------------------------------------------------------------
// Runs API

export const runs = {
  retrieve: async (runOrId: string | { id: string }) => {
    const id = typeof runOrId === "string" ? runOrId : runOrId.id;
    const run = await readRun(id);
    if (!run) throw new Error(`Run ${id} not found`);
    return toTriggerRun(run);
  },
  cancel: async (runOrId: string | { id: string }) => {
    const id = typeof runOrId === "string" ? runOrId : runOrId.id;
    await cancelRun(id);
    return { id };
  },
  // Filters as in Trigger.dev: values within one filter are ORed, filters are ANDed.
  list: async (
    filter: {
      taskIdentifier?: string | string[];
      tag?: string | string[];
      status?: RunStatus | RunStatus[];
      period?: string;
      from?: Date | number;
      to?: Date | number;
      limit?: number;
    } = {},
  ) => {
    const taskIds = asArray(filter.taskIdentifier);
    const tags = asArray(filter.tag);
    const statuses = asArray(filter.status) as RunStatus[];
    const from = filter.period
      ? Date.now() - parseDuration(filter.period)
      : filter.from
        ? new Date(filter.from).getTime()
        : 0;
    const to = filter.to ? new Date(filter.to).getTime() : Infinity;
    const data = (await listRuns())
      .filter(
        (run) =>
          (!taskIds.length || taskIds.includes(run.taskIdentifier)) &&
          (!tags.length || tags.some((tag) => run.tags.includes(tag))) &&
          (!statuses.length || statuses.includes(runStatus(run))) &&
          run.createdAt >= from &&
          run.createdAt <= to,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, filter.limit ?? 100)
      .map((run) => toTriggerRun(run, { withPayload: false }));
    return {
      data,
      async *[Symbol.asyncIterator]() {
        yield* data;
      },
    };
  },
};

export const auth = {
  createPublicToken: async (
    options: { scopes?: { read?: ReadScopes }; expirationTime?: string | number | Date } = {},
  ) => {
    const exp = options.expirationTime ?? "15m";
    const expiresAt =
      exp instanceof Date
        ? exp.getTime()
        : typeof exp === "number"
          ? exp * 1000 // seconds since epoch, as in Trigger.dev
          : Date.now() + parseDuration(exp);
    return createAccessToken(options.scopes?.read ?? {}, expiresAt);
  },
};

export const idempotencyKeys = {
  create: async (key: string | string[]) => asArray(key).join("-"),
};

export function configure(_options?: unknown) {}
export const defineConfig = <T>(config: T) => config;
export const timeout = { None: 0 };

// ---------------------------------------------------------------------------
// Inside a run: metadata, logger, wait

const currentScope = () => registry.scope.getStore();

// Metadata changes are written to the run file at most every 250 ms.
function scheduleSave(scope: RunScope) {
  scope.dirty = true;
  scope.timer ??= setTimeout(() => {
    scope.timer = undefined;
    scope.saving = scope.saving.then(() => flushScope(scope));
  }, 250);
}

async function flushScope(scope: RunScope) {
  if (!scope.dirty || scope.run.state !== "running") return;
  scope.dirty = false;
  await saveRun(scope.run).catch((error) =>
    console.error(`[queue] could not save metadata of ${scope.run.id}`, error),
  );
}

function updateMetadata(change: (metadata: Record<string, unknown>) => void) {
  const scope = currentScope();
  if (!scope) return; // outside a run, Trigger.dev ignores metadata calls too
  change(scope.run.metadata);
  scheduleSave(scope);
}

export const metadata = {
  current: () => currentScope()?.run.metadata,
  get: (key: string) => currentScope()?.run.metadata[key],
  set: (key: string, value: unknown) => {
    updateMetadata((m) => (m[key] = value));
    return metadata;
  },
  del: (key: string) => {
    updateMetadata((m) => delete m[key]);
    return metadata;
  },
  replace: (value: Record<string, unknown>) => {
    updateMetadata((m) => {
      for (const key of Object.keys(m)) delete m[key];
      Object.assign(m, value);
    });
    return metadata;
  },
  append: (key: string, value: unknown) => {
    updateMetadata((m) => (m[key] = [...((m[key] as unknown[]) ?? []), value]));
    return metadata;
  },
  remove: (key: string, value: unknown) => {
    updateMetadata((m) => (m[key] = ((m[key] as unknown[]) ?? []).filter((v) => v !== value)));
    return metadata;
  },
  increment: (key: string, by = 1) => {
    updateMetadata((m) => (m[key] = ((m[key] as number) ?? 0) + by));
    return metadata;
  },
  decrement: (key: string, by = 1) => metadata.increment(key, -by),
  flush: async () => {
    const scope = currentScope();
    if (scope) await (scope.saving = scope.saving.then(() => flushScope(scope)));
  },
  refresh: async () => {},
};

function log(level: "debug" | "log" | "info" | "warn" | "error") {
  return (message: string, properties?: Record<string, unknown>) => {
    const run = currentScope()?.run;
    const prefix = run ? `[${run.taskIdentifier} ${run.id}]` : "[task]";
    const write = level === "log" ? console.log : console[level];
    if (properties === undefined) write(prefix, message);
    else write(prefix, message, properties);
  };
}

export const logger = {
  debug: log("debug"),
  log: log("log"),
  info: log("info"),
  warn: log("warn"),
  error: log("error"),
  trace: async <T>(_name: string, fn: (span: unknown) => Promise<T>) => fn({}),
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const wait = {
  for: async (d: { seconds?: number; minutes?: number; hours?: number; days?: number; weeks?: number }) =>
    sleep(
      ((d.seconds ?? 0) +
        (d.minutes ?? 0) * 60 +
        (d.hours ?? 0) * 3600 +
        (d.days ?? 0) * 86400 +
        (d.weeks ?? 0) * 604800) *
        1000,
    ),
  until: async (d: { date: Date }) => sleep(Math.max(0, d.date.getTime() - Date.now())),
};

// ---------------------------------------------------------------------------
// Execution (used by the worker and by triggerAndWait)

const toRunError = (error: unknown) =>
  error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: "Error", message: String(error) };

function retryOptions(run: RunRecord) {
  const retry = { ...DEFAULT_RETRY, ...registry.tasks.get(run.taskIdentifier)?.retry };
  if (run.maxAttempts) retry.maxAttempts = run.maxAttempts;
  return retry;
}

function retryDelay(retry: Required<RetryOptions>, attempt: number) {
  const base = retry.minTimeoutInMs * retry.factor ** (attempt - 1);
  const jitter = retry.randomize ? 1 + Math.random() : 1;
  return Math.min(retry.maxTimeoutInMs, Math.round(base * jitter));
}

export function queueOf(run: RunRecord): QueueOptions {
  const name =
    run.queue ?? registry.tasks.get(run.taskIdentifier)?.queue?.name ?? `task/${run.taskIdentifier}`;
  return registry.queues.get(name) ?? { name, concurrencyLimit: DEFAULT_QUEUE_CONCURRENCY };
}

export function markUnsupported(taskIdentifier: string, reason: string) {
  registry.unsupported.set(taskIdentifier, reason);
}

export const registeredTasks = () => [...registry.tasks.values()];

// Run one attempt of a run this process owns (state "running").
async function runAttempt(run: RunRecord, signal: AbortSignal, maxAttempts: number) {
  const definition = registry.tasks.get(run.taskIdentifier);
  const unsupported = registry.unsupported.get(run.taskIdentifier);
  if (!definition || unsupported) {
    const reason =
      unsupported ?? `Task "${run.taskIdentifier}" is not supported in self-hosted mode.`;
    return { ok: false as const, error: new AbortTaskRunError(reason) };
  }

  const scope: RunScope = { run, dirty: false, saving: Promise.resolve() };
  const ctx: TaskRunContext = {
    run: {
      id: run.id,
      tags: run.tags,
      createdAt: new Date(run.createdAt),
      idempotencyKey: run.idempotencyKey,
      isTest: false,
    },
    task: { id: run.taskIdentifier },
    attempt: { number: run.attempt, maxAttempts },
    queue: { name: queueOf(run).name },
    environment: { type: "PRODUCTION" },
  };

  try {
    let payload = run.payload;
    if (definition.cron) {
      const p = payload as { timestamp: string; upcoming?: string[] };
      payload = { ...p, timestamp: new Date(p.timestamp), upcoming: [] };
    }
    if (definition.schema) payload = definition.schema.parse(payload);
    const output = await registry.scope.run(scope, () => definition.run(payload, { ctx, signal }));
    return { ok: true as const, output };
  } catch (error) {
    return { ok: false as const, error };
  } finally {
    clearTimeout(scope.timer);
    scope.timer = undefined;
    await scope.saving; // never let a late metadata write land after the final state
  }
}

// Execute a claimed run until it finishes or must wait for a retry. The worker passes
// inline: false, so a retry goes back to pending/ with a later runAt (survives restarts);
// triggerAndWait passes inline: true and retries in place.
export async function executeRun(
  run: RunRecord,
  signal: AbortSignal,
  { inline }: { inline: boolean },
) {
  const retry = retryOptions(run);
  for (;;) {
    run.attempt += 1;
    run.startedAt ??= Date.now();
    await saveRun(run);

    const result = await runAttempt(run, signal, retry.maxAttempts);
    const canceled = signal.aborted || (await isCancelRequested(run.id));

    if (result.ok && !canceled) {
      run.output = result.output ?? null;
      run.error = undefined;
      run.finishedAt = Date.now();
      return moveRun(run, "done");
    }

    run.error = canceled
      ? { name: "Canceled", message: "Run canceled" }
      : toRunError(result.ok ? undefined : result.error);
    const aborted = !result.ok && result.error instanceof AbortTaskRunError;
    if (canceled || aborted || run.attempt >= retry.maxAttempts) {
      run.finishedAt = Date.now();
      if (!canceled) console.error(`[queue] ${run.taskIdentifier} ${run.id} failed:`, run.error.message);
      return moveRun(run, canceled ? "canceled" : "failed");
    }

    const delay = retryDelay(retry, run.attempt);
    console.warn(
      `[queue] ${run.taskIdentifier} ${run.id} attempt ${run.attempt} failed (${run.error.message}), retrying in ${delay} ms`,
    );
    if (inline) {
      await sleep(delay);
      continue;
    }
    run.runAt = Date.now() + delay;
    run.lockedBy = undefined;
    return moveRun(run, "pending");
  }
}
