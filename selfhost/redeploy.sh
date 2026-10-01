#!/bin/zsh -l
# Redeploy on the Mac Mini: pull main, install, stop the service, migrate + build, start it again.
# The service itself is the launchd agent mini.papermark declared in gabsn/mini (jobs.toml).
set -e
cd "$(dirname "$0")/.."
git fetch -q origin && git reset -q --hard origin/main
npm ci --no-audit --no-fund --loglevel=error > /dev/null
launchctl bootout "gui/$(id -u)/mini.papermark" 2>/dev/null || true
sleep 3
node selfhost/start.mjs --build-only > /tmp/papermark-build.log 2>&1 || { tail -30 /tmp/papermark-build.log; exit 1; }
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/mini.papermark.plist
for i in {1..30}; do curl -sf -o /dev/null http://127.0.0.1:3000/login && { echo "papermark up ($(git log --oneline -1))"; exit 0; }; sleep 2; done
echo "papermark did not answer on :3000"; exit 1
