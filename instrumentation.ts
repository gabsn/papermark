// Next.js instrumentation hook: runs once when a server process starts.
// Self-hosted build only: start the background job worker (selfhost/worker.ts).
export async function register() {
  if (process.env.PAPERMARK_SELFHOST === "1" && process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorker } = await import("./selfhost/worker");
    await startWorker();
  }
}
