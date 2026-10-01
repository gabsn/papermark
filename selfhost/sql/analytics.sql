-- Self-hosted replacement for Tinybird: one table per datasource of
-- lib/tinybird/datasources/*.datasource, in the "tinybird" schema, named after the
-- datasource with its version suffix (page_views VERSION 3 -> tinybird.page_views__v3).
-- Applied lazily and idempotently by selfhost/lib/analytics-db.ts.
-- ClickHouse String columns default to '' and UInt8 flags to 0, as they do there.

CREATE SCHEMA IF NOT EXISTS tinybird;

CREATE TABLE IF NOT EXISTS tinybird.page_views__v3 (
  "id" text NOT NULL,
  "linkId" text NOT NULL,
  "documentId" text NOT NULL,
  "viewId" text NOT NULL,
  "dataroomId" text,
  "versionNumber" integer NOT NULL DEFAULT 1,
  -- Unix timestamp in milliseconds
  "time" bigint NOT NULL,
  "duration" bigint NOT NULL DEFAULT 0,
  "pageNumber" text NOT NULL,
  "country" text NOT NULL DEFAULT '',
  "city" text NOT NULL DEFAULT '',
  "region" text NOT NULL DEFAULT '',
  "latitude" text NOT NULL DEFAULT '',
  "longitude" text NOT NULL DEFAULT '',
  "ua" text NOT NULL DEFAULT '',
  "browser" text NOT NULL DEFAULT '',
  "browser_version" text NOT NULL DEFAULT '',
  "engine" text NOT NULL DEFAULT '',
  "engine_version" text NOT NULL DEFAULT '',
  "os" text NOT NULL DEFAULT '',
  "os_version" text NOT NULL DEFAULT '',
  "device" text NOT NULL DEFAULT '',
  "device_vendor" text NOT NULL DEFAULT '',
  "device_model" text NOT NULL DEFAULT '',
  "cpu_architecture" text NOT NULL DEFAULT '',
  "bot" boolean NOT NULL DEFAULT false,
  "referer" text NOT NULL DEFAULT '',
  "referer_url" text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS page_views__v3_document_time_idx ON tinybird.page_views__v3 ("documentId", "time");
CREATE INDEX IF NOT EXISTS page_views__v3_view_idx ON tinybird.page_views__v3 ("viewId");
CREATE INDEX IF NOT EXISTS page_views__v3_link_idx ON tinybird.page_views__v3 ("linkId");
CREATE INDEX IF NOT EXISTS page_views__v3_dataroom_time_idx ON tinybird.page_views__v3 ("dataroomId", "time") WHERE "dataroomId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS tinybird.webhook_events__v1 (
  "timestamp" timestamptz(3) NOT NULL DEFAULT now(),
  "event_id" text NOT NULL,
  "webhook_id" text NOT NULL,
  "url" text NOT NULL DEFAULT '',
  "event" text NOT NULL,
  "http_status" integer NOT NULL DEFAULT 0,
  "request_body" text NOT NULL DEFAULT '',
  "response_body" text NOT NULL DEFAULT '',
  "message_id" text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS webhook_events__v1_webhook_time_idx ON tinybird.webhook_events__v1 ("webhook_id", "timestamp" DESC);

CREATE TABLE IF NOT EXISTS tinybird.video_views__v1 (
  "timestamp" timestamptz(3) NOT NULL,
  "id" text NOT NULL,
  "link_id" text NOT NULL,
  "document_id" text NOT NULL,
  "view_id" text NOT NULL,
  "dataroom_id" text,
  "version_number" integer NOT NULL DEFAULT 1,
  "event_type" text NOT NULL,
  "start_time" bigint NOT NULL DEFAULT 0,
  "end_time" bigint NOT NULL DEFAULT 0,
  -- Stored as 100, 150, 200 instead of 1.0, 1.5, 2.0
  "playback_rate" integer NOT NULL DEFAULT 100,
  -- Stored as 0-100 instead of 0.0-1.0
  "volume" integer NOT NULL DEFAULT 0,
  "is_muted" smallint NOT NULL DEFAULT 0,
  "is_focused" smallint NOT NULL DEFAULT 0,
  "is_fullscreen" smallint NOT NULL DEFAULT 0,
  "country" text NOT NULL DEFAULT '',
  "city" text NOT NULL DEFAULT '',
  "region" text NOT NULL DEFAULT '',
  "latitude" text NOT NULL DEFAULT '',
  "longitude" text NOT NULL DEFAULT '',
  "ua" text NOT NULL DEFAULT '',
  "browser" text NOT NULL DEFAULT '',
  "browser_version" text NOT NULL DEFAULT '',
  "engine" text NOT NULL DEFAULT '',
  "engine_version" text NOT NULL DEFAULT '',
  "os" text NOT NULL DEFAULT '',
  "os_version" text NOT NULL DEFAULT '',
  "device" text NOT NULL DEFAULT '',
  "device_vendor" text NOT NULL DEFAULT '',
  "device_model" text NOT NULL DEFAULT '',
  "cpu_architecture" text NOT NULL DEFAULT '',
  "bot" boolean NOT NULL DEFAULT false,
  "referer" text NOT NULL DEFAULT '',
  "referer_url" text NOT NULL DEFAULT '',
  "ip_address" text
);
CREATE INDEX IF NOT EXISTS video_views__v1_document_view_time_idx ON tinybird.video_views__v1 ("document_id", "view_id", "timestamp");
CREATE INDEX IF NOT EXISTS video_views__v1_link_idx ON tinybird.video_views__v1 ("link_id");

CREATE TABLE IF NOT EXISTS tinybird.click_events__v1 (
  "timestamp" timestamptz(3) NOT NULL,
  "event_id" text NOT NULL,
  "session_id" text NOT NULL DEFAULT '',
  "link_id" text NOT NULL,
  "document_id" text NOT NULL,
  "dataroom_id" text,
  "view_id" text NOT NULL,
  "page_number" text NOT NULL,
  "version_number" integer NOT NULL DEFAULT 1,
  "href" text NOT NULL
);
CREATE INDEX IF NOT EXISTS click_events__v1_document_view_time_idx ON tinybird.click_events__v1 ("document_id", "view_id", "timestamp");
CREATE INDEX IF NOT EXISTS click_events__v1_link_idx ON tinybird.click_events__v1 ("link_id");

CREATE TABLE IF NOT EXISTS tinybird.pm_click_events__v1 (
  "timestamp" timestamptz(3) NOT NULL,
  "click_id" text NOT NULL,
  "view_id" text NOT NULL,
  "link_id" text NOT NULL,
  "document_id" text,
  "dataroom_id" text,
  "continent" text NOT NULL DEFAULT '',
  "country" text NOT NULL DEFAULT '',
  "city" text NOT NULL DEFAULT '',
  "region" text NOT NULL DEFAULT '',
  "latitude" text NOT NULL DEFAULT '',
  "longitude" text NOT NULL DEFAULT '',
  "device" text NOT NULL DEFAULT '',
  "device_model" text NOT NULL DEFAULT '',
  "device_vendor" text NOT NULL DEFAULT '',
  "browser" text NOT NULL DEFAULT '',
  "browser_version" text NOT NULL DEFAULT '',
  "os" text NOT NULL DEFAULT '',
  "os_version" text NOT NULL DEFAULT '',
  "engine" text NOT NULL DEFAULT '',
  "engine_version" text NOT NULL DEFAULT '',
  "cpu_architecture" text NOT NULL DEFAULT '',
  "ua" text NOT NULL DEFAULT '',
  "bot" boolean NOT NULL DEFAULT false,
  "referer" text NOT NULL DEFAULT '',
  "referer_url" text NOT NULL DEFAULT '',
  "ip_address" text
);
CREATE INDEX IF NOT EXISTS pm_click_events__v1_view_idx ON tinybird.pm_click_events__v1 ("view_id");
CREATE INDEX IF NOT EXISTS pm_click_events__v1_link_idx ON tinybird.pm_click_events__v1 ("link_id");
CREATE INDEX IF NOT EXISTS pm_click_events__v1_document_time_idx ON tinybird.pm_click_events__v1 ("document_id", "timestamp");
CREATE INDEX IF NOT EXISTS pm_click_events__v1_dataroom_time_idx ON tinybird.pm_click_events__v1 ("dataroom_id", "timestamp") WHERE "dataroom_id" IS NOT NULL;
