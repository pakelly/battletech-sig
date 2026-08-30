# Dev Log: Mode X — Xotl RAT Implementation

**Date:** 2026-08-30  
**Feature:** Add Mode X (Xotl RAT) as third data mode

## Summary

Added "Mode X — Xotl RAT" as a third data mode to the BattleTech Faction Signatures app. Mode X uses community rarity tables by Xotl, providing independent availability ratings (1-10) per chassis per faction per era. Covers Inner Sphere factions only, eras 2750-3057.

## Changes Made

### DESIGN.md
- Added Mode X to the Data Modes table
- Documented era mapping, faction mapping, column resolution, chassis aggregation, and limitations

### app/index.html
- Added Mode X radio button in Settings → Data Mode section
- Updated help text to mention Mode X

### app/app.js (v1.35.1 → v1.36.0)
- Added `XOTL_FACTION_MAP` (12 faction mappings: SL, CC, DC, FS, FWL, LC, FRR, SIC, MERC, MOC, OA, TC)
- Added `XOTL_ERA_MAP` (6 era mappings: 2765→2750, 3028, 3039, 3049/3055→3050, 3058→3057)
- Added `loadXotlData()` — lazy-loads `xotl-rarity.json` on first Mode X query
- Added `buildXotlWeights()` — builds weights object from Xotl data for a chassis+era
- Added `resolveXotlChassis()` — maps Xotl mech entries to app chassis names via:
  1. Direct chassis name match (variant or name field)
  2. modelPrefixes lookup (variant code prefix → chassis name)
  3. Multi-word name combining (variant="Black" + name="Knight..." → "Black Knight")
  4. Partial match for parenthetical names ("Wolf Trap" → "Wolf Trap (Tora)")
- Added `getXotlColumnValue()` — resolves era-specific column values (A/B vs C/D/F, Regular vs Royal)
- Made `runQuery()` async to support lazy-loading Xotl data
- Injected Xotl weight substitution after MegaMek weight resolution, before MUL filtering
- Mode X skips MUL filtering (`modeB = parsed.mode !== 'A' && parsed.mode !== 'X'`)
- Updated mode indicator text
- Updated settings radio handler to support mode=X
- Updated query suggestions to include Mode X
- Chip rendering already handles non-B modes (no change needed)

### scripts/deploy.sh
- Added `app/xotl-rarity.json` to git checkout, cp, EXPECTED check, and git add

### test/core.test.mjs
- Added 7 new test suites (29 tests total in Mode X section):
  - Xotl Faction Mapping (4 tests)
  - Xotl Era Mapping (5 tests)
  - getXotlColumnValue (6 tests)
  - buildXotlWeights (7 tests)
  - Mode X Query Parsing (2 tests)
  - Mode X skips MUL filtering (1 test)
  - Xotl Data Integrity (4 tests)
- Added new functions to test wrapper export: `XOTL_FACTION_MAP`, `XOTL_ERA_MAP`, `getXotlColumnValue`, `resolveXotlChassis`, `buildXotlWeights`

## Key Decisions

1. **Chassis aggregation by max:** Multiple variants of the same chassis are aggregated by taking the maximum availability across variants. This represents the chassis's best availability for that faction.

2. **A/B column priority:** When Xotl has A/B and C/D/F columns for the same era, take A/B (front-line) as primary. Falls back to C/D/F if A/B is missing.

3. **Lazy loading:** Xotl data is only loaded when a Mode X query is executed, avoiding unnecessary data transfer for Mode A/B users.

4. **Async runQuery:** Made `runQuery()` async to support the lazy-load. All callers already work with the async pattern (fire-and-forget).

5. **resolveXotlChassis:** The Xotl data has inconsistent field usage — sometimes `variant` is the chassis name and `name` is the variant code, sometimes reversed. The resolver handles both cases plus multi-word name splits (variant="Black", name="Knight BL-6-KNT" → "Black Knight").

## Test Results

- All 235 tests pass (206 existing + 29 new)
- 0 failures

## Limitations

- Inner Sphere only — no Clan data in Xotl tables
- Era coverage ends at 3057 — app eras beyond 3058 show N/A
- Not filtered by MUL canon availability
- Chassis aggregation may lose variant-level nuance
- BV range computation uses MegaMek variant data (not Xotl) — Mode X weights replace MegaMek weights, but variant metadata (BV, intro dates) still comes from app-data.json
