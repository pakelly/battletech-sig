# Combined Score Column Development Log

**Date:** 2026-06-21  
**Task:** Add a Combined Score column (DR + Prob normalized sum)

## Task Overview

Adding a new "Cmb" (Combined) column that shows the sum of normalized DR and normalized Prob per faction. This gives users a single metric that captures both how much a faction prefers a chassis AND how much they actually use it.

**Algorithm:**
```
Combined = DR_norm + Prob_norm

DR_norm = min(1, max(0, DR / 4.0))
  - DR is the raw z-score from computeSignature()
  - 4.0 is the theoretical ceiling (sole operator in pool of ~17: sqrt(16)=4)
  - Clamp to [0, 1]

Prob_norm = min(1, max(0, log2(biasedWeight) / 5.0))
  - biasedWeight is the probability-space weight (2^(rating/2) × WCD_mix_factor)
  - 5.0 = log2(32) where 32 = 2^(10/2), the max weight 10 in prob space
  - Clamp to [0, 1]

Output range: 0 to 2.0
```

## Implementation Plan (DEFEND Mode)

1. First update DESIGN.md with the new column design
2. Trace affected code paths in app.js
3. Write tests FIRST (in test/core.test.mjs)
4. Implement the changes
5. Run all tests - all 201+ tests must pass
6. Build (`bash scripts/build.sh`)
7. Commit (one concern per commit)
8. Deploy to test ONLY: `./scripts/deploy.sh test`
9. Report back

## Progress Log

### Step 1: Update DESIGN.md ✓

Updated DESIGN.md to include:
- Added `cmb` and `DC-cmb` fields to query language table
- Added Combined Score display mode documentation to Faction Comparison View
- Updated column visibility menu to include separate Combined column
- Documented the three-mode cycling: DR|Prob → Prob → Combined → repeat
- Added green emerald palette for Combined score heat coloring

### Step 2: Trace affected code paths ✓

**Key functions to modify:**
1. `computeSignature()` - around line 1029 - computes DR scores, needs to also compute combined scores
2. `resolveHeaderSort()` - around line 2378 - handle 3-state cycle (DR|Prob → Prob → Cmb → repeat)
3. `handleHeaderSort()` - around line 2419 - update header text cycling
4. `renderFactionComparison()` - around line 1500 - add Combined display mode
5. `renderSingleFaction()` - around line 1750 - add Combined column option
6. `sortRowsInPlace()` - around line 3300 - add cmb sorting support
7. `parseQuery()` - add cmb and faction-cmb field support
8. `getSuggestions()` - add cmb to sortableFields
9. Column visibility/order system - register new Combined column

**Data flow:**
- `row.biasedWeights[f]` already computed (probability × WCD mixing)
- `row.sig[f]` already computed (DR raw score)
- Need to add `row.combined[f]` computation after both are available
- Store combined score using: `DR_norm + Prob_norm` where both normalized to [0,1]

### Step 3: Write tests FIRST ✓

Added tests for Combined Score in `test/core.test.mjs`:
- `computes combined score correctly` - validates the normalization formula
- `sorts by combined score desc` - faction-specific sorting (DC-cmb)
- `sorts by combined score max across factions` - global combined sorting (cmb)
- `parses combined score filters` - query parsing for cmb and DC-cmb filters

### Step 4: Implement the changes ✓

**Core logic implemented:**
- ✓ Added `row.combined[f]` computation after biasedWeights and sig computation
- ✓ Added combined score filtering (both `cmb>val` and `DC-cmb>val`)
- ✓ Added combined score sorting support in `sortRowsInPlace`
- ✓ Updated query parser to handle cmb/combined fields
- ✓ Added cmb to suggestion system (FIELD_NAMES, sortableFields, etc.)
- ✓ Updated `resolveHeaderSort` for 3-state cycle (DR|Prob → Prob → Cmb → repeat)
- ✓ Added `cmbHeatClass` function for emerald green heat coloring
- ✓ Updated split cell rendering to handle 3 display modes dynamically
- ✓ All 205 tests pass, including 4 new combined score tests

**Still needed:**
- CSS for emerald palette and full-cell styles
- Update single faction view rendering
- Column visibility system integration
- Test the UI manually

### Step 5: Add CSS styles ✓

**CSS implemented:**
- ✓ Added emerald color palette (--emerald-1 through --emerald-10) for Combined score coloring
- ✓ Added emerald CSS classes (.emerald-1 through .emerald-10)
- ✓ Added .full-cell style for single-value display modes (Prob-only and Combined modes)
- ✓ Updated single faction view to include separate Combined column
- ✓ Updated multi-faction view to include separate Combined column headers
- ✓ Build completed successfully

### Step 6: Deploy to test and manual verification
