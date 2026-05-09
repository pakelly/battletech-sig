# BattleTech Faction Signatures — Design Document

**v1.0 — 2026-05-09**

---

## Purpose

A tool for BattleTech hobbyists to explore faction identity through mech usage data. The primary use cases:

1. **"I have a mini — who should I paint it for?"** → Compare scoped preference across factions for a chassis.
2. **"I'm building a faction force — what's iconic?"** → Sort by global signature to find the faction's totemic mechs.
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

#### MUL General Pools

The MUL API returns faction-specific unit lists, but common designs (e.g., Griffin GRF-1N) are often listed under general pools rather than individual factions. Three general pools supplement per-faction data:

| Pool | MUL ID | Applies To |
|------|--------|-----------|
| IS General | 55 | All Inner Sphere factions (Great Houses, ComStar, FRR, mercs, etc.) |
| Clan General | 56 | All Clan factions |
| Periphery General | 57 | All periphery states |

**MUL confirmation logic:** A chassis is MUL-confirmed for a faction if it appears in either (a) that faction's direct MUL listing, or (b) the appropriate general pool for that faction's affiliation. Availability is cumulative across eras — once a faction gains access, they keep it.

### Data Modes

| Mode | Label | Description |
|------|-------|-------------|
| **A** | MegaMek Only | Raw MegaMek force generator weights. Community-curated, richer granularity. May include extrapolations beyond official canon. |
| **B** | MegaMek × MUL | MegaMek weights filtered by MUL binary availability. If the MUL says a faction doesn't have access to a chassis in that era, the weight is zeroed out. Canon-filtered. |

Mode B is the default.

---

## Core Concepts

### The Matrix

The fundamental data structure is **Factions × Chassis**, evaluated within an **Era** (or target year). Each cell contains the faction's resolved weight for that chassis.

### Two Scoring Metrics

The tool provides two complementary metrics that answer different questions about the same data. Both are computed at runtime from raw weights.

#### Scoped Preference (1–10) — The Comparison Lens

**Question:** "Given this mech, which of these factions wants it more?"

**Direction:** Mech → Faction

**Use case:** "I have a Griffin mini — DC or FS?" Scoped preference directly answers this.

**Behavior:**
- Recalculates every time the user changes the faction scope.
- Linear min-to-max normalization across the **scoped factions'** weights for this chassis.
- **Zeros included:** factions that don't field the chassis score as weight 0. This is critical — "you have it and they don't" is the strongest signal.
- **1** = lowest among scoped factions; **10** = highest.
- Narrowing the scope magnifies small differences. Widening it compresses them.

**Scoped preference is inherently relative.** The same chassis can score 10 for DC vs FS but 5 for DC vs GreatHouses. This is a feature: it's a lens, not a label.

**This is the primary display value in faction cells.** It drives heat map coloring.

#### Global Signature (1–10) — The Identity Checklist

**Question:** "Given this faction, which mechs define it?"

**Direction:** Faction → Mech

**Use case:** "I'm building a DC force — what should I buy?" Sort by DC signature to get the faction's most totemic mechs.

**Formula:** `Signature = √(globalPref × weightNormalized)`

Where:
- **globalPref** = faction's weight for this chassis, normalized 1–10 against **ALL factions in the era** (not just scoped ones). Zeros included for factions without MUL confirmation. This makes it stable — DC's signature for Dragon doesn't change based on who else is in the query.
- **weightNormalized** = faction's raw weight for this chassis, normalized 1–10 across **all chassis that faction fields in the entire era**. This rewards mechs the faction actually uses heavily, not just mechs they technically have exclusive access to.

The geometric mean ensures both factors must be strong. A mech that's exclusive but rarely fielded (high globalPref, low weightNorm) scores mid-range. A mech that's common but not distinctive (low globalPref, high weightNorm) also scores mid-range. Only mechs that are **both distinctive AND important** score high.

**Global signature is stable regardless of scope.** Adding or removing factions from the query doesn't change any faction's signature scores. It's a global property of the faction's relationship to that chassis.

**Expected results — DC in 3039:**

