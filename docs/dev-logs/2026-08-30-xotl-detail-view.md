# Dev Log: Mode X Detail View (1.36.1)

**Date:** 2026-08-30
**Feature:** Xotl RAT data in detail/variant drill-down view

## What Changed

### Problem
Mode X replaced MegaMek weights with Xotl availability values in the main table (v1.36.0), but the detail/variant drill-down view still showed MegaMek data structures (rating tiers, weight class distribution, variant probabilities) regardless of mode.

### Solution
Added Mode X-aware branches to `renderMechView()` and `showVariants()`, plus two new data accessor functions and a CSS helper.

### Files Modified
- `app/app.js` — New functions + modified existing functions
- `app/style.css` — New CSS classes for availability color coding
- `test/core.test.mjs` — 14 new tests

### New Functions
1. `getXotlVariantData(chassisName, factionCode, eraYear, xotl)` — Returns array of `{variant, name, availability, tonnage}` for all variants of a chassis that have data for the given faction+era.
2. `getXotlAllFactionVariantData(chassisName, eraYear, xotl)` — Returns Map of `{variantName: {factionCode: availability}}` for cross-faction comparison.
3. `xotlAvailClass(val)` — Returns CSS class name: `rare` (1-3), `uncommon` (4-6), `common` (7-10), `na` (null).
4. `showVariantsXotl(chassisName, faction, eraYear, overlay, title, content)` — Renders the Mode X variant drill-down.

### Modified Functions
1. `renderMechView()` — Added Mode X branch showing Faction | Availability | Variants table instead of Faction | DR | Prob | Weight.
2. `showVariants()` — Added early return to `showVariantsXotl()` when Mode X is active.

### Design Decisions
- Both new data functions accept `xotl` as an optional 4th parameter (falls back to global `xotlData`), matching `buildXotlWeights()` pattern for testability.
- The cross-faction comparison table is the "killer feature" — shows all variants × all factions in a compact grid with color coding.
- When no faction is selected in Mode X, shows only the cross-faction comparison table.
- When a faction is selected, shows both the per-faction variant list AND the cross-faction comparison (with selected faction column highlighted).
- Skipped MegaMek-specific sections entirely in Mode X: Rating Tiers, Weight Class Distribution, Sub-Command Availability, variant probability distribution.

### Test Results
- 249 tests pass (235 original + 14 new), 0 failures
- New tests cover: `getXotlVariantData` (6 tests), `getXotlAllFactionVariantData` (4 tests), `xotlAvailClass` (4 tests)

### Version
Bumped from 1.36.0 → 1.36.1
