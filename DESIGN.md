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
- **Faction inheritance:** Child factions (e.g., DC, FS, LC) inherit from parent factions (e.g., IS) when no explicit entry exists. Must be resolved at parse time.
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

### Two Display Values

The tool shows two complementary values for each faction+chassis cell: raw weight and global signature.

#### Raw Weight — The Usage Signal

**Question:** "How heavily does this faction field this mech?"

**Values:** Integer 1–10 (from MegaMek force generator data). Higher = more common in that faction's forces.

**This is the primary display value in faction cells.** It drives heat map coloring. Weight 1 = coolest, weight 10 = hottest. No normalization — the raw MegaMek weight is the value shown.

**Comparison is direct.** "Griffin — DC or FS?" → DC:6, FS:3. No normalization artifacts, no scope-dependent instability.

#### Global Signature — The Identity Checklist

**Question:** "Given this faction, which mechs define it?"

**Direction:** Faction → Mech

**Use case:** "I'm building a DC force — what should I buy?" Sort by DC signature to get the faction's most totemic mechs.

**Formula:** `raw_sig = weight × max(0, z-score)`

Where:
- **weight** = the faction's raw MegaMek weight for this chassis (1–10).
- **z-score** = `(weight - mean) / stddev` across ALL factions in the era (non-fielding factions counted as 0). This measures how much this faction's usage stands out from the crowd, including the "crowd" of factions that don't field it at all.

**Why z-score works:** MegaMek weights are relative probabilities within each faction's generation table — they're not comparable across factions by simple summation. But comparing ranks and statistical position IS valid. The z-score measures "how unusual is this faction's weight for this chassis compared to everyone else."

**Why include zeros:** Non-fielding factions are counted as weight 0. This makes exclusivity emerge naturally — a mech only one faction fields has ~39 zeros pulling the mean down, so that faction's z-score is enormous. No separate scarcity factor needed.

The product `weight × z` captures both signals: high weight (the faction fields it a lot) AND high z (the faction stands out from the crowd). A DC-exclusive mech at weight 6 scores high because z ≈ 6. A ubiquitous mech at weight 6 scores low because z ≈ 1.

**Display: Tier 1–5 (Jenks Natural Breaks).** The raw `weight × z-score` values are classified into 5 tiers using the Jenks Natural Breaks algorithm, which finds breakpoints that minimize within-tier variance and maximize between-tier variance:
- **Tier 1** — Faction-defining. The totemic mechs.
- **Tier 2** — Strong identity markers.
- **Tier 3** — Moderate association.
- **Tier 4** — Weak association.
- **Tier 5** — Incidental. The faction has access but it's not "theirs."

Unlike fixed quintiles (20% each), Jenks finds the natural gaps in the data. A faction with 3 clearly iconic mechs and a gradual tail gets 3 in T1, not an arbitrary 20% slice. The underlying raw value is still used for sorting and filtering.

**Global signature is stable regardless of scope.** Adding or removing factions from the query doesn't change any faction's signature scores. It's a global property of the faction's relationship to that chassis.

