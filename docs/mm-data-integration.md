# mm-data Integration Plan

**Status:** In progress (Phase 1)
**Started:** 2026-05-18
**Upstream:** [`MegaMek/mm-data`](https://github.com/MegaMek/mm-data) — the canonical MegaMek data repository (CC BY-NC-SA 4.0)

## Motivation

Currently we ingest data from two fragile sources:
1. **Manually copied MegaMek XMLs** (`data/megamek/*.xml`) — force generator RAT data. These go stale whenever MegaMek updates.
2. **MUL scraping** — unit stats (BV, tonnage, class, intro year). The MUL website is flaky, has rate limits, and can change format without notice.

The `mm-data` repo consolidates all MegaMek data in one place with a stable structure. MekBay (MegaMek's web app) already uses it. Switching to mm-data as our upstream gives us:
- **Live sync** with MegaMek's canonical database (git pull instead of manual file copies)
- **Richer unit data** from `.mtf` files (BV, weapons, armor, movement, role — more than MUL provides)
- **Richer faction data** from YAML files (192 factions with years active, tags, parent chains, capitals)
- **Elimination of MUL scraping** — the most fragile part of our pipeline
- **Era definitions** from canonical `eras.xml`

## Phases

### Phase 1: Connect to mm-data upstream
- Add `mm-data` as a git submodule (or scripted shallow clone)
- Update `ingest-megamek.mjs` to read from `mm-data/data/forcegenerator/` instead of `data/megamek/`
- Update `factions.xml` ingestion to read from mm-data's faction source
- Verify: existing scoring/output unchanged (regression test against current `app-data.json`)
- **No app changes.** Pure pipeline plumbing.

### Phase 2: Parse mekfiles for unit stats
- Write a `.mtf` parser that extracts: chassis, model, tonnage, BV, intro year, tech base, role, weight class, omni status
- Replace MUL-sourced unit metadata with mekfile-sourced data
- Cross-reference with RAT data to ensure chassis name alignment
- Add new fields to `app-data.json` where useful (e.g. `role`)
- **Goal:** Eliminate MUL dependency entirely for unit stats

### Phase 3: Enrich faction metadata
- Parse the 192 faction YAML files for:
  - `yearsActive` ranges (enables "faction didn't exist in this era" messaging)
  - `tags` (CLAN, IS, MAJOR, PERIPHERY, MINOR — enables richer faction grouping)
  - Parent faction chains (enables proper lineage modeling)
  - Full faction names (currently hardcoded in app)
- Surface in the app: faction lifespan indicators, richer tooltip info, smarter autocomplete

### Phase 4: Automate updates
- Script or cron job to pull latest mm-data, rebuild `app-data.json`, and flag if data changed
- Optionally: GitHub Action that auto-rebuilds when mm-data releases a new version

## Data mapping

| Our current field | Current source | mm-data source | Path |
|---|---|---|---|
| RAT weights (faction × era × variant) | `data/megamek/*.xml` | Force generator XMLs | `data/forcegenerator/*.xml` |
| Faction codes & names | `data/megamek/factions.xml` | Faction YAMLs | `data/universe/factions/*.yml` |
| Faction hierarchy/parents | `factions.xml` parentFaction | YAML fields | `data/universe/factions/*.yml` |
| Era definitions | Hardcoded in app | Canonical eras | `data/universe/eras.xml` |
| Unit tonnage, BV, class | MUL scraping | Mek files | `data/mekfiles/meks/**/*.mtf` |
| Unit intro year | MUL + MegaMek | `.mtf` `era:` field | `data/mekfiles/meks/**/*.mtf` |
| Unit tech base | MUL | `.mtf` `techbase:` field | `data/mekfiles/meks/**/*.mtf` |
| Unit role | Not available | `.mtf` `role:` field (new!) | `data/mekfiles/meks/**/*.mtf` |

## License compliance

mm-data is **CC BY-NC-SA 4.0**. Our app is non-commercial and open source. We must:
- Include attribution to The MegaMek Team
- Note the license in our README/about
- Share-alike: any derivative data we publish must use the same license
