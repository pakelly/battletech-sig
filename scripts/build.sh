#!/bin/bash
set -e
cd "$(dirname "$0")/.."

# Check for mm-data
if [ ! -d "mm-data/data/forcegenerator" ]; then
  echo "ERROR: mm-data not found. Run setup first:"
  echo "  git clone --depth 1 --filter=blob:none --sparse https://github.com/MegaMek/mm-data.git mm-data"
  echo "  cd mm-data && git sparse-checkout set data/forcegenerator"
  exit 1
fi

echo "=== Step 1: Ingestion ==="
node scripts/ingest-megamek.mjs
echo ""
echo "=== Step 2: Scoring ==="
node scripts/score.mjs
echo ""
echo "=== Step 3: Parse Mekfiles ==="
node scripts/parse-mekfiles.mjs
echo ""
echo "=== Step 4: Combine ==="
node scripts/combine.mjs
echo ""
echo "=== Done ==="
echo "Serve with: cd app && python3 -m http.server 8080"
