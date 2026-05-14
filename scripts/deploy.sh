#!/bin/bash
set -e
cd "$(dirname "$0")/.."

# ── BattleTech Sig Deploy Script ──
# Pushes main, builds gh-pages, cleans, pushes gh-pages, switches back.
# One command. No forgotten steps.

echo "=== Step 1: Push main to origin ==="
git push origin main

echo ""
echo "=== Step 2: Switch to gh-pages ==="
git checkout gh-pages

echo ""
echo "=== Step 3: Pull app files from main ==="
git checkout main -- app/app.js app/app-data.json

echo ""
echo "=== Step 4: Copy to root and stamp version ==="
cp app/app.js .
cp app/app-data.json .

# Extract APP_VERSION from app.js for cache-busting
APP_VER=$(grep -oP "const APP_VERSION = '\\K[^']+" app.js || echo "0")
echo "  Version: $APP_VER"
sed -i "s/app\.js?v=[^\"']*/app.js?v=$APP_VER/g" index.html
sed -i "s/style\.css?v=[^\"']*/style.css?v=$APP_VER/g" index.html

echo ""
echo "=== Step 5: Clean up ==="
rm -rf app
git rm -rf --cached app/ 2>/dev/null || true

echo ""
echo "=== Step 6: Verify gh-pages contents ==="
# Only these tracked files should exist: app.js, app-data.json, index.html, style.css
# Check git's tracked files only (ignore untracked/temp files like NFS locks)
EXPECTED="app-data.json app.js index.html style.css"
ACTUAL=$(git ls-files --cached | sort | tr '\n' ' ' | sed 's/ $//')
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "⚠️  WARNING: Unexpected files on gh-pages!"
  echo "  Expected: $EXPECTED"
  echo "  Actual:   $ACTUAL"
  echo "  Aborting. Clean up manually, then re-run."
  git checkout main
  exit 1
fi
echo "✓ Clean — only expected files present"

echo ""
echo "=== Step 7: Commit and push gh-pages ==="
git add app.js app-data.json
if git diff --cached --quiet; then
  echo "No changes to deploy."
  git checkout main
  exit 0
fi

# Use the latest main commit message as deploy message
MAIN_MSG=$(git log main -1 --format="%s")
git commit -m "Deploy: $MAIN_MSG"
git push origin gh-pages

echo ""
echo "=== Step 8: Switch back to main ==="
git checkout -f main

echo ""
echo "✅ Deployed. Hard-refresh the site to verify."
