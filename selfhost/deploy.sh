#!/bin/zsh -l
# Deploy on the Mac Mini, idempotent: the `papermark` job's setup in gabsn/mini runs it on every
# `bin/mini install`. When origin/main is already deployed it does nothing; otherwise it
# stops the service, installs, migrates and builds, then starts the service again.
# Public access: deck.focustree.app (CloudFront) -> Cloudflare Tunnel of gabsn/mini job origin-tunnel
# (deck-origin.arkadia.so) -> 127.0.0.1:3000. Tailscale Funnel is no longer used (2026-10-08).
set -e
cd "$(dirname "$0")/.."
LABEL="gui/$(id -u)/mini.papermark"
PLIST=~/Library/LaunchAgents/mini.papermark.plist
git fetch -q origin
TARGET=$(git rev-parse origin/main)
if [[ -f .deployed-commit && "$(cat .deployed-commit)" == "$TARGET" && -f .next/BUILD_ID ]]; then
  echo "papermark: $TARGET already deployed"
else
  launchctl bootout "$LABEL" 2>/dev/null && was_loaded=1 || was_loaded=0
  sleep 2
  git reset -q --hard "$TARGET"
  npm ci --no-audit --no-fund --loglevel=error > /dev/null
  node selfhost/start.mjs --external-postgres --build-only > /tmp/papermark-build.log 2>&1 || { tail -30 /tmp/papermark-build.log; exit 1; }
  echo "$TARGET" > .deployed-commit
  [[ -f "$PLIST" ]] && launchctl bootstrap "gui/$(id -u)" "$PLIST" || true
  echo "papermark: deployed $(git log --oneline -1)"
fi
