// One command to run the self-hosted Papermark: starts the embedded Postgres, applies the
// Prisma migrations, then runs Next.js (`next start` after `npm run selfhost:build`, or
// `next dev` with --dev; --build-only prepares a deploy and exits). Stops Postgres when Next exits;
// --external-postgres uses the shared Postgres service instead. See selfhost/README.md.
import { spawn } from "node:child_process";
import { createConnection } from "node:net";

import { loadEnv } from "./env.mjs";

const root = new URL("..", import.meta.url).pathname;
const dev = process.argv.includes("--dev");
// The shared Postgres runs as its own service (selfhost/postgres.mjs, job `postgres` on the Mini):
// wait for it instead of starting one.
const externalPostgres = process.argv.includes("--external-postgres");
const buildOnly = process.argv.includes("--build-only");
const build = buildOnly || process.argv.includes("--build");

loadEnv(root);
process.env.PAPERMARK_SELFHOST = "1";
// Imported after .env is read: postgres.mjs takes PAPERMARK_DATA and the port from the environment.
const { DATABASE_URL, DATA_DIR, startPostgres } = await import("./postgres.mjs");
process.env.PAPERMARK_DATA = DATA_DIR;
process.env.POSTGRES_PRISMA_URL ??= DATABASE_URL;
process.env.POSTGRES_PRISMA_URL_NON_POOLING ??= DATABASE_URL;

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, stdio: "inherit", env: process.env });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });

const waitForPort = async (port) => {
  for (let i = 0; i < 120; i++) {
    const ok = await new Promise((resolve) => {
      const c = createConnection({ host: "127.0.0.1", port }, () => (c.end(), resolve(true)));
      c.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`postgres did not answer on ${port}`);
};
const pg = externalPostgres ? { stop: async () => {} } : await startPostgres();
if (externalPostgres) await waitForPort(Number(process.env.PAPERMARK_PG_PORT ?? 54329));
console.log(`postgres: ${DATABASE_URL} (data in ${DATA_DIR})`);
let next;
const stop = async (code = 0) => {
  next?.kill("SIGTERM");
  await pg.stop().catch(() => {});
  process.exit(code);
};
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

try {
  await run("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema"]);
  await run("npx", ["prisma", "generate", "--schema", "prisma/schema"]);
  if (build) await run("npx", ["next", "build"]);
  if (buildOnly) await stop(0);
  const port = process.env.PORT ?? "3000";
  next = spawn("npx", ["next", dev ? "dev" : "start", "-p", port, "-H", process.env.HOST ?? "127.0.0.1"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  next.on("exit", (code) => stop(code ?? 0));
} catch (err) {
  console.error(err);
  await stop(1);
}
