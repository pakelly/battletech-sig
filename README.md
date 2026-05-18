# BattleTech Faction Signatures

A tool for BattleTech hobbyists to explore faction identity through mech usage data. See which mechs define a faction's character and compare roster differences across the Inner Sphere and Clans.

## Quick Start

```bash
# 1. Clone upstream MegaMek data (one-time setup)
git clone --depth 1 --filter=blob:none --sparse https://github.com/MegaMek/mm-data.git mm-data
cd mm-data && git sparse-checkout set data/forcegenerator && cd ..

# 2. Generate data
bash scripts/build.sh

# 3. Serve the app
cd app && bash serve.sh
# Open http://localhost:8080
```

## Updating Data

To pull the latest MegaMek data and rebuild `app-data.json`:

```bash
bash scripts/update-mm-data.sh
```

This script:
- Clones `mm-data` if missing (sparse checkout of only the paths we need)
- Pulls the latest upstream data if it already exists
- Runs the full build pipeline
- Reports whether `app-data.json` changed

The script does **not** commit or deploy — review changes before committing.

## Data Sources

- **MegaMek Force Generator** — Weighted mech availability per faction per era. Community-curated from the `MegaMek/mm-data` repository. CC BY-NC-SA 4.0.
- **Master Unit List (MUL)** — Official Catalyst Game Labs unit database. Provides canon confirmation of faction availability plus chassis metadata (tonnage, intro dates, tech base).

## How It Works

### Scoring Model

All scoring is **contextual** — computed at runtime based on which factions you're comparing.

**Scoped Preference (1–10)**: How much does a faction over-index on a chassis compared to the other factions in your current view? This is the primary metric, driving heat map colors.

- 10 = most outsized user among scoped factions
- 1 = barely fields it (or doesn't field it at all) relative to peers
- Recalculates every time you change the faction scope

**Spread**: Max minus min raw weight across scoped factions. High spread = factions disagree about this mech. Use `spread>2` to filter out workhorses.

**Span**: How many scoped factions field the chassis. `span<4` removes widely-shared mechs.

### Data Modes

- **Mode B (default)**: MegaMek weights filtered by MUL availability. Canon-confirmed.
- **Mode A**: Raw MegaMek weights only. Broader coverage but may include extrapolations.

### Chassis Families

Related chassis (Dragon + Grand Dragon, Atlas + Atlas II) are merged by default for stronger faction identity signals. Toggle with `family=off`.

## Query Language

The query bar supports structured queries:

```
faction=GreatHouses year=3039 spread>2 sort by spread desc
faction=(DC OR FS) sort by DC preference desc
chassis=Awesome
faction=DC year=3039
```

### Fields

| Field | Description | Examples |
|-------|-------------|----------|
| `faction` | Factions to compare | `faction=DC`, `faction=GreatHouses`, `faction=(DC OR FS)` |
| `chassis` | Specific chassis | `chassis=Dragon`, `chassis=HBK` |
| `class` | Weight class | `class=Assault`, `class=Heavy` |
| `spread` | Spread filter | `spread>2`, `spread>5` |
| `span` | Span filter | `span<4` |
| `avg-pref` | Average preference | `avg-pref<6` |
| `weight` | Raw MegaMek weight | `weight>5` |
| `year` | Target year | `year=3039`, `year=3052` |
| `era` | Era name | `era=ClanInvasion` |
| `sort` | Sort results | `sort by spread desc` |
| `mode` | Data mode | `mode=A` |
| `family` | Family grouping | `family=off` |

### Shortcuts

- `GreatHouses` → DC, FS, FWL, LA, CC
- `Clans` → All Clan factions
- `Periphery` → TC, MH, OA, MC

## Project Structure

```
scripts/
  ingest-megamek.mjs    # Parse MegaMek XMLs (don't modify)
  ingest-mul.mjs        # Pull MUL API data
  score.mjs             # Organize resolved data
  combine.mjs           # Generate app-data.json
app/
  index.html            # Single-page app
  style.css             # Dark theme styles
  app.js                # Client-side query engine & rendering
  app-data.json         # Generated data file
  serve.sh              # Simple HTTP server
config/
  chassis-families.json # Family grouping definitions
data/
  megamek/              # MegaMek XML source files
  mul-cache/            # Cached MUL API responses
  mul-faction-map.json  # MegaMek→MUL faction mapping
output/
  megamek-resolved.json # Resolved MegaMek inheritance data
  scores.json           # Organized scores
  app-data.json         # App data (also copied to app/)
```

## Design

See [DESIGN.md](DESIGN.md) for the full design document including scoring model details, query language specification, and architecture decisions.
