"use client";

// Self-hosted replacement for "@trigger.dev/react-hooks": instead of Trigger.dev's
// realtime stream, poll the run API of selfhost/lib/queue.ts (pages/api/selfhost/runs)
// with the public access token the server issued.
import useSWR from "swr";

type RealtimeOptions = { accessToken?: string; enabled?: boolean; baseURL?: string };

type RealtimeRun = {
  id: string;
  taskIdentifier: string;
  status: string;
  metadata?: Record<string, unknown>;
  output?: unknown;
  error?: unknown;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  [key: string]: unknown;
};

const FINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELED", "CRASHED", "SYSTEM_FAILURE"];
const POLL_MS = 1000;

const DATE_FIELDS = ["createdAt", "updatedAt", "startedAt", "finishedAt", "delayedUntil"];

function revive(raw: Record<string, unknown>): RealtimeRun {
  const run = { ...raw };
  for (const field of DATE_FIELDS) {
    if (typeof run[field] === "string") run[field] = new Date(run[field] as string);
  }
  return run as RealtimeRun;
}

async function fetchWithToken<T>([url, token]: [string, string]): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Run status request failed (${response.status})`);
  return response.json();
}

export function useRealtimeRun(runId?: string, options: RealtimeOptions = {}) {
  const enabled = options.enabled !== false && !!runId && !!options.accessToken;
  const { data, error } = useSWR<Record<string, unknown>>(
    enabled ? [`${options.baseURL ?? ""}/api/selfhost/runs/${runId}`, options.accessToken] : null,
    fetchWithToken,
    {
      refreshInterval: (latest) =>
        latest && FINAL_STATUSES.includes(latest.status as string) ? 0 : POLL_MS,
      revalidateOnFocus: false,
    },
  );
  return { run: data ? revive(data) : undefined, error, stop: () => {} };
}

export function useRealtimeRunsWithTag(tag: string | string[], options: RealtimeOptions = {}) {
  const enabled = options.enabled !== false && !!options.accessToken;
  const query = new URLSearchParams(([] as string[]).concat(tag).map((t) => ["tag", t]));
  const { data, error } = useSWR<{ runs: Record<string, unknown>[] }>(
    enabled ? [`${options.baseURL ?? ""}/api/selfhost/runs?${query}`, options.accessToken] : null,
    fetchWithToken,
    { refreshInterval: POLL_MS, revalidateOnFocus: false },
  );
  return { runs: (data?.runs ?? []).map(revive), error, stop: () => {} };
}
