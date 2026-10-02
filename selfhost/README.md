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
- NDA: two kinds. "Legacy text content": the viewer ticks the text (name, email, time recorded in
  `AgreementResponse`). "Embedded signature flow": the viewer signs a PDF in Documenso
  (sign.focustree.app, self-hosted, see below) inside the link, then gets the signed PDF; the
  webhook marks the response COMPLETED. Signature fields are placed in Documenso itself
  ("Open in Documenso" at the field step, or text placeholders such as `{{signature}}` in the
  PDF through its API): Documenso's embedded editor is an Enterprise feature, so we don't use it.
- Not available: ZIP downloads and data room archives (they used AWS Lambda), office/CAD/video
  conversions (upload PDFs).

## Documenso (e-signature)

Upstream Documenso (no fork, no Docker) runs next to Papermark: clone `~/src/documenso` at a
release tag, `.env` there (1Password "Documenso self-hosted .env (Mac Mini)"), Node 24 (its Prisma
generators break on Node 25), database `documenso` in the shared Postgres
(`node selfhost/create-database.mjs documenso <password>`), storage in the database, SES SMTP from
sign@focustree.app, a self-signed signing certificate (`~/.local/share/documenso/signing.p12`,
1Password). Papermark env: `NEXT_PUBLIC_SIGNING_HOST`, `SIGNING_API_URL` (local),
`SIGNING_API_KEY`, `SIGNING_WEBHOOK_SECRET` (webhook `document.signed` and `document.completed`
to `/api/webhooks/signing`), `NEXT_PUBLIC_SIGNING_TEAM_URL`. Owner account gabin@focustree.app
(1Password "Documenso (sign.focustree.app)"); sign-ups are closed.

## Operations on the Mac Mini

- Services (gabsn/mini `jobs.toml`): `postgres` (`node selfhost/postgres.mjs`, the shared
  Postgres), `papermark` (`node selfhost/start.mjs --external-postgres`), `documenso`. Logs
  `~/Library/Logs/mini/<job>.log`, data `~/.local/share/papermark`.
- Public URLs: https://deck.focustree.app and https://sign.focustree.app (CloudFront, Focus Tree
  CDK stack `Deck`) → Tailscale Funnel 443 → `127.0.0.1:3000` and 8443 → `127.0.0.1:3100`.
- Redeploy Papermark: `selfhost/redeploy.sh`.
