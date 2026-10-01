// Background worker of the self-hosted build, started once per server process by
// instrumentation.ts. Every second it claims due runs from the disk queue
// (selfhost/lib/queue.ts) and executes them in this process, within per-queue
// concurrency limits; every minute it enqueues the cron tasks that are due.
import { cronMatches } from "./lib/cron";
import {
  type RunRecord,
  claimRun,
  ensureQueueDirs,
  isCancelRequested,
  listRuns,
  moveRun,
  pruneQueue,
} from "./lib/queue";
import { HTTP_TASK_ID } from "./shims/upstash-qstash";
import {
  executeRun,
  markUnsupported,
  queueOf,
  registeredTasks,
  tasks,
} from "./shims/trigger-sdk";

const MAX_CONCURRENT_RUNS = Number(process.env.SELFHOST_WORKER_CONCURRENCY ?? 4);
const RETENTION_MS = Number(process.env.SELFHOST_QUEUE_RETENTION_DAYS ?? 7) * 86400_000;
const TICK_MS = 1000;

// Tasks that need the hosted Trigger.dev machines (ffmpeg, Python, LibreOffice…).
const UNSUPPORTED: Record<string, string> = {
  "process-video": "Video processing (ffmpeg) is not supported in self-hosted mode.",
  "backfill-video-lengths": "Video processing (ffmpeg) is not supported in self-hosted mode.",
  "convert-files-to-pdf": "Office document conversion is not supported in self-hosted mode.",
  "convert-keynote-to-pdf": "Keynote conversion is not supported in self-hosted mode.",
  "convert-cad-to-pdf": "CAD conversion is not supported in self-hosted mode.",
};

// QStash schedules (configured in the Upstash console for the hosted app) that matter
// self-hosted. The custom-domain and year-in-review crons are left out.
const HTTP_CRONS = [
  { cron: "0 9 * * *", path: "/api/cron/dataroom-digest/daily" },
  { cron: "0 9 * * 1", path: "/api/cron/dataroom-digest/weekly" },
];

const active = new Map<string, { slot: string; abort: AbortController }>();

const slotOf = (run: RunRecord) => `${queueOf(run).name}|${run.concurrencyKey ?? ""}`;
const busy = (slot: string) => [...active.values()].filter((a) => a.slot === slot).length;

function start(run: RunRecord) {
  const entry = { slot: slotOf(run), abort: new AbortController() };
  active.set(run.id, entry);
  executeRun(run, entry.abort.signal, { inline: false })
    .catch((error) => console.error(`[queue] worker error on ${run.id}`, error))
    .finally(() => active.delete(run.id));
}

// Claim and start every due run that fits in the concurrency limits.
export async function claimDueRuns() {
  const now = Date.now();
  const due = (await listRuns(["pending"]))
    .filter((run) => run.runAt <= now)
    .sort((a, b) => a.runAt - b.runAt);
  for (const run of due) {
    if (active.size >= MAX_CONCURRENT_RUNS) break;
    const limit = queueOf(run).concurrencyLimit ?? Infinity;
    if (busy(slotOf(run)) >= limit) continue;
    const claimed = await claimRun(run.id);
    if (claimed) start(claimed);
  }
  for (const [id, entry] of active) {
    if (await isCancelRequested(id)) entry.abort.abort();
  }
}

// Wait until the active runs finish (tests, graceful shutdown).
export async function drain() {
  while (active.size) await new Promise((resolve) => setTimeout(resolve, 50));
}

const pidAlive = (pid?: number) => {
  if (!pid || pid === process.pid) return false; // our own pid: left by a previous boot
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

// Runs left in running/ by a process that died go back to pending/.
export async function recoverOrphanedRuns() {
  for (const run of await listRuns(["running"])) {
    if (pidAlive(run.lockedBy)) continue;
    console.warn(`[queue] recovering ${run.taskIdentifier} ${run.id} after a crash`);
    run.lockedBy = undefined;
    run.runAt = Date.now();
    await moveRun(run, "pending");
  }
}

// One enqueue per cron task and minute, deduplicated by idempotency key across processes.
export async function enqueueDueCrons(now = new Date()) {
  const minute = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const key = minute.toISOString();
  for (const definition of registeredTasks()) {
    if (!definition.cron) continue;
    const pattern = typeof definition.cron === "string" ? definition.cron : definition.cron.pattern;
    if (!cronMatches(pattern, minute)) continue;
    await tasks.trigger(
      definition.id,
      { timestamp: minute, timezone: "UTC", scheduleId: `selfhost-${definition.id}`, type: "DECLARATIVE" },
      { idempotencyKey: `cron:${key}` },
    );
  }
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  for (const { cron, path } of HTTP_CRONS) {
    if (!baseUrl || !cronMatches(cron, minute)) continue;
    await tasks.trigger(
      HTTP_TASK_ID,
      {
        url: `${baseUrl}${path}`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        createdAt: Date.now(),
      },
      { idempotencyKey: `cron:${path}:${key}` },
    );
  }
}

export async function startWorker() {
  // Once per process, even if several bundles load this module.
  if ((globalThis as any).__selfhostWorkerStarted) return;
  (globalThis as any).__selfhostWorkerStarted = true;

  await (await import("./tasks")).loadTaskModules();
  for (const [id, reason] of Object.entries(UNSUPPORTED)) markUnsupported(id, reason);
  await ensureQueueDirs();
  await recoverOrphanedRuns();

  let lastMinute = 0;
  let lastPrune = 0;
  const tick = async () => {
    try {
      const minute = Math.floor(Date.now() / 60000);
      if (minute !== lastMinute) {
        lastMinute = minute;
        await enqueueDueCrons();
      }
      if (Date.now() - lastPrune > 3600_000) {
        lastPrune = Date.now();
        await pruneQueue(RETENTION_MS);
      }
      await claimDueRuns();
    } catch (error) {
      console.error("[queue] worker tick failed", error);
    }
    setTimeout(tick, TICK_MS);
  };
  // Tasks call this server's API routes over HTTP: give it a moment to listen.
  setTimeout(tick, 5000);
  console.log(
    `[queue] worker started: ${registeredTasks().length} tasks, ${MAX_CONCURRENT_RUNS} concurrent runs`,
  );
}
