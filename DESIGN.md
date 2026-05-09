# BattleTech Faction Signatures — Design Document

**Draft v0.7 — 2026-05-09**

---

## Purpose

A tool for BattleTech hobbyists to explore faction identity through mech usage data. The primary use cases:

1. **"I have a mini — who should I paint it for?"** → See which factions are the biggest users of a chassis.
2. **"I'm building a faction force — what's iconic?"** → See which chassis define a faction's identity.
3. **"How do these factions differ?"** → Compare faction rosters side by side, filtering out shared noise.

---

## Data Sources

### MegaMek Force Generator (Primary)
- **Source:** `MegaMek/mm-data` GitHub repo, `data/forcegenerator/`
- **Content:** 40 era XML files (2398–3160) + `factions.xml`
- **What it provides:** Weighted availability of chassis and variants per faction per era. Numeric weights represent relative likelihood of a faction fielding that chassis. Higher = more common in that faction's forces.
- **Faction inheritance:** Child factions (e.g., DC, FS, LA) inherit from parent factions (e.g., IS) when no explicit entry exists. Must be resolved at parse time.
- **License:** CC BY-NC-SA 4.0

### Master Unit List / MUL (Supplementary)
- **Source:** `masterunitlist.azurewebsites.net` JSON API
- **Content:** Official Catalyst Game Labs unit database. Binary availability per faction per era, plus metadata (tonnage, BV, cost, introduction date, role, tech base, Alpha Strike stats).
- **What it provides:** Canon confirmation of faction availability + variant introduction dates for year filtering.
- **No auth required.**

### Data Modes

The user selects one of two scoring modes:

| Mode | Label | Description |
|------|-------|-------------|
| **A** | MegaMek Only | Raw MegaMek force generator weights. Community-curated, richer granularity. May include extrapolations beyond official canon. |
| **B** | MegaMek × MUL | MegaMek weights filtered by MUL binary availability. If the MUL says a faction doesn't have access to a chassis in that era, the weight is zeroed out. Canon-filtered. |

Mode B is the default. Mode A is available as a toggle for users who want the broader, unfiltered MegaMek data.

---

## Core Concepts

### The Matrix

The fundamental data structure is **Factions × Chassis**, evaluated within an **Era** (or target year). Each cell contains the faction's resolved weight for that chassis.

### Scoring Model

All scoring is **contextual** — derived at runtime from the raw weight data based on the user's current faction scope. Nothing is precomputed except the raw weights themselves.

#### Scoped Preference (1–10) — The KPI
How much does a faction over-index on this chassis compared to the other factions currently in the user's search scope?

- Recalculates every time the user adds or removes factions from their view.
- **1** = barely fields it relative to the scoped factions
- **10** = the most outsized user among scoped factions

Normalization: linear min-to-max mapping across the scoped factions' weights for this chassis, **including factions that don't field it as weight 0.** The faction with the highest weight = 10, a faction with weight 0 = 1. Narrowing the scope magnifies real differences.

Factions with weight 0 score preference 1 (not absent). This is critical: a mech fielded exclusively by one scoped faction must score 10 for that faction, not 5. The zeros ARE the comparison — "you have it and they don't" is the strongest possible signal.

**This is the primary display value.** It drives heat maps, coloring, and sorting.

#### Derived Filter Values

These are all derived from the same raw weights and scoped preference. They exist for filtering and sorting, not as primary display metrics.

**Span** — How many of the scoped factions field this chassis?
- Example: 5 Great Houses in scope, Marauder available to all 5 → span = 5. Valkyrie available to 2 → span = 2.
- Filter: `span<4` removes mechs that most scoped factions share.

**Spread** — Max scoped preference minus min scoped preference across scoped factions.
- High spread = factions disagree about this mech = interesting.
- Low spread = factions agree = workhorse noise.
- Filter: `spread>3` keeps only mechs where someone stands out.