| Chassis | Raw Weight | Global Pref | Weight Norm | Signature | Why |
|---------|-----------|-------------|-------------|-----------|-----|
| Dragon | 8 | 10.0 | 10.0 | 10.0 | DC-exclusive, heavily fielded |
| Panther | 8 | 10.0 | 10.0 | 10.0 | DC-exclusive, heavily fielded |
| Hatamoto-Chi | 6 | 10.0 | 7.4 | 8.6 | DC-exclusive, solid usage |
| Grand Dragon | 6 | 10.0 | 7.4 | 8.6 | DC-exclusive, solid usage |
| Griffin | 6 | 7.8 | 7.4 | 7.6 | Common IS mech, not distinctive |
| Locust | 6 | 7.0 | 7.4 | 7.2 | Everyone has it |
| Exterminator | 3 | 6.4 | 3.6 | 4.8 | Rare even for DC |

#### When to Use Which

| Situation | Use | Why |
|-----------|-----|-----|
| "Who should I paint this Griffin for?" | Scoped Preference | You need a head-to-head comparison between specific factions |
| "What's the most DC mech I don't own yet?" | Global Signature | You need DC's identity ranked by importance |
| "What makes DC different from FS?" | Scoped Preference + Spread | The comparison lens magnifies differences between these two |
| "What are DC's top 10 identity mechs?" | Global Signature | Stable ranking, doesn't depend on who you're comparing against |

### Derived Filter/Sort Values

All of these work as both filters (`field>value`) and sort targets (`sort by field desc`).

| Field | Description | Example |
|-------|-------------|---------|
| **spread** | Max scoped pref − min scoped pref across scoped factions. High = factions disagree = interesting. | `spread>3` |
| **span** | How many scoped factions field this chassis. | `span<4` |
| **avg-pref** | Mean scoped preference across scoped factions that field the chassis. | `avg-pref<6` |
| **weight** | Raw MegaMek weight. Not normalized. | `weight>5` |
| **tons** | Chassis tonnage. | `tons>50`, `tons=75` |
| **sig** | Global signature score (max across scoped factions). | `sig>8` |
| **DC-pref** | Faction-specific scoped preference. | `DC-pref>8` |
| **DC-sig** | Faction-specific global signature. | `DC-sig>7` |

**All fields that can be filtered can also be sorted, and vice versa.** This is a design invariant.

#### Workhorse Filtering

"Workhorses" are mechs where scoped factions all use them at similar rates (Marauder, Archer, Warhammer, etc.).

Min-to-max normalization amplifies tiny differences: Marauder at DC:4, FS:4, LA:4, CC:4, FWL:3 maps to DC preference 10 — technically correct but meaningless.

**Solution:** Combine filters:
- `span<4` — not everyone has this
- `avg-pref<6` — usage isn't uniformly high
- `spread>3` — real disagreement exists
- `sig>8` — only faction-defining mechs

### Why Two Metrics

Previous iterations tried to make one metric do everything. Scoped preference alone can't answer "what defines DC?" because it changes with scope. A single global score can't answer "Griffin — DC or FS?" because it doesn't do head-to-head comparison.

The insight: these are genuinely different questions with different answers. Scoped preference is a **lens** (relative comparison tool). Global signature is a **checklist** (faction identity ranking). Both derive from the same raw weights. Neither replaces the other.

---

## Data Hierarchy

```
Chassis ← primary scoring unit (preference, signature, spread)
 └── Variant ← detail view only (internal distribution within a faction)
```

**Chassis Families** are not a hierarchy level — they are a **merge rule**.

### Chassis (Primary Unit)

The chassis is the unit of faction identity. All scoring, filtering, comparison, and heat maps work at the chassis level.

**Rationale:** The miniature IS the chassis. Painting decisions, collection planning, and force identity all operate at the chassis level.

### Variant (Detail View)

Clicking a faction + chassis cell shows variant breakdown as internal distribution percentages. Variants are a composition detail, not a faction identity signal.

#### Variant Weight Resolution

When a faction has an explicit chassis weight but no variant override, variant weight is inherited from the parent faction and scaled:

```
effective_variant_weight = inherited_variant_weight × (faction_chassis_weight / parent_chassis_weight)
```

### Chassis Families (Merge Rule)

Some chassis are closely related (Dragon/Grand Dragon, Atlas/Atlas II). When family grouping is enabled (default), member chassis weights are summed and scored as a single entry.

Configuration in `config/chassis-families.json`. Auto-detected from naming patterns, user-editable. A chassis can belong to at most one family.

