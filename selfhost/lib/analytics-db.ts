// Self-hosted analytics store: the Tinybird datasources live as tables in the app's own
// Postgres (schema "tinybird", see selfhost/sql/analytics.sql). The schema is applied once
// per process, lazily, before the first insert or query.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import prisma from "@/lib/prisma";

const SCHEMA = "tinybird";
// Arbitrary constant: serialises concurrent schema setup across processes.
const ADVISORY_LOCK_KEY = 7_340_211;

let ready: Promise<void> | undefined;

function readStatements(): string[] {
  const sql = readFileSync(join(process.cwd(), "selfhost/sql/analytics.sql"), "utf8");
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/** Creates the analytics tables and indexes if missing. Idempotent and memoised. */
export function ensureAnalyticsSchema(): Promise<void> {
  ready ??= (async () => {
    const statements = readStatements();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`);
      // Prisma prepares each call, so statements must be sent one at a time.
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    });
  })().catch((error) => {
    ready = undefined; // retry on the next call
    throw error;
  });
  return ready;
}

const columnCache = new Map<string, Set<string>>();

async function tableColumns(table: string): Promise<Set<string>> {
  let columns = columnCache.get(table);
  if (!columns) {
    const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      SCHEMA,
      table,
    );
    if (rows.length === 0) throw new Error(`Unknown analytics datasource: ${table}`);
    columns = new Set(rows.map((row) => row.column_name));
    columnCache.set(table, columns);
  }
  return columns;
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Inserts events into the table named after the datasource. Only keys that are columns
 * of the table are written; columns no event sets keep their default (e.g. timestamp).
 */
export async function insertEvents(
  datasource: string,
  events: Record<string, unknown>[],
): Promise<number> {
  if (events.length === 0) return 0;
  await ensureAnalyticsSchema();
  const columns = await tableColumns(datasource);
  const present = new Set(events.flatMap((event) => Object.keys(event)));
  const names = Array.from(present).filter((name) => columns.has(name)).map(quoteIdent);
  if (names.length === 0) return 0;
  const table = `${SCHEMA}.${quoteIdent(datasource)}`;
  const list = names.join(", ");
  return prisma.$executeRawUnsafe(
    `INSERT INTO ${table} (${list}) SELECT ${list} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`,
    JSON.stringify(events),
  );
}

/** Runs a read query and turns bigint / numeric values into plain numbers. */
export async function queryAnalytics(
  sql: string,
  values: unknown[],
): Promise<Record<string, unknown>[]> {
  await ensureAnalyticsSchema();
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...values);
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toPlain(value)])),
  );
}

function toPlain(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(toPlain);
  // Prisma.Decimal
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return value;
}
