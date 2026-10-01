# Self-hosted Papermark

This fork runs Papermark on one machine (Gabin's Mac Mini) with no hosted service: one
`node` process, an embedded Postgres, files on disk. Everything lives in one data folder.

```bash
cp selfhost/env.example .env       # fill the secrets, the public URL, SELFHOST_ALLOWED_EMAILS
npm ci
node selfhost/start.mjs --build    # Postgres + migrations + next build + next start on :3000
node selfhost/start.mjs --dev      # same with next dev
selfhost/redeploy.sh               # on the Mini: pull, build, restart the launchd service
```

`NEXT_PUBLIC_*` values are baked into the build: set the public URL in `.env` before building.

## How it works

`PAPERMARK_SELFHOST=1` (set by `start.mjs`) makes `next.config.mjs` alias each hosted service to
a local module with the same API, in `selfhost/shims/`, and bundle those packages so the alias
also applies on the server:

| Upstream | Self-hosted |
| --- | --- |
| Postgres (Vercel) | real Postgres binaries from npm (`embedded-postgres`), `selfhost/postgres.mjs` |
| S3, CloudFront, Vercel Blob, tus S3 store | files under `<data>/files`, served by `pages/api/selfhost/files` and `.../public` with signed URLs |
| Trigger.dev, QStash, `waitUntil` | disk queue under `<data>/queue`, worker started by `instrumentation.ts` (`selfhost/worker.ts`) |
| Tinybird | schema `tinybird` in the same Postgres (`selfhost/sql/analytics.sql`, `selfhost/lib/analytics-pipes.ts`) |
| Upstash Redis and Ratelimit | in process, persisted to `<data>/kv.json` |
| Resend | Amazon SES v2 when `SES_*` is set, otherwise `<data>/outbox` (and stdout) |
| Edge Config, PostHog, Hanko, Google/LinkedIn sign-in, Vercel domains, Slack, Stripe | defaults or off when their keys are absent |

Data folder (`PAPERMARK_DATA`): `postgres/`, `files/`, `queue/`, `kv.json`, `outbox/`. Back up the
whole folder with the service stopped (or `pg_dump` + `files/`).

## Licence: `ee/` is not used

Everything under `ee/` is under the Papermark Commercial License (production use needs a
subscription), and part of what the core imports from `ee/` is not published. The self-hosted
build resolves `@/ee/*` to our own modules in `selfhost/ee/` (written from the core's call
sites, AGPL like the rest), `tsconfig.selfhost.json` type-checks against them, and `app/(ee)` is
removed. Kept: plans unlimited, branding, confidential view, data room invitations. Off: AI,
conversations, workflows, templates, request lists, data room freeze, redaction, billing, SSO.
`selfhost/ee-manifest.txt` lists the modules and symbols the core imports.

The AGPL applies to this fork: the source is public at github.com/gabsn/papermark.

## Access

- Dashboard sign-in is limited to `SELFHOST_ALLOWED_EMAILS` (emails or `@domain`); others get no
  code. People opening a shared link never sign in.
- NDA: use the "text" agreement (the viewer accepts the text; name, email and time are recorded
  in `AgreementResponse`). The "embedded signature" flow needs Documenso and is not set up.
- Not available: ZIP downloads and data room archives (they used AWS Lambda), office/CAD/video
  conversions (upload PDFs).

## Operations on the Mac Mini

- Service: launchd agent `mini.papermark`, declared in gabsn/mini `jobs.toml` (job `papermark`),
  log `~/Library/Logs/mini/papermark.log`, data `~/.local/share/papermark`, `.env` in
  `~/src/papermark/.env`.
- Public URL: Tailscale Funnel, `https://hermes-mac-mini.tail162ab5.ts.net` → `127.0.0.1:3000`.