---

## Era & Year Selection

### Target Year
Enter a specific year (e.g., 3052). The tool selects the most recent MegaMek era at or before that year and filters out chassis/variants introduced after the target year (using MUL introduction dates).

### Intro Date Resolution

| Era Availability | Intro Date | Resolution |
|---|---|---|
| ✅ Present | ✅ Present | Full precision — era data filtered by intro year |
| ✅ Present | ❌ Missing | Permissive — available for full era |
| ❌ Missing | ✅ Present | Derive — available from intro date forward |
| ❌ Missing | ❌ Missing | Excluded from era/year queries |

---

## Query Language

Queries are field expressions joined by implicit `AND`. `OR` supported within fields.

### Fields

| Field | Type | Description | Examples |
|-------|------|-------------|----------|
| `faction` | text (multi) | Factions in scope | `faction=DC`, `faction=GreatHouses` |
| `chassis` | text (multi) | Specific chassis | `chassis=Dragon` |
| `class` | enum | Weight class | `class=Assault` |
| `spread` | numeric | Spread filter/sort | `spread>3` |
| `span` | numeric | Span filter/sort | `span<4` |
| `avg-pref` | numeric | Avg preference filter/sort | `avg-pref<6` |
| `weight` | numeric | Raw weight filter/sort | `weight>5` |
| `sig` | numeric | Global signature filter/sort | `sig>8` |
| `tons` | numeric | Tonnage filter/sort | `tons>50` |
| `DC-pref` | numeric | Faction-specific pref filter/sort | `DC-pref>8` |
| `DC-sig` | numeric | Faction-specific sig filter/sort | `DC-sig>7` |
| `sort` | keyword | Sort specification | `sort by DC sig desc` |
| `year` | numeric | Target year | `year=3039` |
| `era` | text | Era name | `era=ClanInvasion` |
| `family` | toggle | Family grouping | `family=on` |
| `industrial` | toggle | IndustrialMech visibility | `industrial=hide` |
| `mode` | enum | Data mode | `mode=A` |

All string matching is case-insensitive with partial match support. Faction codes (DC, FS, CJF), full names, and aliases all work.

### Shortcuts

| Shortcut | Expands to |
|----------|-----------|
| `faction=GreatHouses` | DC, FS, FWL, LA, CC |
| `faction=Clans` | All Clan factions |
| `faction=Periphery` | All periphery factions |

### Sort Syntax

- `sort by spread desc` — sort by spread, descending
- `sort by DC sig desc` — sort by DC's signature score, descending
- `sort by DC preference desc` — sort by DC's scoped preference, descending
- `sort by DC-sig desc` — alternate syntax (hyphenated)
- `sort by tons asc` — sort by tonnage, ascending
- Multi-sort: `sort by DC sig desc, tons asc`

### Example Queries

| Query | What it answers |
|-------|----------------|
| `faction=DC,FS year=3039 sort by DC sig desc` | DC's most iconic mechs (compared against FS) |
| `faction=GreatHouses year=3039 spread>3 sort by spread desc` | Most faction-defining mechs across the Great Houses |
| `faction=DC year=3039 sort by sig desc` | DC's full identity ranking |
| `faction=GreatHouses chassis=Griffin` | How each Great House uses the Griffin |
| `faction=DC,FS year=3039 sig>8` | Only the top-tier identity mechs for DC and FS |
| `faction=GreatHouses tons>75 sort by DC-pref desc` | Heavy/assault mechs DC prefers most vs other houses |

### View Routing

| Query Shape | View | Default Sort |
|-------------|------|-------------|
| `faction=` (single, no sort/sig) | Single Faction Roster | Raw weight desc |
| `faction=` (single, with sort or sig) | Faction Comparison | User-specified sort |
| `faction=` (multiple) | Faction Comparison (heat map) | Spread desc |
| `chassis=` (no faction) | Mech View | Raw weight desc |
| Both faction + chassis | Faction Comparison (filtered) | Spread desc |
| Neither | Landing page with examples | — |

---

## Display

### Faction Comparison View (Heat Map)

The primary view for multi-faction queries. Table with:
- **Rows:** Chassis (one per row)
- **Columns:** One per scoped faction, plus stat columns