**Avg Preference** — Mean scoped preference across all scoped factions that field this chassis.
- High avg-pref with low spread = everyone loves it equally = workhorse.
- Low avg-pref with one high outlier = one faction dominates = distinctive.
- Filter: `avg-pref<6` removes mechs where scoped factions have uniformly high usage.

**Weight** — The raw MegaMek weight for a specific faction. Not normalized.
- Filter: `weight>5` keeps only mechs that the faction actually fields in meaningful numbers. Removes deep cuts and rarities.

#### Workhorse Filtering

"Workhorses" are mechs where the scoped factions all use them at similar rates. The Marauder, Rifleman, Archer, Warhammer — the old Unseen/Reseen designs that every faction fields.

The workhorse problem is that min-to-max normalization blows up tiny differences. Marauder at DC:4, FS:4, LA:4, CC:4, FWL:3 maps to DC preference 10 — technically correct but meaningless. A 1-point spread shouldn't produce a 9-point preference gap.

**Solution:** Use span and avg-pref as filters alongside scoped preference:
- `span<4` — "not everyone has this"
- `avg-pref<6` — "usage isn't uniformly high"
- `spread>3` — "there's real disagreement"
- Any combination narrows to faction-defining mechs.

The user decides their threshold. No hard workhorse classification needed.

### Why This Model

Previous iterations tried global scores (Span, Global Preference, Ubiquity) to pre-classify mechs. All broke at edge cases or answered questions the user wasn't asking.

The insight: **every interesting question is faction-relative.** Scoped Preference is the KPI. Everything else is a filter on that KPI. All values are scoped, dynamic, and derived from the same raw weights. No precomputation, no edge cases, no stale classifications.

| Query | What it does |
|-------|-------------|
| `faction=(DC OR FS) spread>3 sort by spread desc` | Most faction-defining mechs between DC and FedSuns |
| `faction=GreatHouses span<4 sort by spread desc` | Mechs that only some houses field — maximum faction identity |
| `faction=GreatHouses weight>5 spread>2 sort by DC preference desc` | Common, distinctive DC mechs among the houses |
| `faction=GreatHouses chassis=Awesome` | See each house's preference for the Awesome |

**Edge case — single faction in scope:** No comparison possible. Show the faction's roster ranked by raw weight. Spread, span, avg-pref not displayed. "Show me the Combine's most-used mechs."

**Edge case — mech view with no faction scope:** Show ALL factions that field the chassis, ranked by raw weight. "Who uses this mech?"

---

## Data Hierarchy

The tool operates at two levels:

```
Chassis ← primary scoring unit (scoped preference + spread)
 └── Variant ← detail view only (internal distribution within a faction)
```

**Chassis Families** are not a hierarchy level — they are a **merge rule** (see below).

### Chassis (Primary Unit)

The chassis is the unit of faction identity and the unit the tool operates on by default. All scoring, filtering, comparison, and heat maps work at the chassis level.

**Rationale:** The miniature IS the chassis. Painting decisions, collection planning, and force identity all operate at the chassis level. Nobody says "I need a Davion AWS-8R" — they say "I need a Davion Awesome."

### Variant (Detail View)

When the user drills into a specific faction + chassis combination, they see the variant breakdown as an internal distribution:

> **FWL — Awesome** (Scoped Pref: 10, Spread: 9)
> - AWS-8Q: 58%
> - AWS-8R: 29%
> - AWS-8T: 8%
> - AWS-8V: 5%

Variant ratios are the normalized weights within that faction's entry for the chassis. There is no cross-faction variant comparison. Variants are a flavor/composition detail, not a faction identity signal.

**Why variants are detail-only:** The variant matters for game-time decisions (BV budget, loadout preferences, min-maxing), not livery decisions. The camo scheme is the same whether you're fielding a DRG-1N or a DRG-5K.

#### Variant Weight Resolution

When a faction has an explicit chassis weight but no explicit variant override, the variant weight is inherited from the parent faction (typically `IS` or `CLAN`) and scaled by the chassis affinity ratio:

