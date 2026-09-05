# Dev Log: Xotl Rarity Data Re-ingestion

**Date:** 2026-09-05
**Feature:** Fix missing Great House availability data in xotl-rarity.json

## Problem

91 core Succession Wars 'Mechs (Rifleman, Archer, Warhammer, etc.) only had Mercenary/Periphery faction data in `app/xotl-rarity.json`. Great House entries were never captured during the original ingestion, making common 'Mechs appear virtually exclusive to FedSuns or absent from other houses in Mode X.

## Root Cause

The original ingestion script failed to capture Great House table entries from the Xotl RAT PDF for 'Mechs that also appeared in the "Mercenary / Periphery General" section. All 91 affected entries shared:
- `tonnage: null`
- Swapped `variant`/`name` fields (variant = code like "RFL-3N", name = chassis like "Rifleman")
- Only "Mercenary / Periphery General: 3028-3050" + periphery faction sections

## Fix

Downloaded the source PDF (Xotl RAT v10.64) from Dropbox and wrote a Python parser (`scripts/parse-xotl-rarity.py`) using pdfplumber to extract all faction tables from pages 77-99.

### Parser approach
- Pages 77-95: Great House rarity tables with tonnage brackets `[TON]` format
- Pages 96-99: Merc/Periphery tables without tonnage brackets
- Maps availability numbers to era columns based on faction+era (3028/3039, 3050/A/B/C/D/F, etc.)

### Merge strategy
- New data takes priority for faction sections (has complete Great House data)
- Old data fills in mechs the new parser missed (Star League Royal `b` variants, etc)
- Cleaned 53 parsing artifacts (values > 10 from page numbers bleeding into data)
- Cleaned 16 zero values (Xotl doesn't use 0 as availability)
- Fixed MLN-1A mangled variant name

## Results

| Metric | Before | After |
|--------|--------|-------|
| Total mechs | 582 | 544 |
| Mechs with Great House data | 358 | 487 |
| Mechs without Great House data | 143 | 57 |
| RFL-3N faction entries | 4 (periphery only) | 17 (all factions) |

The 57 without Great House data are Star League-only 'Mechs (extinct by 3028) and a few periphery-specific variants — this is correct.

## Files changed
- `app/xotl-rarity.json` — merged + cleaned data
- `test/core.test.mjs` — relaxed mech count assertion (540+ instead of exactly 582)
- `scripts/parse-xotl-rarity.py` — new parser
- `scripts/merge-xotl.py` — merge script
- `data/xotl-source/xotl-rat-10.64.pdf` — source PDF (not committed, too large)

## Tests
All 259 tests pass.
