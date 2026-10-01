// Disk-based job queue for the self-hosted build (replaces Trigger.dev and QStash).
//
// One JSON file per run, under $PAPERMARK_DATA/queue/<state>/<runId>.json. The folder
// is the state: a worker claims a run by renaming it from pending/ to running/, which
// is atomic on one filesystem, so two processes can never execute the same run.
//
//   pending/    waiting to run (runAt in the future = delayed, or waiting for a retry)
//   running/    claimed by the worker process `lockedBy`
//   done/ failed/ canceled/   finished; deleted after the retention period
//   cancel/     markers asking the worker to abort a running run
//   idempotency/  idempotency key → run id
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";

import { dataPath } from "./paths";

export type RunState = "pending" | "running" | "done" | "failed" | "canceled";
const STATES: RunState[] = ["pending", "running", "done", "failed", "canceled"];

export type RunError = { name: string; message: string; stack?: string };

export type RunRecord = {
  id: string;
  taskIdentifier: string;
  payload: unknown;
  state: RunState;
  queue?: string;
  concurrencyKey?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: number;
  runAt: number;
  delayed: boolean;
  attempt: number;
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
  output?: unknown;
  error?: RunError;
  lockedBy?: number;
};

// Trigger.dev run statuses the app checks for.
export type RunStatus =
  | "DELAYED"
  | "QUEUED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED";

const queueDir = (...parts: string[]) => dataPath("queue", ...parts);
const runFile = (state: RunState, id: string) => queueDir(state, `${id}.json`);

let dirsReady: Promise<unknown> | undefined;
export function ensureQueueDirs() {
  dirsReady ??= Promise.all(
    [...STATES, "cancel", "idempotency"].map((d) =>
      mkdir(queueDir(d), { recursive: true }),
    ),
  );
  return dirsReady;
}

// Time-sortable id, so a directory listing sorted by name is in creation order.
export const newRunId = () =>
  `run_${Date.now().toString(36).padStart(9, "0")}${randomBytes(5).toString("hex")}`;