```
effective_variant_weight = inherited_variant_weight × (faction_chassis_weight / parent_chassis_weight)
```

**Example — FWL Awesome AWS-8Q:**
- FWL chassis weight: 10, IS chassis weight: 7
- AWS-8Q inherited from IS: weight 8
- FWL effective 8Q weight: 8 × (10/7) = 11.4

When a faction has an explicit variant entry, use it directly — no scaling needed.

The chassis weight acts as a faction-specific multiplier on all inherited variants. This means a faction's overall affinity for the platform bleeds through to every variant, even when MegaMek doesn't have faction-specific variant overrides.

### Chassis Families (Merge Rule)

Chassis families are **not a level in the hierarchy** — they are a configuration that tells the tool to treat two or more chassis as a single entry for scoring purposes.

**Rationale:** Some chassis are closely related designs that share a miniature proxy relationship. A Dragon mini proxies for a Grand Dragon. An Atlas mini proxies for an Atlas II. From a painting perspective, the family's combined faction affinity is what matters — if the Combine fields both Dragons and Grand Dragons in high numbers, that only *strengthens* the signal that Dragon-shaped mechs belong in DC livery.

When family grouping is enabled, member chassis weights are summed and scored as a single entry. When disabled, each chassis scores independently.

**Families on by default:** The default experience should give the strongest possible faction identity signal. Merging related chassis does that. Users who care about individual chassis distinctions can toggle families off.

#### Configuration

Chassis families are stored in `config/chassis-families.json`:

```json
[
  {
    "groupName": "Dragon Family",
    "chassis": ["Dragon", "Grand Dragon"],
    "enabled": true
  },
  {
    "groupName": "Atlas Family",
    "chassis": ["Atlas", "Atlas II", "Atlas III"],
    "enabled": true
  }
]
```

- **Auto-detected** from naming patterns (IIC, II/III/IV, Grand/Heavy prefixes, Mk variants)
- **User-editable** — add, remove, rename, enable/disable per family
- **Global toggle** in the UI to enable/disable all family grouping at once
- A chassis can belong to at most one family

---

## Era & Year Selection

### Era Selection
The user can multi-select specific eras from the MegaMek era list (2398, 2440, ... 3160). When multiple eras are selected, weights are **averaged** across the selected eras for chassis that appear in more than one. A chassis that exists in only some selected eras uses the average of the eras where it appears.

### Target Year
The user can enter a specific year (e.g., 3052). The tool:

1. Selects the most recent era that starts on or before the target year (3052 → era 3049)
2. Filters out any chassis/variant with a MUL introduction date after the target year
3. This gives "what was actually on the battlefield in 3052" — not everything that existed at some point during the Clan Invasion era

Target year requires MUL data for introduction dates. If MUL data is unavailable, the tool falls back to era-only selection.

### Intro Date Resolution

Not all chassis have both era availability and MUL introduction dates. Resolution rules:

| Era Availability | Intro Date | Resolution |
|---|---|---|
| ✅ Present | ✅ Present | Full precision — use era data, filter by intro year within era |
| ✅ Present | ❌ Missing | Permissive — available for the full era |
| ❌ Missing | ✅ Present | Derive — available from intro date forward, slotted into the appropriate era |
| ❌ Missing | ❌ Missing | Excluded from era/year queries (still findable via direct `chassis=` query) |

---

## User Workflow

### Input Method: Query Bar

The primary input is a **query bar** — a text input where the user types structured queries. This serves as both the input method and the visible representation of the current filter state.

**Rationale:** A query bar defers visual UI design decisions while providing full expressiveness. It's unambiguous (the user sees exactly what filters are active), power-user friendly (BattleTech hobbyists are not casual users), and serves as the underlying model for a future structured form UI.

