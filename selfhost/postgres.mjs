// Embedded Postgres for the self-hosted build: real Postgres binaries installed by npm
// (embedded-postgres), data in $PAPERMARK_DATA/postgres, no service to install. Run alone
// (`node selfhost/postgres.mjs`) it is the Mini's shared Postgres: Papermark and Documenso
// each have their own database in it (selfhost/README.md).
import EmbeddedPostgres from "embedded-postgres";
import { loadEnv } from "./env.mjs";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

loadEnv();

export const DATA_DIR = resolve(process.env.PAPERMARK_DATA ?? join(process.cwd(), ".data"));
export const PG_PORT = Number(process.env.PAPERMARK_PG_PORT ?? 54329);
export const DATABASE_URL = `postgresql://papermark:papermark@127.0.0.1:${PG_PORT}/papermark`;

export async function startPostgres() {
  const dir = join(DATA_DIR, "postgres");
  const fresh = !existsSync(join(dir, "PG_VERSION"));
  mkdirSync(DATA_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "papermark",
    password: "papermark",
    port: PG_PORT,
    persistent: true,
    onLog: () => {},
  });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase("papermark");
  return pg;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pg = await startPostgres();
  console.log(`postgres ready: ${DATABASE_URL}`);
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
