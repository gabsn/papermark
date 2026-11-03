# syntax=docker/dockerfile:1
# Self-hosted Papermark as one container (selfhost/README.md), for a Linux VM (linux/arm64).
# Built and pushed by .github/workflows/deck-vm-image.yml to ghcr.io/gabsn/papermark.
#   docker build -f selfhost/Dockerfile -t papermark .
# No secret and no runtime setting is in the image: the orchestrator passes the whole .env
# (selfhost/env.example, with HOST=0.0.0.0, PORT, PAPERMARK_DATA and the external Postgres URLs)
# base64-encoded in PAPERMARK_ENV_B64, which selfhost/docker-entrypoint.sh writes to /app/.env.

FROM node:24-bookworm-slim AS base
# Prisma's engines need OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
# npm's postinstall runs `prisma generate`, which reads the schema.
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund --loglevel=error
COPY . .
# NEXT_PUBLIC_* are baked into the build: public URLs, not secrets.
ARG NEXT_PUBLIC_BASE_URL=https://deck.focustree.app
ARG NEXT_PUBLIC_MARKETING_URL=https://deck.focustree.app
ARG NEXT_PUBLIC_APP_BASE_HOST=deck.focustree.app
ARG NEXT_PUBLIC_UPLOAD_TRANSPORT=s3
ARG NEXT_PUBLIC_WEBHOOK_BASE_HOST=webhooks.invalid
ARG NEXT_PUBLIC_WEBHOOK_BASE_URL=https://webhooks.invalid
ARG NEXT_PUBLIC_SIGNING_HOST=https://sign.focustree.app
ARG NEXT_PUBLIC_SIGNING_TEAM_URL=personal_koyhffdfsztdzorx
# Build stage only: the runtime stage gets none of these (its settings come from the .env).
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_MARKETING_URL=$NEXT_PUBLIC_MARKETING_URL \
    NEXT_PUBLIC_APP_BASE_HOST=$NEXT_PUBLIC_APP_BASE_HOST \
    NEXT_PUBLIC_UPLOAD_TRANSPORT=$NEXT_PUBLIC_UPLOAD_TRANSPORT \
    NEXT_PUBLIC_WEBHOOK_BASE_HOST=$NEXT_PUBLIC_WEBHOOK_BASE_HOST \
    NEXT_PUBLIC_WEBHOOK_BASE_URL=$NEXT_PUBLIC_WEBHOOK_BASE_URL \
    NEXT_PUBLIC_SIGNING_HOST=$NEXT_PUBLIC_SIGNING_HOST \
    NEXT_PUBLIC_SIGNING_TEAM_URL=$NEXT_PUBLIC_SIGNING_TEAM_URL \
    PAPERMARK_SELFHOST=1 \
    NEXT_TELEMETRY_DISABLED=1
# The build steps of `node selfhost/start.mjs --build-only` (selfhost/deploy.sh), without its
# `prisma migrate deploy`: there is no database here; start.mjs migrates when the container starts.
RUN npx prisma generate --schema prisma/schema && npx next build && rm -rf .next/cache
# Production dependencies only. npm keeps the prisma CLI (a devDependency, but the peer of
# @prisma/client), which start.mjs runs at start for the migrations.
RUN npm prune --omit=dev --no-audit --no-fund --loglevel=error

FROM base AS runtime
# Chromium for the deck QA (node selfhost/qa/deck-e2e.mjs, through selfhost/qa/cdp.mjs). In a
# container it runs as root under Docker's seccomp profile, so it needs --no-sandbox; Debian's
# /usr/bin/chromium adds the flags of /etc/chromium.d/* to every launch.
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && echo 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox --disable-dev-shm-usage"' > /etc/chromium.d/container
# This image's Chromium, not a setting of the app: it wins over a CHROME_PATH in the .env.
ENV CHROME_PATH=/usr/bin/chromium
COPY --from=build /app /app
EXPOSE 3000
ENTRYPOINT ["/app/selfhost/docker-entrypoint.sh"]
CMD ["node", "selfhost/start.mjs", "--external-postgres"]
