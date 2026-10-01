// Postgres ports of the Tinybird pipes in lib/tinybird/endpoints/*.pipe, keyed by the pipe
// name lib/tinybird/pipes.ts calls (with its version suffix). Each entry turns the
// validated parameters into parameterised SQL over the tables of selfhost/sql/analytics.sql.
//
// Conventions kept from the ClickHouse originals:
// - comma-separated id lists are split with string_to_array (an empty string gives [''],
//   which excludes nothing, like splitByChar);
// - aggregates without GROUP BY always return one row, and SUM over no rows is 0;
// - `until` defaults to 9999999999999 and is inclusive except in get_total_team_duration;
// - timestamps come back as ISO 8601 UTC strings.

type Params = Record<string, string | undefined>;
export type PipeQuery = { sql: string; values: unknown[] };

const T = "tinybird";
const NO_UNTIL = "9999999999999";

// Pipe parameters reach us as strings, as they would in Tinybird's query string.
const int = (value: string | undefined, fallback: string) => BigInt(value ?? fallback);
const req = (params: Params, name: string): string => {
  const value = params[name];
  if (value === undefined) throw new Error(`Missing required pipe parameter: ${name}`);
  return value;
};

const iso = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const userAgentByView = (p: Params): PipeQuery => ({
  sql: `SELECT country, city, browser, os, device
        FROM ${T}.pm_click_events__v1
        WHERE view_id = $1
        LIMIT 1`,
  values: [req(p, "viewId")],
});

