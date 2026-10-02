// Creates a role and a database of the same name in the shared Postgres (idempotent), for
// another app on the Mini (e.g. Documenso): `node selfhost/create-database.mjs documenso <password>`.
import pg from "pg";

import { loadEnv } from "./env.mjs";

loadEnv();
const [name, password] = process.argv.slice(2);
if (!/^[a-z_][a-z0-9_]*$/.test(name ?? "") || !password) {
  console.error("usage: node selfhost/create-database.mjs <name> <password>");
  process.exit(2);
}
const port = Number(process.env.PAPERMARK_PG_PORT ?? 54329);
const admin = new pg.Client({ host: "127.0.0.1", port, user: "papermark", password: "papermark", database: "postgres" });
await admin.connect();
const quoted = `'${password.replaceAll("'", "''")}'`;
const role = await admin.query("select 1 from pg_roles where rolname = $1", [name]);
await admin.query(role.rowCount ? `alter role ${name} with login password ${quoted}` : `create role ${name} with login password ${quoted}`);
const db = await admin.query("select 1 from pg_database where datname = $1", [name]);
if (!db.rowCount) await admin.query(`create database ${name} owner ${name}`);
await admin.end();
console.log(`database ${name} ready on 127.0.0.1:${port}`);
