#!/bin/bash
set -e
cd "$(dirname "$0")/.."
echo "=== Step 1: Ingestion ==="
node scripts/ingest-megamek.mjs
echo ""
echo "=== Step 2: Scoring ==="
node scripts/score.mjs
echo ""
echo "=== Step 3: Combine ==="
node scripts/combine.mjs
echo ""
echo "=== Done ==="
echo "Serve with: cd app && python3 -m http.server 8080"