export const PIPES: Record<string, (params: Params) => PipeQuery> = {
  get_total_average_page_duration__v5: (p) => ({
    sql: `WITH distinct_durations AS (
            SELECT "versionNumber", "pageNumber", "viewId", SUM(duration) AS distinct_duration
            FROM ${T}.page_views__v3
            WHERE "documentId" = $1
              AND time >= $2 AND time <= $3
              AND NOT ("linkId" = ANY (string_to_array($4, ',')))
              AND NOT ("viewId" = ANY (string_to_array($5, ',')))
            GROUP BY "versionNumber", "pageNumber", "viewId"
          )
          SELECT "versionNumber", "pageNumber", AVG(distinct_duration)::float8 AS avg_duration
          FROM distinct_durations
          GROUP BY "versionNumber", "pageNumber"
          ORDER BY "versionNumber" ASC, "pageNumber" ASC`,
    values: [
      req(p, "documentId"),
      int(req(p, "since"), "0"),
      int(p.until, NO_UNTIL),
      req(p, "excludedLinkIds"),
      req(p, "excludedViewIds"),
    ],
  }),

  // The checked-in .pipe (VERSION 4) has no `until`; pipes.ts declares it for __v5, so it
  // is honoured here.
  get_page_duration_per_view__v5: (p) => ({
    sql: `SELECT "pageNumber", SUM(duration)::float8 AS sum_duration
          FROM ${T}.page_views__v3
          WHERE "documentId" = $1 AND "viewId" = $2 AND time >= $3 AND time <= $4
          GROUP BY "pageNumber"
          ORDER BY "pageNumber" ASC`,
    values: [req(p, "documentId"), req(p, "viewId"), int(req(p, "since"), "0"), int(p.until, NO_UNTIL)],
  }),

  get_view_completion_stats__v1: (p) => ({
    sql: `SELECT "viewId", "versionNumber", COUNT(DISTINCT "pageNumber")::int AS pages_viewed
          FROM ${T}.page_views__v3
          WHERE "documentId" = $1
            AND NOT ("viewId" = ANY (string_to_array($2, ',')))
            AND time >= $3
          GROUP BY "viewId", "versionNumber"`,
    values: [req(p, "documentId"), req(p, "excludedViewIds"), int(req(p, "since"), "0")],
  }),

  get_total_document_duration__v1: (p) => ({
    sql: `SELECT COALESCE(SUM(duration), 0)::float8 AS sum_duration
          FROM ${T}.page_views__v3
          WHERE "documentId" = $1
            AND time >= $2 AND time <= $3
            AND NOT ("linkId" = ANY (string_to_array($4, ',')))
            AND NOT ("viewId" = ANY (string_to_array($5, ',')))`,
    values: [
      req(p, "documentId"),
      int(req(p, "since"), "0"),
      int(p.until, NO_UNTIL),
      req(p, "excludedLinkIds"),
      req(p, "excludedViewIds"),
    ],
  }),

  get_total_link_duration__v1: (p) => ({
    sql: `SELECT COALESCE(SUM(duration), 0)::float8 AS sum_duration,
                 COUNT(DISTINCT "viewId")::int AS view_count
          FROM ${T}.page_views__v3
          WHERE "linkId" = $1
            AND time >= $2 AND time <= $3
            AND "documentId" = $4
            AND NOT ("viewId" = ANY (string_to_array($5, ',')))`,
    values: [
      req(p, "linkId"),
      int(req(p, "since"), "0"),
      int(p.until, NO_UNTIL),
      req(p, "documentId"),
      req(p, "excludedViewIds"),
    ],
  }),

  get_total_viewer_duration__v1: (p) => ({
    sql: `SELECT COALESCE(SUM(duration), 0)::float8 AS sum_duration
          FROM ${T}.page_views__v3
          WHERE "viewId" = ANY (string_to_array($1, ','))
            AND time >= $2 AND time <= $3`,
    values: [req(p, "viewIds"), int(req(p, "since"), "0"), int(p.until, NO_UNTIL)],
  }),

  // No .pipe file is checked in for v2; same columns, read from the page views of the view.
  get_useragent_per_view__v2: (p) => ({
    sql: `SELECT country, city, browser, os, device
          FROM ${T}.page_views__v3
          WHERE "documentId" = $1 AND "viewId" = $2 AND time >= $3
          LIMIT 1`,
    values: [req(p, "documentId"), req(p, "viewId"), int(req(p, "since"), "0")],
  }),

  get_useragent_per_view__v3: userAgentByView,

  // excludedLinkIds / excludedViewIds are arrays in pipes.ts; the shim sends them
  // comma-joined, as zod-bird does in the query string.
  get_total_dataroom_duration__v1: (p) => ({
    sql: `SELECT "viewId", SUM(duration)::float8 AS sum_duration
          FROM ${T}.page_views__v3
          WHERE "dataroomId" = $1
            AND time >= $2 AND time <= $3
            AND NOT ("linkId" = ANY (string_to_array($4, ',')))
            AND NOT ("viewId" = ANY (string_to_array($5, ',')))
          GROUP BY "viewId"`,
    values: [
      req(p, "dataroomId"),
      int(req(p, "since"), "0"),
      int(p.until, NO_UNTIL),
      p.excludedLinkIds ?? "",
      p.excludedViewIds ?? "",
    ],
  }),

  get_document_duration_per_viewer__v1: (p) => ({
    sql: `SELECT COALESCE(SUM(duration), 0)::float8 AS sum_duration
          FROM ${T}.page_views__v3
          WHERE "documentId" = $1 AND "viewId" = ANY (string_to_array($2, ','))`,
    values: [req(p, "documentId"), req(p, "viewIds")],
  }),

  get_webhook_events__v1: (p) => ({
    sql: `SELECT ${iso("timestamp")} AS timestamp, event_id, webhook_id, url, event,
                 http_status, request_body, response_body, message_id
          FROM ${T}.webhook_events__v1
          WHERE webhook_id = $1
          ORDER BY "timestamp" DESC
          LIMIT 100`,
    values: [req(p, "webhookId")],
  }),

  get_video_events_by_document__v1: (p) => ({
    sql: `SELECT ${iso("timestamp")} AS timestamp, view_id, event_type,
                 start_time::float8 AS start_time, end_time::float8 AS end_time,
                 playback_rate, volume, is_muted::int AS is_muted,
                 is_focused::int AS is_focused, is_fullscreen::int AS is_fullscreen
          FROM ${T}.video_views__v1
          WHERE document_id = $1
          ORDER BY "timestamp" ASC`,
    values: [req(p, "document_id")],
  }),

  get_video_events_by_view__v1: (p) => ({
    sql: `SELECT ${iso("timestamp")} AS timestamp, event_type,
                 start_time::float8 AS start_time, end_time::float8 AS end_time,
                 playback_rate, volume, is_muted::int AS is_muted,
                 is_focused::int AS is_focused, is_fullscreen::int AS is_fullscreen
          FROM ${T}.video_views__v1
          WHERE document_id = $1 AND view_id = $2
          ORDER BY "timestamp" ASC`,
    values: [req(p, "document_id"), req(p, "view_id")],
  }),

  get_click_events_by_view__v1: (p) => ({
    sql: `SELECT ${iso("timestamp")} AS timestamp, document_id, dataroom_id, view_id,
                 page_number, version_number, href
          FROM ${T}.click_events__v1
          WHERE document_id = $1 AND view_id = $2
          ORDER BY "timestamp" ASC`,
    values: [req(p, "document_id"), req(p, "view_id")],
  }),

  get_dataroom_view_document_stats__v1: (p) => ({
    sql: `SELECT "viewId", "documentId", SUM(duration)::float8 AS sum_duration,
                 COUNT(DISTINCT "pageNumber")::int AS pages_viewed
          FROM ${T}.page_views__v3
          WHERE "viewId" = ANY (string_to_array($1, ','))
          GROUP BY "viewId", "documentId"`,
    values: [req(p, "viewIds")],
  }),

  // Tinybird's pm_click_events timestamp is compared in epoch milliseconds.
  get_total_team_duration__v1: (p) => ({
    sql: `SELECT
            (SELECT COALESCE(SUM(duration), 0)::float8
               FROM ${T}.page_views__v3
              WHERE "documentId" = ANY (string_to_array($1, ','))
                AND time >= $2 AND time < $3) AS total_duration,
            (SELECT COALESCE(array_agg(DISTINCT country), '{}')
               FROM ${T}.pm_click_events__v1
              WHERE document_id = ANY (string_to_array($1, ','))
                AND "timestamp" >= to_timestamp($2 / 1000.0)
                AND "timestamp" < to_timestamp($3 / 1000.0)
                AND country <> 'Unknown' AND country <> '') AS unique_countries`,
    values: [p.documentIds ?? "", int(p.since, "0"), int(p.until, NO_UNTIL)],
  }),
};