**Why weight × share and not normalized scores:**
Earlier iterations used `√(globalPref_normalized × weight_normalized)`, where both factors were min-max normalized to 1–10. This caused two problems:
1. **Weight normalization inflated small differences.** A faction with weight range 5–8 mapped weight 5 to 1.0 and weight 8 to 10.0 — a 3-point raw difference became a 9-point normalized gap.
2. **Preference normalization inflated distinctiveness.** Zeros from Clan factions (who'd never field an IS mech) inflated every IS mech's "distinctiveness" score.

Raw `weight × share` avoids both problems. It stays in meaningful units (weight) and doesn't amplify noise.

**Expected results — DC in 3039:**

| Chassis | DC Weight | z-score | W×z | Tier | Why |
|---------|----------|---------|-----|------|-----|
| Hatamoto-Chi | 6 | ~5.9 | ~35.5 | 1 | DC-exclusive, massive z |
| Dragon | 8 | ~4.6 | ~36.7 | 1 | Near-exclusive, high weight |
| Zeus | (0) | — | — | — | Not fielded by DC |
| Victor | 5 | ~1.0 | ~5.0 | 3–4 | Everyone has it, DC isn't special |
| Griffin | 6 | ~1.3 | ~7.6 | 2–3 | Common IS mech, slightly above average |
| Locust | 6 | ~0.8 | ~5.0 | 3–4 | Ubiquitous, DC doesn't stand out |

#### When to Use Which

| Situation | Use | Why |
|-----------|-----|-----|
| "Who should I paint this Griffin for?" | Raw Weight | Direct comparison: DC:6 vs FS:3 |
| "What's the most DC mech I don't own yet?" | Global Signature | DC's identity ranked by importance |
| "What makes DC different from FS?" | Spread (weight) | High spread = one faction uses it much more |
| "What are DC's top 10 identity mechs?" | Global Signature | Stable ranking, doesn't depend on scope |

### Derived Filter/Sort Values

All of these work as both filters (`field>value`) and sort targets (`sort by field desc`).

| Field | Description | Example |
|-------|-------------|---------|
| **spread** | Max scoped pref − min scoped pref across scoped factions. High = factions disagree = interesting. | `spread>3` |
| **span** | How many scoped factions field this chassis. | `span<4` |
| **avg-pref** | Mean scoped preference across scoped factions that field the chassis. | `avg-pref<6` |
| **weight** | Raw MegaMek weight. Not normalized. | `weight>5` |
| **tons** | Chassis tonnage. | `tons>50`, `tons=75` |
| **sig** | Global signature raw score (weight × share). Max across scoped factions. | `sig>3` |
| **sig-tier** | Signature tier (1=most iconic, 5=incidental). | `sig-tier<3` |
| **DC-pref** | Faction-specific scoped preference. | `DC-pref>8` |
| **DC-sig** | Faction-specific global signature raw score. | `DC-sig>3` |
| **bv** | Battle Value range filter (variant-level). | `bv>1000`, `bv<1500` |

**All fields that can be filtered can also be sorted, and vice versa.** This is a design invariant.

#### Workhorse Filtering

"Workhorses" are mechs where scoped factions all use them at similar rates (Marauder, Archer, Warhammer, etc.).

Min-to-max normalization amplifies tiny differences: Marauder at DC:4, FS:4, LC:4, CC:4, FWL:3 maps to DC preference 10 — technically correct but meaningless.

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

## Variant Metadata

Each variant in the MUL cache carries per-variant metadata: **BattleValue** and **DateIntroduced**. These are propagated into `app-data.json` alongside variant weights.

### Variant-Level Fields in app-data.json

The `v` (variant) object within each era+chassis entry is extended from weight-only to include metadata:

```
"DRG-1N": {
  "w": { "DC": 8, "FRR": 8, "MERC": 8 },   // weights per faction (existing)
  "bv": 1125,                                 // Battle Value (from MUL)
  "intro": 2754                                // Introduction year (from MUL)
}
```

If a variant has no MUL match, `bv` and `intro` are null/omitted.

### BV Filtering

**BV is a variant-level field.** A chassis passes a `bv` filter if **any** of its in-scope variants qualify. "In scope" means:
1. The variant has weight > 0 for at least one scoped faction
2. The variant is MUL-confirmed for that faction (in Mode B)
3. The variant's intro year ≤ the target year (if year filtering is active)
4. The variant's BV falls within the filter range

**`bv>1000`** — chassis passes if any scoped variant has BV > 1000.
**`bv<1500`** — chassis passes if any scoped variant has BV < 1500.
**`bv>1000 bv<1500`** — chassis passes if any single scoped variant has BV in (1000, 1500).

### BV Display

- **Chassis row:** Shows BV range (min–max) of the chassis's in-scope variants. E.g., "1125–1567".
- **Variant drill-down:** Shows BV per variant alongside the weight distribution.

### BV Sorting

`sort by bv asc` sorts by the **minimum** in-scope variant BV (useful for "cheapest mechs first").
`sort by bv desc` sorts by the **maximum** in-scope variant BV (useful for "biggest hitters first").

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
| `sig` | numeric | Global signature raw score (weight × share) | `sig>3` |
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
| `faction=GreatHouses` | DC, FS, FWL, LC, CC |
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
| `faction=DC year=3039 bv>1000 bv<1500 sort by bv asc` | DC mechs in the 1000–1500 BV sweet spot, cheapest first |
| `faction=GreatHouses bv<900 sort by sig desc` | Budget BV mechs with the most faction identity |

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
        v: { variantName: { w: { factionCode: weight }, bv: number|null, intro: number|null } },  // variant data
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
2. **Global Signature formula:** `weight × share` (faction weight × faction's share of total MUL-confirmed weight). Raw score in weight units. Displayed as quintile tiers 1–5.
3. **Signature is global, not scoped.** Normalizes against all factions in the era, not just the user's current scope. This makes it a stable faction identity metric.
4. **Two metrics, not one.** Scoped preference and global signature answer different questions (mech→faction vs faction→mech). Neither replaces the other.
5. **Filter/sort parity.** Every numeric field that can be filtered can also be sorted, and vice versa. This is a design invariant.
6. **Spread:** Derived (max scoped preference − min scoped preference). No separate normalization.
7. **Merc factions:** Included as normal factions. Users can exclude with `faction!=Mercs`.
8. **Chassis families on by default.** Stronger faction identity signal.
9. **Mode B default.** MUL-confirmed availability is the safer, canon-filtered default.
10. **MUL general pools as fallback.** The IS/CLAN/PERI general pools supplement per-faction MUL data to prevent false negatives (e.g., Griffin missing from DC's MUL listing).
11. **LC is the canonical Lyran code.** MegaMek uses LA (Lyran Alliance) internally; we remap to LC (Lyran Commonwealth) in the output. The Commonwealth is the default/historical faction name spanning most of the timeline. `LA`, `LC`, `lyran`, `steiner` all resolve to `LC`.

---

## Quick Filter Insert

A secondary input field below the query bar and filter chips for composing one filter expression at a time, then inserting it into the main query.

**Rationale:** The main query bar gets long and dense. This lets users experiment with adding a filter without editing in the middle of a complex query string.

**UI elements:**
- Text input with placeholder: `Add filter (e.g. spread>3, tons>50)`
- ✕ button (clear the field)
- ➕ button (insert into current query)
- Same autocomplete/suggestion system as the main query bar

**Behavior:**
- On insert (click ➕ or press Enter): append the field's text to the main query bar (space-separated), run the query, then blank the insert field.
- On clear (click ✕): blank the field, no query change.
- Autocomplete reuses `getSuggestions()` — no duplicate logic.

**Location in DOM:** Below `#query-bar`, above `#filter-chips`.

---

## Column Visibility

A hamburger menu (☰) attached to the results table that lets users show/hide columns.

**Trigger:** ☰ button in the view title bar area, appears when a table is rendered.

**Panel:** Dropdown/popover with checkboxes for every column in the current table, grouped:
- **Chassis** — always visible (row identifier, cannot be hidden)
- **Metadata** — Tons
- **Faction Preference** — one per scoped faction
- **Faction Signature** — one per scoped faction sig column
- **Stats** — Spread, Span, Avg Pref

**Behavior:**
- Hidden columns get `display:none` on `<th>` and corresponding `<td>` cells. Data stays in DOM.
- Sorting via query bar is unrestricted regardless of column visibility. Clickable header sort only works on visible columns (because the header isn't rendered).
- Filtering always works on all data regardless of visibility.
- Column list rebuilds on each query execution (columns are dynamic based on scoped factions).
- State persisted in `localStorage` (keyed by column name, global across queries).
- Panel dismisses on click-outside or clicking ☰ again.

---

## Future Possibilities

- **Faction lineage / succession model:** Many factions merge, splinter, rename, or absorb others across eras. Current approach patches this case-by-case (e.g. LA/LC MUL merge → canonical LC). Needs a proper lineage map that understands rename (LC↔LA), merger (FS+LC→FC), splintering (FRR from DC), conquest-then-absorption (FRR→CGB occupation→RD), brief existence (WOB, ROS, SIC), etc. Scoring implications differ: a rename shares the same force pool, a merger combines two, a splinter starts fresh-ish. Key example: FRR goes DC→FRR→CGB/FRR→RD, with mech roster evolving at each transition.
- **Code consolidation:** Merge dead `executeQuery` path into `runQuery`. Consolidate sort functions.
- **Collection tracker:** Mark owned minis, recommend next purchases by faction identity gaps.
- **Force builder integration:** "Build me a 10,000 BV Davion force that maximizes faction identity score."
- **User-Defined Value Functions / Lance Builder Preferences:** A weighted scoring layer for lance composition that goes beyond raw signature. Users could define faction-flavored preferences:
  - **Tonnage bias** — e.g., "Steiners run heavy" → penalize lights, reward assaults. Could be auto-derived from faction tonnage distribution in MegaMek weights.
  - **Role mix** — e.g., "Davions want combined arms" → reward role diversity within a lance. MUL provides Alpha Strike `Role` per variant.
  - **Range profile** — e.g., "Kurita likes close-in" → weight by weapon range band. MUL Alpha Strike fields: `BFDamageShort`, `BFDamageMedium`, `BFDamageLong`.
  - **Armor density** — BV/ton as a crude proxy for "thick." MUL has `BFArmor` and `BFStructure`.
  - **Custom weights** — user dials knobs: `lance_score = Σ(mech) [ w1×signature + w2×tonnage_pref + w3×role_fit + w4×range_fit + ... ]`
  - Some preferences derivable from existing data (tonnage distribution, role distribution per faction). Others need new data pulled from MUL Alpha Strike stats (already in cache but not yet in app-data.json).
  - Natural extension of the lance builder / force builder concept.
- **Vehicles & aerospace:** Same data sources support non-mech unit types.
- **Community sharing:** Export/import faction palettes and chassis family configs.
- **Structured form UI:** Dropdowns and sliders layered on top of the query bar, reading/writing the same query syntax.
