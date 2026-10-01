// Self-hosted replacement for "@chronark/zod-bird": same Tinybird client surface, backed by
// tables in the app's Postgres. Ingest endpoints insert into the table named after the
// datasource (selfhost/sql/analytics.sql); pipes run the Postgres port of their SQL
// (selfhost/lib/analytics-pipes.ts). The token and baseUrl are accepted and ignored.
import { z } from "zod";

import { insertEvents, queryAnalytics } from "@/selfhost/lib/analytics-db";
import { PIPES } from "@/selfhost/lib/analytics-pipes";

type Config = { baseUrl?: string; token?: string; noop?: boolean };

type PipeResponse<T> = {
  meta: { name: string; type: string }[];
  rows?: number;
  data: T[];
};

export class Tinybird {
  private readonly noop: boolean;

  constructor(config: Config = {}) {
    this.noop = config.noop === true;
  }

  buildPipe<TParameters extends z.ZodSchema<any>, TData extends z.ZodSchema<any>>(req: {
    pipe: string;
    parameters?: TParameters;
    data: TData;
    opts?: unknown;
  }): (params: z.input<TParameters>) => Promise<PipeResponse<z.output<TData>>> {
    const outputSchema = z.array(req.data);
    return async (params) => {
      let validated: Record<string, unknown> = {};
      if (req.parameters) {
        const v = req.parameters.safeParse(params);
        if (!v.success) throw new Error(v.error.message);
        validated = v.data;
      }
      if (this.noop) return { meta: [], data: [] };

      const build = PIPES[req.pipe];
      if (!build) throw new Error(`Pipe not ported to Postgres: ${req.pipe}`);
      // Stringify like zod-bird's query string (arrays become comma-joined lists).
      const stringParams: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(validated)) {
        if (value !== undefined && value !== null) stringParams[key] = String(value);
      }
      const { sql, values } = build(stringParams);
      const rows = await queryAnalytics(sql, values);

      const data = outputSchema.safeParse(rows);
      if (!data.success) throw new Error(data.error.message);
      return { meta: [], rows: data.data.length, data: data.data };
    };
  }

  buildIngestEndpoint<TSchema extends z.ZodSchema<any>>(req: {
    datasource: string;
    event: TSchema;
    wait?: boolean;
  }): (
    events: z.input<TSchema> | z.input<TSchema>[],
  ) => Promise<{ successful_rows: number; quarantined_rows: number }> {
    return async (events) => {
      const v = Array.isArray(events)
        ? req.event.array().safeParse(events)
        : req.event.safeParse(events);
      if (!v.success) throw new Error(v.error.message);
      const rows = (Array.isArray(v.data) ? v.data : [v.data]) as Record<string, unknown>[];
      if (this.noop) return { successful_rows: rows.length, quarantined_rows: 0 };

      const inserted = await insertEvents(req.datasource, rows).catch((err: Error) => {
        throw new Error(`Unable to ingest to ${req.datasource}: ${err.message}`);
      });
      return { successful_rows: inserted, quarantined_rows: 0 };
    };
  }
}

/** Mock client that does nothing and returns empty data, as in zod-bird. */
export class NoopTinybird extends Tinybird {
  constructor() {
    super({ noop: true });
  }
}