**Future intent:** A structured form (dropdowns, sliders, toggles) will be layered on top of the query bar. The form controls will read from and write to the same query syntax — editing either keeps them in sync. The query bar will remain visible (collapsible) as a power-user escape hatch and filter transparency tool.

### Query Language

Queries are a set of field expressions joined by implicit `AND`. `OR` is supported within a field. Parentheses group `OR` terms.

#### Fields

| Field | Type | Description | Examples |
|-------|------|-------------|----------|
| `faction` | text (multi) | Factions to include in scope | `faction="Draconis Combine"` |
| `chassis` | text (multi) | Specific chassis to view | `chassis="Awesome"` |
| `class` | enum | Weight class filter | `class=Assault`, `class=Heavy` |
| `spread` | numeric (0–10) | Spread filter (max - min scoped preference) | `spread>3`, `spread>5` |
| `span` | numeric | How many scoped factions field it | `span<4`, `span<=2` |
| `avg-pref` | numeric (1–10) | Mean scoped preference across scoped factions | `avg-pref<6` |
| `weight` | numeric | Raw MegaMek weight for a faction | `weight>5` |
| `sort` | keyword | Sort results. Supports multi-sort (comma-separated) | `sort by spread desc`, `sort by DC preference desc, spread desc` |
| `year` | numeric | Target year (auto-selects era, filters by intro date) | `year=3052` |
| `era` | text | Era selection (multi-select) | `era=ClanInvasion` |
| `family` | toggle | Chassis family grouping | `family=on`, `family=off` |
| `industrial` | toggle | IndustrialMech visibility | `industrial=show`, `industrial=hide` |
| `mode` | enum | Data mode | `mode=A`, `mode=B` |

#### Operators

- `=` — exact match or set membership
- `!=` / `NOT` — exclusion. `faction!="Mercs"`, `NOT class=Light`
- `<`, `>`, `<=`, `>=` — numeric comparison
- `OR` — alternative values within a field
- Parentheses — grouping for `OR` terms
- `*` — wildcard (suffix match)

#### String Matching

All string matching is **case-insensitive** and supports **partial match** — `chassis=hatch` finds Hatchetman, `faction=fed` finds Federated Suns. Common faction codes (DC, FS, FWL, LA, CC, CJF, CW, etc.) and model prefixes (HBK, AWS, DRG, etc.) are recognized as aliases.

#### Shortcuts

Common groupings expand to their full lists:

| Shortcut | Expands to |
|----------|-----------|
| `faction=GreatHouses` | FS, DC, LA, FWL, CC |
| `faction=Clans` | All Clan factions |
| `faction=Periphery` | All periphery factions |
| `class=Light` | 20–35 tons |
| `class=Medium` | 40–55 tons |
| `class=Heavy` | 60–75 tons |
| `class=Assault` | 80–100 tons |

#### Example Queries

**"Show me distinctive assault mechs across the Great Houses circa 3041, minus the workhorses":**
```
faction=GreatHouses year=3041 class=Assault spread>1 sort by spread desc
```

**"What's the Awesome's faction profile?":**
```
chassis="Awesome"
```

**"Compare Davion and Steiner heavy mechs in the Clan Invasion":**
```
faction=("Federated Suns" OR "Lyran Commonwealth") class=Heavy era=ClanInvasion
```

**"Show me everything the Combine has that nobody else does":**
```
faction="Draconis Combine"
```

#### Auto-Suggest

As the user types, the query bar provides context-aware suggestions:
- Typing `fac` suggests `faction=`
- After `faction=`, suggests faction names from the dataset
- After `chassis=`, suggests chassis names
- After operators like `span`, suggests valid comparisons

This lets click-oriented users build queries through auto-complete without memorizing syntax.

### View Routing

The query determines which view to display:

- **Query contains `chassis=` but no `faction=`** → **Mech View**: heat map of the specified chassis across all factions (or factions meeting other filter criteria).
- **Query contains `faction=` but no `chassis=`** → **Faction View**: ranked list of chassis for the specified faction(s), filtered by any chassis criteria.
- **Query contains both** → **Matrix View**: intersection — the specified chassis scored against the specified factions.
- **Neither** → Landing state with example queries.

