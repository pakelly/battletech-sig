#!/bin/bash
# update-mm-data.sh — Pull latest MegaMek data and rebuild app-data.json
# Idempotent: safe to run repeatedly. Does NOT commit or deploy.
set -e
cd "$(dirname "$0")/.."

REPO_URL="https://github.com/MegaMek/mm-data.git"
SPARSE_PATHS="data/forcegenerator data/mekfiles/meks data/universe/factions"
APP_DATA="app/app-data.json"

# ── Step 1: Ensure mm-data exists ──────────────────────────────────────
if [ ! -d "mm-data/.git" ]; then
  echo "=== mm-data not found — performing initial sparse checkout ==="
  git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" mm-data
  cd mm-data
  git sparse-checkout set $SPARSE_PATHS
  cd ..
  echo ""
else
  echo "=== Pulling latest mm-data ==="
  git -C mm-data pull --ff-only
  echo ""
fi

# ── Step 2: Snapshot current app-data.json (if it exists) ─────────────
BEFORE=""
if [ -f "$APP_DATA" ]; then
  BEFORE=$(md5sum "$APP_DATA" | cut -d' ' -f1)
fi

# ── Step 3: Run full build pipeline ───────────────────────────────────
echo "=== Building app-data.json ==="
bash scripts/build.sh
echo ""

# ── Step 4: Check for changes ─────────────────────────────────────────
AFTER=$(md5sum "$APP_DATA" | cut -d' ' -f1)

if [ "$BEFORE" = "$AFTER" ] && [ -n "$BEFORE" ]; then
  echo "✅ Already up to date — app-data.json unchanged."
  exit 0
fi

# Something changed (or first build) — summarize
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Data updated — summary:"

# Count chassis and factions from the JSON
if command -v node &>/dev/null; then
  node -e "
    const d = require('./$APP_DATA');
    const factions = Object.keys(d.factions || {});
    const chassis = Object.keys(d.chassis || {});
    const eras = Object.keys(d.eras || {});
    console.log('   Factions: ' + factions.length);
    console.log('   Chassis:  ' + chassis.length);
    console.log('   Eras:     ' + eras.length);
  " 2>/dev/null || echo "   (could not parse app-data.json for summary)"
fi

# Show git diff stat if app-data.json is tracked
if git diff --stat -- "$APP_DATA" 2>/dev/null | grep -q .; then
  echo ""
  echo "   Git diff:"
  git diff --stat -- "$APP_DATA" 2>/dev/null | sed 's/^/   /'
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  Data updated — review changes before committing/deploying."
exit 0
