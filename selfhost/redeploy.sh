#!/bin/zsh -l
# Redeploy now (forces a rebuild even if origin/main is already deployed), then wait for the app.
cd "$(dirname "$0")/.." && rm -f .deployed-commit && selfhost/deploy.sh || exit 1
for i in {1..30}; do curl -sf -o /dev/null http://127.0.0.1:3000/login && { echo "papermark up"; exit 0; }; sleep 2; done
echo "papermark did not answer on :3000"; exit 1