### Mech View

**"I have a mini — who should I paint it for?"**

Display: a heat map row (or card) per chassis showing Scoped Preference across factions. Color intensity = preference. Spread displayed as an indicator. With no factions scoped, shows all factions ranked by raw weight.

### Faction View

**"I'm building a force — what's iconic?"**

Display: a ranked list of chassis sorted by spread (descending) or scoped preference. Multiple factions shown as side-by-side columns. Single faction: ranked by raw weight. Multiple factions: ranked by spread to surface the most differentiating mechs first.

### Drill-Down

In any view, clicking a faction + chassis cell opens the **variant breakdown** — internal distribution of variant weights for that faction's use of that chassis.

### Filtering Summary

All filters are expressed in the query bar:

| Filter | Query syntax |
|--------|-------------|
| Era / target year | `era=ClanInvasion` or `year=3052` |
| Data mode | `mode=A` or `mode=B` |
| Chassis families | `family=on` or `family=off` |
| Hide IndustrialMechs | `industrial=hide` |
| Span range | `span<8`, `span>=3` |
| Preference range | `preference>6` |
| Weight class | `class=Assault` |

---

## Technical Architecture

### Data Pipeline

```
[MegaMek XMLs] → ingest-megamek.mjs → megamek-data.json (resolved inheritance)
                                              ↓
[MUL API]      → ingest-mul.mjs     → mul-availability.json
                                              ↓
                                       combine.mjs → app-data.json
```

### Inheritance Resolution (Critical)

During MegaMek ingestion, parent faction inheritance must be fully resolved:

1. Parse `factions.xml` to build the faction hierarchy (e.g., DC → IS, CJF → CLAN)
2. For each era, for each chassis:
   - If a faction has an explicit entry, use it
   - If a faction has no entry but its parent does, inherit the parent's weight
3. For variant-level resolution within a faction:
   - If the faction has an explicit variant entry, use it
   - If not, inherit from parent and scale by chassis affinity ratio

### Scoring Computation

`app-data.json` contains resolved weights and precomputed global scores. Scoped preference is computed at runtime in the UI.

**Precomputed (in app-data.json):**
- Per era + chassis: resolved weight per faction, MUL availability flag
- Per era + chassis + faction: variant weights (for drill-down)
- Faction metadata: name, clan/IS/periphery, years active
- Chassis metadata: tonnage, tech base, category (combat/industrial), introduction date

**Computed at runtime (in the UI):**
- **Scoped preference** — recalculated on every scope change (faction add/remove)
- **Spread** — derived from scoped preference (max - min across scoped factions)

### UI Technology

Vanilla HTML/CSS/JS. No framework. Single-page app loading `app-data.json` at startup.

Dark theme. Desktop-first, mobile-responsive as a secondary concern.

---

## Resolved Design Decisions

1. **Scoped Preference normalization:** Linear min-to-max mapping across scoped factions' weights. 1 = lowest, 10 = highest.
2. **Spread:** Derived (max scoped preference - min scoped preference). No separate normalization needed.
3. **Multi-era behavior:** Average weights across selected eras. Chassis present in only some selected eras use the average of eras where they appear.
4. **Merc factions:** Included as a normal faction. Users can exclude with `faction!=Mercs`.
5. **Sub-factions:** Collapsed into parent factions by default. Expandable in a future iteration.

---

## Future Possibilities

- **Collection tracker:** Mark which minis you own and which factions you paint for. The tool recommends what to buy/paint next based on gaps in your faction rosters.
- **Force builder integration:** "Build me a 10,000 BV Davion force that maximizes faction identity score."
- **Vehicles & aerospace:** Extend beyond BattleMechs (same data sources support it).
- **Community sharing:** Export/import faction palettes and chassis family configs.