// Write to a temporary file then rename, so readers never see half a file.
async function writeJsonAtomic(path: string, data: unknown) {
  const tmp = `${path}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, path);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null; // missing, moved meanwhile, or being written
  }
}

const isMissing = (error: unknown) =>
  (error as NodeJS.ErrnoException)?.code === "ENOENT";

export async function readRun(id: string): Promise<RunRecord | null> {
  if (!/^run_[a-z0-9]+$/.test(id)) return null;
  await ensureQueueDirs();
  // Two passes: a run can move between folders while we look.
  for (let pass = 0; pass < 2; pass++) {
    for (const state of STATES) {
      const run = await readJson<RunRecord>(runFile(state, id));
      if (run) return { ...run, state };
    }
  }
  return null;
}

export async function listRuns(states: RunState[] = STATES): Promise<RunRecord[]> {
  await ensureQueueDirs();
  const runs: RunRecord[] = [];
  for (const state of states) {
    const names = (await readdir(queueDir(state))).filter((n) => n.endsWith(".json"));
    for (const name of names.sort()) {
      const run = await readJson<RunRecord>(queueDir(state, name));
      if (run) runs.push({ ...run, state });
    }
  }
  return runs;
}

// Rewrite a run in the folder of its current state.
export async function saveRun(run: RunRecord) {
  run.updatedAt = Date.now();
  await writeJsonAtomic(runFile(run.state, run.id), run);
}

// Move a run owned by this process to another state (write, then rename).
export async function moveRun(run: RunRecord, to: RunState) {
  const from = run.state;
  await saveRun(run);
  await rename(runFile(from, run.id), runFile(to, run.id));
  run.state = to;
}

// Claim a pending run for this process. Returns null if another process got it first.
export async function claimRun(id: string): Promise<RunRecord | null> {
  try {
    await rename(runFile("pending", id), runFile("running", id));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  const run = await readJson<RunRecord>(runFile("running", id));
  if (!run) return null;
  run.state = "running";
  run.lockedBy = process.pid;
  await saveRun(run);
  return run;
}

type NewRun = {
  taskIdentifier: string;
  payload: unknown;
  queue?: string;
  concurrencyKey?: string;
  idempotencyKey?: string;
  idempotencyKeyTTLMs?: number;
  maxAttempts?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  runAt?: number;
  // "running": the caller executes the run itself (triggerAndWait).
  state?: "pending" | "running";
};

const DEFAULT_IDEMPOTENCY_TTL_MS = 30 * 24 * 3600 * 1000; // Trigger.dev's default

// Create a run, or return the existing one when the idempotency key was already used.
export async function createRun(input: NewRun): Promise<{ run: RunRecord; existing: boolean }> {
  await ensureQueueDirs();
  const now = Date.now();
  let idemPath: string | undefined;
  if (input.idempotencyKey) {
    const hash = createHash("sha256")
      .update(`${input.taskIdentifier}\0${input.idempotencyKey}`)
      .digest("hex");
    idemPath = queueDir("idempotency", `${hash}.json`);
    const previous = await readJson<{ runId: string; expiresAt: number }>(idemPath);
    if (previous && previous.expiresAt > now) {
      const run = await readRun(previous.runId);
      if (run) return { run, existing: true };
    }
  }

  const runAt = input.runAt ?? now;
  const run: RunRecord = {
    id: newRunId(),
    taskIdentifier: input.taskIdentifier,
    payload: input.payload ?? null,
    state: input.state ?? "pending",
    queue: input.queue,
    concurrencyKey: input.concurrencyKey,
    idempotencyKey: input.idempotencyKey,
    maxAttempts: input.maxAttempts,
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    createdAt: now,
    runAt,
    delayed: runAt > now,
    attempt: 0,
    updatedAt: now,
    lockedBy: input.state === "running" ? process.pid : undefined,
  };
  await saveRun(run);
  if (idemPath) {
    const ttl = input.idempotencyKeyTTLMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
    await writeJsonAtomic(idemPath, { runId: run.id, expiresAt: now + ttl });
  }
  return { run, existing: false };
}

// Cancel a run: pending runs move to canceled/ at once; running runs get a marker the
// worker turns into an abort signal. Finished runs are left as they are.
export async function cancelRun(id: string): Promise<RunRecord | null> {
  await ensureQueueDirs();
  try {
    await rename(runFile("pending", id), runFile("canceled", id));
    const run = await readJson<RunRecord>(runFile("canceled", id));
    if (run) {
      run.state = "canceled";
      run.finishedAt = Date.now();
      await saveRun(run);
    }
    return run;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const run = await readRun(id);
  if (run?.state === "running") {
    await writeFile(queueDir("cancel", id), String(Date.now()));
  }
  return run;
}

export async function isCancelRequested(id: string) {
  try {
    await stat(queueDir("cancel", id));
    return true;
  } catch {
    return false;
  }
}

// Delete finished runs, cancel markers and idempotency keys older than the retention.
export async function pruneQueue(retentionMs: number) {
  await ensureQueueDirs();
  const cutoff = Date.now() - retentionMs;
  for (const run of await listRuns(["done", "failed", "canceled"])) {
    if ((run.finishedAt ?? run.updatedAt) < cutoff) {
      await rm(runFile(run.state, run.id), { force: true });
      await rm(queueDir("cancel", run.id), { force: true });
    }
  }
  for (const name of await readdir(queueDir("idempotency"))) {
    const entry = await readJson<{ expiresAt: number }>(queueDir("idempotency", name));
    if (!entry || entry.expiresAt < Date.now()) {
      await rm(queueDir("idempotency", name), { force: true });
    }
  }
}

export function runStatus(run: RunRecord): RunStatus {
  switch (run.state) {
    case "pending":
      if (run.attempt > 0) return "EXECUTING"; // waiting between two attempts
      return run.runAt > Date.now() ? "DELAYED" : "QUEUED";
    case "running":
      return "EXECUTING";
    case "done":
      return "COMPLETED";
    case "failed":
      return "FAILED";
    case "canceled":
      return "CANCELED";
  }
}

// The run as Trigger.dev's runs.retrieve() returns it (dates as Date objects).
export function toTriggerRun(run: RunRecord, { withPayload = true } = {}) {
  const status = runStatus(run);
  const date = (ms?: number) => (ms ? new Date(ms) : undefined);
  return {
    id: run.id,
    taskIdentifier: run.taskIdentifier,
    status,
    payload: withPayload ? run.payload : undefined,
    output: run.output,
    error: run.error,
    metadata: run.metadata,
    tags: run.tags,
    idempotencyKey: run.idempotencyKey,
    attemptCount: run.attempt,
    isTest: false,
    createdAt: new Date(run.createdAt),
    updatedAt: new Date(run.updatedAt),
    startedAt: date(run.startedAt),
    finishedAt: date(run.finishedAt),
    delayedUntil: run.delayed ? new Date(run.runAt) : undefined,
    isQueued: status === "QUEUED" || status === "DELAYED",
    isExecuting: status === "EXECUTING",
    isCompleted: status === "COMPLETED",
    isFailed: status === "FAILED",
    isCancelled: status === "CANCELED",
    isSuccess: status === "COMPLETED",
  };
}

// "15m", "90d", "1h", "30s", "2w" → milliseconds.
export function parseDuration(value: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration "${value}"`);
  const unit = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[match[2]]!;
  return Number(match[1]) * unit;
}

// Signatures (public access tokens, QStash-style request signatures) use NEXTAUTH_SECRET.
function hmac(data: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to sign queue tokens");
  return createHmac("sha256", `selfhost-queue:${secret}`).update(data).digest("base64url");
}

export const signData = (data: string) => `selfhost.${hmac(data)}`;

export function verifySignedData(signature: string, data: string) {
  try {
    const expected = Buffer.from(signData(data));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

export type ReadScopes = { runs?: string[]; tags?: string[]; tasks?: string[] };

export function createAccessToken(scopes: ReadScopes, expiresAt: number) {
  const body = Buffer.from(JSON.stringify({ read: scopes, exp: expiresAt })).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyAccessToken(token: string | undefined): ReadScopes | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature || !verifySignedData(`selfhost.${signature}`, body)) return null;
  const { read, exp } = JSON.parse(Buffer.from(body, "base64url").toString()) as {
    read: ReadScopes;
    exp: number;
  };
  return exp > Date.now() ? read : null;
}

export const canRead = (scopes: ReadScopes, run: RunRecord) =>
  !!scopes.runs?.includes(run.id) ||
  !!scopes.tasks?.includes(run.taskIdentifier) ||
  !!scopes.tags?.some((tag) => run.tags.includes(tag));

