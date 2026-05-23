#!/bin/bash
set -e
cd "$(dirname "$0")/.."

# ── BattleTech Sig Deploy Script ──
# Pushes main, builds gh-pages, cleans, pushes gh-pages, switches back.
# One command. No forgotten steps.
#
# Usage:
#   ./scripts/deploy.sh          # Deploy to PROD (origin)
#   ./scripts/deploy.sh --test   # Deploy to TEST (test remote)
#
# In DEFEND mode: deploy to test first, verify, then deploy to prod.

TARGET="origin"
LABEL="PROD"
if [ "$1" = "--test" ] || [ "$1" = "test" ]; then
  TARGET="test"
  LABEL="TEST"
fi

echo "=== Deploying to $LABEL ($TARGET) ==="
echo ""

echo "=== Step 1: Push main to origin ==="
git push origin main

echo ""
echo "=== Step 2: Switch to gh-pages ==="
git checkout gh-pages

echo ""
echo "=== Step 3: Pull app files from main ==="
git checkout main -- app/app.js app/app-data.json app/index.html app/style.css

echo ""
echo "=== Step 4: Copy to root and stamp version ==="
cp app/app.js .
cp app/app-data.json .
cp app/index.html .
cp app/style.css .

# Extract APP_VERSION from app.js for cache-busting
APP_VER=$(grep -oP "const APP_VERSION = '\\K[^']+" app.js || echo "0")
echo "  Version: $APP_VER"

# Stamp cache-bust version on asset references in index.html
# Handles both bare filenames (app.js) and previously-stamped ones (app.js?v=1.5.0)
sed -i "s|app\.js\(?v=[^\"']*\)\?|app.js?v=$APP_VER|g" index.html
sed -i "s|style\.css\(?v=[^\"']*\)\?|style.css?v=$APP_VER|g" index.html

# Stamp deploy timestamp into app.js
DEPLOY_TIME=$(TZ=UTC date '+%Y%m%d.%H%M')
sed -i "s|const DEPLOY_TIME = .*|const DEPLOY_TIME = '$DEPLOY_TIME';|" app.js

echo ""
echo "=== Step 5: Clean up ==="
rm -rf app
git rm -rf --cached app/ 2>/dev/null || true

echo ""
echo "=== Step 6: Verify gh-pages contents ==="
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
echo "=== Step 7: Commit and push gh-pages to $LABEL ==="
git add app.js app-data.json index.html style.css
if git diff --cached --quiet; then
  echo "No new changes to commit (gh-pages already up to date locally)."
else
  MAIN_MSG=$(git log main -1 --format="%s")
  git commit -m "Deploy ($LABEL): $MAIN_MSG"
fi

# Always push — local gh-pages may be ahead of the target remote
# (e.g., test deploy updated local gh-pages but origin hasn't been pushed)
git push $TARGET gh-pages

echo ""
echo "=== Step 8: Switch back to main ==="
git checkout -f main

echo ""
echo "=== Step 9: Update VERSION.md ==="
DEPLOY_TS=$(TZ=UTC date '+%Y-%m-%d %H:%M')
LABEL_LC=$(echo "$LABEL" | tr '[:upper:]' '[:lower:]')
MAIN_MSG=$(git log main -1 --format="%s")

# Use a single awk pass to update both tables correctly:
# - In "Current State" section: replace the row matching this environment
# - In "History" section: insert a new row after the separator
awk -v env="$LABEL_LC" -v ver="$APP_VER" -v ts="$DEPLOY_TS" -v msg="$MAIN_MSG" '
  /^## Current State/ { section="current" }
  /^## History/       { section="history" }

  # Current State: replace the row for this environment
  section=="current" && $0 ~ "\\| " env " \\|" {
    print "| " env " | " ver " | " ts " UTC | pending |"
    next
  }

  # History: insert after the separator row (|---|---|...)
  section=="history" && /^\|[-]/ {
    print
    print "| " ver " | " env " | " ts " | pending | " msg " |"
    section="done"
    next
  }

  { print }
' VERSION.md > VERSION.md.tmp && mv VERSION.md.tmp VERSION.md

git add VERSION.md
git commit -m "VERSION.md: auto-stamp $APP_VER $LABEL_LC deploy"
git push origin main

echo ""
if [ "$TARGET" = "test" ]; then
  echo "✅ Deployed to TEST (v$APP_VER). Verify at: https://pakelly.github.io/battletech-sig-test/"
  echo "   Then deploy to prod: ./scripts/deploy.sh"
else
  echo "✅ Deployed to PROD (v$APP_VER). Hard-refresh the site to verify."
fi
