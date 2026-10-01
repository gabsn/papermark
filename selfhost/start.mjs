// One command to run the self-hosted Papermark: starts the embedded Postgres, applies the
// Prisma migrations, then runs Next.js (`next start` after `npm run selfhost:build`, or
// `next dev` with --dev). Stops Postgres when Next exits. See selfhost/README.md.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";


const root = new URL("..", import.meta.url).pathname;
const dev = process.argv.includes("--dev");
const build = process.argv.includes("--build");

// .env at the repo root, without overriding variables already set by the caller.
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
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

const pg = await startPostgres();
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