Each faction cell shows three values:
```
10.0      ← Scoped Preference (primary, heat-colored)
s:8.6     ← Global Signature (accent color)
w:8       ← Raw Weight (dim)
```

Heat map coloring is based on scoped preference (1 = cool, 10 = hot).

Dedicated sig columns (one per faction) also appear after the faction cells for sortability.

Stat columns: Spread, Span, Avg Pref.

### Single Faction Roster View

For single-faction queries without explicit sort/sig. Simpler table:
- Chassis, Tons, Class, Weight, Usage bar

### Variant Drill-Down

Click any faction cell to see the variant breakdown overlay.

---

## Technical Architecture

### Data Pipeline

```
[MegaMek XMLs] → ingest-megamek.mjs → megamek-data.json (resolved inheritance)
                                              ↓
[MUL API]      → ingest-mul.mjs     → mul-availability.json
  (per-faction + IS/CLAN/PERI general)        ↓
                                       combine.mjs → app-data.json
```

MUL ingestion pulls per-faction data AND the three general pools (IS General, Clan General, Periphery General). The combine step uses general pools as fallback for MUL confirmation.

### app-data.json Structure

```
{
  _meta: { generated, description },
  factions: { code: { name, clan, periphery, minor } },
  factionGroups: { GreatHouses: [...], Clans: [...], Periphery: [...] },
  eras: [{ year, label, mulEra }],
  families: [{ groupName, chassis, enabled }],
  modelPrefixes: { prefix: chassisName },
  chassis: { name: { tons, class, intro, industrial, tech } },
  eraData: {
    year: {
      chassisName: {
        w: { factionCode: weight },     // raw weights
        v: { variantName: { factionCode: weight } },  // variant weights
        mul: { factionCode: 1 },         // MUL confirmation flags
        fam: "familyGroupName"           // if part of a family
      }
    }
  }
}
```

### Scoring Computation

**Precomputed (in app-data.json):**
- Resolved weights per faction per chassis per era
- MUL confirmation flags
- Chassis and faction metadata

**Computed at runtime (in the UI):**
- Scoped preference — recalculated on every scope change
- Global signature — computed from all-era-faction context
- Spread, span, avg-pref — derived from scoped preference

### UI Technology

Vanilla HTML/CSS/JS. No framework. Single-page app loading `app-data.json` at startup. Dark theme. GitHub Pages hosted.

### Known Architecture Debt

**Multiple code paths:** The codebase currently has two query processing pipelines (`executeQuery` — unused dead code, and `runQuery` — the actual entry point) and three sort function implementations. These should be consolidated to a single pipeline with a single sort function. See PROGRESS.md for refactoring plan.

---

## Resolved Design Decisions

1. **Scoped Preference normalization:** Linear min-to-max mapping across scoped factions' weights. 1 = lowest, 10 = highest. Zeros included.
2. **Global Signature formula:** Geometric mean of global preference and weight-normalized. Both 1–10 scale.
3. **Signature is global, not scoped.** Normalizes against all factions in the era, not just the user's current scope. This makes it a stable faction identity metric.
4. **Two metrics, not one.** Scoped preference and global signature answer different questions (mech→faction vs faction→mech). Neither replaces the other.
5. **Filter/sort parity.** Every numeric field that can be filtered can also be sorted, and vice versa. This is a design invariant.
6. **Spread:** Derived (max scoped preference − min scoped preference). No separate normalization.
7. **Merc factions:** Included as normal factions. Users can exclude with `faction!=Mercs`.
8. **Chassis families on by default.** Stronger faction identity signal.
9. **Mode B default.** MUL-confirmed availability is the safer, canon-filtered default.
10. **MUL general pools as fallback.** The IS/CLAN/PERI general pools supplement per-faction MUL data to prevent false negatives (e.g., Griffin missing from DC's MUL listing).

---

## Future Possibilities

- **Code consolidation:** Merge dead `executeQuery` path into `runQuery`. Consolidate sort functions.
- **Collection tracker:** Mark owned minis, recommend next purchases by faction identity gaps.
- **Force builder integration:** "Build me a 10,000 BV Davion force that maximizes faction identity score."
- **Vehicles & aerospace:** Same data sources support non-mech unit types.
- **Community sharing:** Export/import faction palettes and chassis family configs.
- **Structured form UI:** Dropdowns and sliders layered on top of the query bar, reading/writing the same query syntax.
