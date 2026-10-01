// Self-hosted replacement for "@upstash/qstash": publish() enqueues an HTTP job on the
// local disk queue; the worker POSTs it (with retries) and calls the callback URLs the
// way QStash does. Requests to this server are signed with NEXTAUTH_SECRET in the
// Upstash-Signature header, which Receiver.verify() checks.
// Not supported: topics / URL groups, schedules, queues, batch, DLQ and message APIs.
import { parseDuration, signData, verifySignedData } from "../lib/queue";
import { logger, task, tasks } from "./trigger-sdk";

export const HTTP_TASK_ID = "selfhost-http";

type HttpJobPayload = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  callback?: string;
  failureCallback?: string;
  createdAt: number;
};

type PublishRequest = {
  url?: string;
  topic?: string;
  urlGroup?: string;
  body?: string;
  method?: string;
  headers?: HeadersInit;
  delay?: number | string; // seconds, or "10s" / "5m" / "2h" / "1d"
  notBefore?: number; // unix seconds
  retries?: number;
  callback?: string;
  failureCallback?: string;
  deduplicationId?: string;
};

const ownOrigins = () =>
  [process.env.NEXT_PUBLIC_BASE_URL, process.env.NEXTAUTH_URL]
    .filter((url): url is string => !!url)
    .map((url) => new URL(url).origin);

// Only our own endpoints get a signature; external webhook receivers don't need one.
const isOwnUrl = (url: string) => ownOrigins().includes(new URL(url).origin);

async function post(url: string, body: string, headers: Record<string, string>, messageId: string) {
  const outgoing = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (!key.toLowerCase().startsWith("upstash-")) outgoing.set(key, value);
  }
  outgoing.set("Upstash-Message-Id", messageId);
  if (isOwnUrl(url)) outgoing.set("Upstash-Signature", signData(body));
  return fetch(url, { method: "POST", headers: outgoing, body });
}

// Same body as a QStash callback (only the fields Papermark reads, plus a few common ones).
async function sendCallback(
  url: string,
  job: HttpJobPayload,
  messageId: string,
  status: number,
  responseBody: string,
) {
  const body = JSON.stringify({
    status,
    url: job.url,
    method: job.method,
    createdAt: job.createdAt,
    sourceMessageId: messageId,
    body: Buffer.from(responseBody).toString("base64"),
    sourceBody: Buffer.from(job.body).toString("base64"),
  });
  const response = await post(url, body, { "Content-Type": "application/json" }, messageId);
  if (!response.ok) logger.warn(`Callback ${url} answered ${response.status}`);
}

export const httpJobTask = task({
  id: HTTP_TASK_ID,
  retry: { maxAttempts: 4, minTimeoutInMs: 2000, maxTimeoutInMs: 60000, factor: 2 },
  run: async (job: HttpJobPayload, { ctx }) => {
    const messageId = ctx.run.id;
    const lastAttempt = ctx.attempt.number >= ctx.attempt.maxAttempts;
    let status = 0;
    let responseBody = "";
    try {
      const outgoing = new Headers(job.headers);
      outgoing.set("Upstash-Retried", String(ctx.attempt.number - 1));
      const headers = Object.fromEntries(outgoing.entries());
      const response =
        job.method === "POST"
          ? await post(job.url, job.body, headers, messageId)
          : await fetch(job.url, { method: job.method, headers });
      status = response.status;
      responseBody = await response.text();
    } catch (error) {
      responseBody = error instanceof Error ? error.message : String(error);
    }

    if (status >= 200 && status < 300) {
      if (job.callback) await sendCallback(job.callback, job, messageId, status, responseBody);
      return { status };
    }
    if (lastAttempt && job.failureCallback) {
      await sendCallback(job.failureCallback, job, messageId, status, responseBody);
    }
    throw new Error(`${job.method} ${job.url} failed: ${status || responseBody}`);
  },
});

export class Client {
  constructor(_config?: { token?: string; baseUrl?: string }) {}

  async publish(request: PublishRequest) {
    if (!request.url) {
      throw new Error("Self-hosted QStash only publishes to a URL (no topics or URL groups).");
    }
    const delayMs =
      typeof request.delay === "number"
        ? request.delay * 1000
        : request.delay
          ? parseDuration(request.delay)
          : 0;
    const runAt = request.notBefore ? request.notBefore * 1000 : Date.now() + delayMs;
    const payload: HttpJobPayload = {
      url: request.url,
      method: request.method ?? "POST",
      headers: Object.fromEntries(new Headers(request.headers).entries()),
      body: request.body ?? "",
      callback: request.callback,
      failureCallback: request.failureCallback,
      createdAt: Date.now(),
    };
    const handle = await tasks.trigger(HTTP_TASK_ID, payload, {
      delay: runAt > Date.now() ? new Date(runAt) : undefined,
      idempotencyKey: request.deduplicationId,
      maxAttempts: request.retries === undefined ? undefined : request.retries + 1,
    });
    return { messageId: handle.id, url: request.url };
  }

  async publishJSON(request: Omit<PublishRequest, "body"> & { body?: unknown }) {
    const headers = new Headers(request.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return this.publish({ ...request, headers, body: JSON.stringify(request.body) });
  }
}

export class Receiver {
  constructor(_config?: { currentSigningKey?: string; nextSigningKey?: string }) {}

  async verify({ signature, body }: { signature: string; body: string; url?: string }) {
    return verifySignedData(signature, body);
  }
}
