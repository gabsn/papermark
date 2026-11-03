#!/bin/sh
# Entrypoint of selfhost/Dockerfile. The orchestrator passes the whole runtime .env as one
# base64 variable, PAPERMARK_ENV_B64: it is written to the repo's .env (read by selfhost/env.mjs),
# then the command runs (the app by default, or `node selfhost/qa/deck-e2e.mjs`).
set -e
if [ -n "$PAPERMARK_ENV_B64" ]; then
  # Readable by its owner only; the subshell keeps the app's own umask.
  (umask 077 && printf '%s' "$PAPERMARK_ENV_B64" | base64 -d > "$(dirname "$0")/../.env")
fi
exec "$@"
