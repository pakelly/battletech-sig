# BattleTech Faction Signatures — Design Document

**v1.2.0 — 2026-05-14** (added versioning, Biased Weight column)

_Previous: v1.1 — 2026-05-13 (Unit Quality Rating)_

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

**Values:** 0–10 scale (derived from MegaMek force generator data). Higher = more common in that faction's forces.

**This is the primary display value in faction cells.** It drives heat map coloring. Weight 1 = coolest, weight 10 = hottest.

**Computation:** The displayed weight incorporates three adjustments from MegaMek source data:
1. **Unit quality rating** — `+`/`-` modifiers expand to per-tier values; default is cross-tier average
2. **Logarithmic conversion** — math is done in probability space (`2^(n/2)`)
3. **Weight class distribution** — faction's tonnage bias adjusts the probability, then converts back to the 1–10 scale

The result may be fractional (e.g., 5.3). Values are still on the MegaMek 1–10 log scale, preserving the source's intended semantics.

**Comparison is direct.** "Griffin — DC or FS?" → DC:6.2, FS:3.1. No normalization artifacts, no scope-dependent instability.

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

## Unit Quality Rating

### Background

MegaMek's force generator encodes a **unit quality dimension** that we previously discarded. The availability strings use three formats to express how a chassis's prevalence varies by equipment rating (unit quality tier):

- **`DC:8+`** — The stated weight applies to the highest equipment rating (A / Keshik). It decreases by 1 per tier down. `DC:8+` with 5 IS tiers (A/B/C/D/F) → A:8, B:7, C:6, D:5, F:4.
- **`DC:8-`** — The stated weight applies to the lowest equipment rating (F / PGC). It decreases by 1 per tier up. `DC:8-` → F:8, D:7, C:6, B:5, A:4.
- **`CGB!Keshik:4!Front Line:3!Second Line:1!Solahma:1`** — Explicit weight per named rating level. No interpolation.
- **`DC:8`** (no modifier) — Flat across all tiers. Every rating level gets 8.

This data is sourced directly from MegaMek's `AvailabilityRating.java`. The `+`/`-` modifiers use `adjustForRating(equipRating, numLevels)`:
- `+`: `availability - (numLevels - 1 - equipRating)` (drops for lower ratings)
- `-`: `availability - equipRating` (drops for higher ratings)

Negative results are clamped to 0 (effectively extinct at that tier).

**Rating level systems vary by faction type:**
- **Inner Sphere:** A, B, C, D, F (5 levels, index 4=A down to 0=F)
- **Clans:** Keshik, Front Line, Second Line, Solahma, PGC (5 levels, index 4=Keshik down to 0=PGC)

### MegaMek's Logarithmic Scale

MegaMek's availability ratings are on a **base-2 logarithmic scale**, not linear. The conversion from rating to probability weight is:

```
probability_weight = 2^(rating / 2)
```

| Rating | Probability Weight | MegaMek Label |
|:------:|:-----------------:|:-------------|
| 0      | 1.0               | Extinct       |
| 1–2    | 1.4–2.0           | Very Rare     |
| 3–4    | 2.8–4.0           | Rare          |
| 5–6    | 5.7–8.0           | Uncommon      |
| 7–8    | 11.3–16.0         | Common        |
| 9–10   | 22.6–32.0         | Ubiquitous    |

A weight-8 chassis is **8× more likely** to appear than a weight-2 chassis, not 4×. This has implications for how we interpret and display raw weights. (See "Rarity Labels" below.)

**Current approach:** We display the raw integer ratings (1–10) directly. This is faithful to the source data and keeps values intuitive. The logarithmic relationship is inherent in the MegaMek data and doesn't need to be applied — users comparing "DC:8 vs FS:3" are already comparing on the log scale that MegaMek's authors intended.

### Default Behavior (No Rating Filter)

When no `rating=` filter is set, weights are the **mean across all rating levels**, clamping negatives to 0 before averaging.

Examples with 5 IS tiers:
- `DC:8` (flat) → (8+8+8+8+8)/5 = **8.0**
- `DC:8+` → (8+7+6+5+4)/5 = **6.0**
- `DC:8-` → (4+5+6+7+8)/5 = **6.0**
- `FS:2+` → (2+1+0+0+0)/5 = **0.6**

This means:
- **Broadly-fielded mechs** (no modifier) retain their full weight — they define the faction at every quality level.
- **Elite-skewed** (`+`) and **garrison-skewed** (`-`) mechs are discounted — they define a slice of the faction, not the whole.
- **Low-weight `+` mechs** (like `FS:2+`) become near-zero — most of the faction literally never sees them.

This changes the default identity picture from "what does the faction's best look like?" to "what does the faction look like overall?" — a better default for painting decisions.

### Rating Filter

The `rating=` filter selects a specific equipment quality tier. When set, all weights are resolved to that tier's value instead of averaged.

| Filter | IS Tier | Clan Tier |
|--------|---------|-----------|
| `rating=A` | A (index 4) | Keshik |
| `rating=B` | B (index 3) | Front Line |
| `rating=C` | C (index 2) | Second Line |
| `rating=D` | D (index 1) | Solahma |
| `rating=F` | F (index 0) | PGC |

For `!`-format entries (explicit per-level), the filter maps to the named level directly.

**Interaction with scoring:** The rating filter adjusts weights *before* all downstream computation. Scoped preference, global signature, z-scores, Jenks tiers, spread, span — everything recomputes on the adjusted weights. This means `rating=A` and `rating=F` can produce meaningfully different faction identity rankings:
- At `rating=A`, prestige mechs (`+` modifier) retain full weight while garrison mechs (`-`) diminish. Elite identity emerges.
- At `rating=F`, the reverse: garrison/militia identity. The workhorse mechs that define the faction's bottom tier.
- The roster also shrinks at extreme tiers (many mechs go to 0), concentrating identity signal among fewer chassis.

### Rarity Labels

An optional display mode mapping raw weights to MegaMek's official rarity labels (see table above). Applied after rating adjustment. Available as a UI toggle, not a filter — it's a display format, not a data transformation.

### Data Format Changes

#### app-data.json

Chassis weight entries change from flat integers to objects encoding the modifier:

**Before:**
```
w: { DC: 8, FS: 3 }
```

**After:**
```
w: { DC: [8, "+"], FS: [3, 0] }
```

Encoding: `[baseWeight, modifier]` where modifier is `"+"`, `"-"`, or `0` (flat/no modifier).

For `!`-format entries (explicit per-level weights), the encoding is:
```
w: { CGB: { K: 4, FL: 3, SL: 1, Sol: 1 } }
```

Object form = explicit levels. Array form = base + modifier (expandable at runtime).

Variant weights use the same encoding.

#### Runtime Expansion

The UI expands modifiers to per-tier weights at query time using the MegaMek formula:
- `+`: tier weight = `base - (numLevels - 1 - tierIndex)`, clamped ≥ 0
- `-`: tier weight = `base - tierIndex`, clamped ≥ 0
- flat: all tiers = base
- explicit: use stored per-level values directly

---

## Weight Class Distribution

### Background

MegaMek's force generator includes per-faction, per-era **weight class distribution** data — relative weights for Light, Medium, Heavy, and Assault class selection. This data lives in `<faction>` nodes within the era XMLs:

```xml
<faction key='LA'>
    <weightDistribution era='3039' unitType='Mek'>4,6,7,3</weightDistribution>
</faction>
```

The four values are relative weights for **Light, Medium, Heavy, Assault**. Converted to percentages for 3039:

| Faction | Light | Medium | Heavy | Assault | Character |
|---------|:-----:|:------:|:-----:|:-------:|-----------|
| IS (default) | 30% | 40% | 20% | 10% | Baseline |
| LA (Lyran) | 20% | 30% | 35% | 15% | Heavy-skewed |
| DC (Kurita) | 40% | 20% | 30% | 10% | Light+heavy, medium gap |
| FS (Davion) | 31% | 38% | 23% | 8% | Near-baseline |
| CC (Capellan) | 22% | 33% | 33% | 11% | Heavy-leaning |
| CLAN (default) | 22% | 33% | 33% | 11% | Heavy-leaning |

### How MegaMek Uses Weight Class Distribution

**Key insight from MegaMek source code analysis (2026-05-14):** MegaMek does NOT apply weight class distribution as a per-chassis adjustment to availability ratings. Instead, it uses `weightDistribution` as a **table-mixing proportion**.

MegaMek's actual algorithm:
1. **Generate separate tables per weight class** — all medium mechs compete against each other on raw availability ratings. Within a weight class, relative rankings are untouched.
2. **Mix the tables** in the faction's proportions — DC gets 20% medium slots, not 40%.

This means chassis availability ratings are always **relative to other chassis in the same weight class**. A Kintaro with DC rating 2 is "Very Rare compared to other DC mediums" — not "Very Rare compared to all DC mechs." The weight class distribution layer happens at table assembly, not at the rating level.

Source: `RATGenerator.generateTable()` in MegaMek, confirmed by official docs (`rat-generator.txt`): *"The context for the availability is other units of the same general type: a very common assault Mek is more likely than a common one, but may be less common overall than a rare medium Mek."*

### Our Approach: Table-Level Mixing (Not Per-Chassis Adjustment)

**Previous (incorrect) approach:** We applied WCD as a per-chassis multiplier in probability space: `adjusted_prob = raw_prob × (faction_class_pct / baseline_class_pct)`. This distorted individual chassis ratings, especially at low values on the log scale (e.g., crushing a rating-2 DC medium to effectively zero).

**Corrected approach:** WCD is applied as a **display-level mixing weight**, matching MegaMek's table-mixing model:

1. **Raw availability ratings stay untouched.** A chassis's weight reflects its rarity relative to other chassis of the same weight class, exactly as MegaMek intends.
2. **When showing all weight classes together (mixed view):** Each chassis's display weight is multiplied by `faction_wcd[class] / sum(faction_wcd)` — the faction's proportion for that weight class. This replicates MegaMek's table-mixing.
3. **When filtering to a single weight class:** WCD mixing is skipped for **raw weight display** — you're looking at pure within-class competition, same as generating a weight-class-specific table in MegaMek.
4. **Signature computation always uses WCD mixing**, regardless of class filter. Sig answers "how much does this mech belong to this faction?" — that includes weight class preferences. A heavy mech in a Lyran force is more likely to appear on the battlefield than in a FedSuns force because Lyrans roll on their heavy table more often. Without WCD, a chassis with identical raw weight across all factions gets identical sig scores, losing the faction identity signal from weight class bias.

**Example — DC mediums in mixed view (3039):**
- DC weight distribution: `[4,2,3,1]` → medium share = 2/10 = 20%
- A DC medium with raw weight 2 displays as: `2^(2/2) × 0.20` in probability space
- A DC heavy with raw weight 2 displays as: `2^(2/2) × 0.30` in probability space
- The heavy gets more weight because DC fields more heavies — but the raw ratings are preserved.

### Inheritance

Factions without explicit `weightDistribution` data inherit from their parent faction. The IS default (`3,4,2,1`) serves as the Inner Sphere baseline. The CLAN default serves as the Clan baseline.

### Data Format

Weight class distributions are stored in app-data.json at the faction level:

```
factions: {
  DC: { name: "Draconis Combine", ..., wcd: { "3039": [4,2,3,1], "3049": [3,3,3,1] } },
  ...
}
```

`wcd` = weight class distribution, keyed by era year. Array is `[Light, Medium, Heavy, Assault]`.

---

## Logarithmic Weight Computation

### The Problem

MegaMek's 1-10 availability ratings are on a **logarithmic scale**: each +2 rating doubles the probability. Treating them as linear values distorts comparisons — a weight-8 chassis isn't "4× more likely" than weight-2, it's **8× more likely**.

The conversion formula (from MegaMek's `AvailabilityRating.calcWeight`):

```
probability_weight = 2^(rating / 2)
```

| Rating | Probability Weight |
|:------:|:-----------------:|
| 1 | 1.4 |
| 2 | 2.0 |
| 3 | 2.8 |
| 4 | 4.0 |
| 5 | 5.7 |
| 6 | 8.0 |
| 7 | 11.3 |
| 8 | 16.0 |
| 9 | 22.6 |
| 10 | 32.0 |

### Where It's Applied

All mathematical operations on weights must happen in probability space:

1. **Rating → probability**: `2^(rating/2)` before any multiplication or averaging
2. **Apply weight class adjustment**: multiply probability weights by distribution factor
3. **Compute signature z-scores**: on probability weights, not raw ratings
4. **Display**: convert back to a 1-10 scale via `2 × log2(probability_weight)` for the raw weight display, or use the probability weight directly for scoring

### Impact on Existing Computations

- **Global Signature (weight × z-score)**: z-scores should be computed on probability weights. This makes the spread between exclusive and ubiquitous mechs more dramatic — matching reality.
- **Scoped preference, spread, span**: Operate on the adjusted probability-space values.
- **Cross-tier averaging**: Average in probability space, then convert back. `avg_prob = mean(2^(r_i/2))` then `display = 2 × log2(avg_prob)`.

### Rarity Labels (Display Option)

Mapping from the final adjusted weight to MegaMek's official rarity labels:

| Rating | Label |
|:------:|:------|
| 0 | Extinct |
| 1–2 | Very Rare |
| 3–4 | Rare |
| 5–6 | Uncommon |
| 7–8 | Common |
| 9–10 | Ubiquitous |

These are applied after all adjustments (quality rating + weight class) and can be shown as an optional display layer alongside the numeric values.

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

All text fields support the `=` and `!=` operators. Multi-value OR is supported via `field=(A OR B)` or repeated field expressions. The `!=` operator excludes matching entries.

| Field | Type | Description | Examples |
|-------|------|-------------|----------|
| `faction` | text (multi) | Factions in scope | `faction=DC`, `faction=GreatHouses` |
| `chassis` | text (multi) | Specific chassis | `chassis=Dragon`, `chassis!=Locust` |
| `class` | enum (multi) | Weight class | `class=Assault`, `class=(Light OR Medium)`, `class!=Assault` |
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
| `rating` | enum | Unit quality tier (A/B/C/D/F). Adjusts weights before scoring. Omit for cross-tier average. | `rating=A`, `rating=F` |
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
| `faction=DC year=3039 rating=A sort by sig desc` | What defines DC's elite units? |
| `faction=DC year=3039 rating=F sort by sig desc` | What defines DC's garrison/militia? |
| `faction=GreatHouses rating=A spread>3 sort by spread desc` | Mechs where elite roster differs most across Houses |

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

### Chassis Detail Drill-Down

Click any faction cell to open a detail overlay with three sections:

#### 1. Rating Tiers

Shows how the chassis's availability changes across unit quality tiers for this faction.

**For `+` modifier (elite-skewed):**
```
Rating Tiers (Dragon — DC: 8+)
A (Elite)     ████████████████  8
B             ██████████████    7
C             ████████████      6
D             ██████████        5
F (Garrison)  ████████          4
              ─────────────────
Avg (default)                   6.0
```

**For flat entries (no modifier):** Collapsed to a single "All tiers: 6 (flat)" line — no need for 5 identical bars.

**For explicit Clan entries:** Shows named tiers (Keshik, Front Line, Second Line, Solahma, PGC) with per-tier weights.

The "Avg" line shows the cross-tier average used in the default (no `rating=`) view, connecting the detail to what users see in the main table.

#### 2. Weight Class Distribution

Shows how the faction distributes its forces across weight classes in this era, with the current chassis's class highlighted:

```
DC Force Composition (3039)
Light    ████████████████████  40%
Medium   ██████████            20%
Heavy    ███████████████       30%  ← Dragon
Assault  █████                 10%
```

This answers "why is my biased weight what it is?" — a DC medium gets only 20% of the force allocation, dampening its effective roster presence.

#### 3. Variant Breakdown

Existing variant distribution display — per-variant weight as percentage bars, with BV and introduction year metadata. Unchanged from current implementation.

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
  factions: { code: { name, clan, periphery, minor, wcd: { year: [L,M,H,A] } } },
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
- Raw weights per faction per chassis per era (with `+`/`-`/`!` modifier encoding)
- Weight class distribution per faction per era
- MUL confirmation flags
- Chassis and faction metadata (including tonnage → weight class)

**Computed at runtime (in the UI):**
1. **Resolve unit quality** — expand `[base, mod]` per rating filter (or cross-tier average)
2. **Convert to probability space** — `2^(rating/2)` for all weights
3. **Apply WCD mixing** (mixed-class views only) — multiply by `faction_wcd[class] / sum(faction_wcd)`. Skipped when a single weight class is filtered.
4. **Compute signature** — z-scores and `weight × z` on the mixed weights
5. **Convert back for display** — `2 × log2(prob_weight)` → 1-10 scale
6. Spread, span, avg-weight — derived from adjusted weights

### UI Technology

Vanilla HTML/CSS/JS. No framework. Single-page app loading `app-data.json` at startup. Dark theme. GitHub Pages hosted.

### Known Architecture Debt

**`runQuery()` monolith:** The main query function (295 lines) handles parsing, filtering, scoring, signature computation, Jenks breaks, sorting, rendering dispatch, and pagination in a single function. Natural decomposition targets: extract filtering loop, scoring pass, and render dispatch into separate functions.

**Dead code:** `assignTier()` (superseded by `assignTierFromBreaks()`), `renderMechDetail()` (trivial passthrough never called), `toRating()` (unused inverse of `toProb()`). Should be cleaned up.

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
12. **Unit quality default is cross-tier average.** When no `rating=` filter is set, weights are the mean across all equipment rating levels (clamping negatives to 0). This makes broadly-fielded mechs (no `+`/`-` modifier) naturally prominent, while niche elite or garrison mechs are appropriately discounted. Specific tiers available via `rating=A` through `rating=F`.
13. **MegaMek weights are logarithmic.** The 1–10 scale represents `2^(n/2)` probability weight internally. All mathematical operations (averaging, weight class adjustment, z-score computation) happen in probability space. Display values are converted back to the 1–10 scale.
14. **Weight class distribution is table-level mixing, not per-chassis adjustment.** Per-faction, per-era tonnage bias from MegaMek's force generator is applied as a display-level mixing proportion when showing all weight classes together, matching MegaMek's `generateTable()` approach. Within a single weight class view, WCD does not apply to **raw weight display** — chassis compete on raw availability only. However, **signature always uses WCD mixing** even in single-class views, because sig answers "how much does this mech belong to this faction?" which inherently includes weight class preferences. This avoids the log-scale distortion that per-chassis probability multiplication caused (crushing low-rated chassis to zero).
15. **Salvage is excluded.** MegaMek encodes salvage allocation (e.g., DC capturing FedSuns mechs). We deliberately omit this — salvage muddies faction identity rather than defining it. A captured mech isn't "theirs."

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

## Incomplete Chassis Filter

### Background

The dataset includes ~62 chassis with `tons: null` — unknown tonnage. Most are IndustrialMechs (48 confirmed via Sarna), LAMs, or obscure designs that lack complete MUL metadata. Rather than deleting these entries (losing data), they are filtered out by default via a UI toggle.

### Behavior

- **Default:** Incomplete chassis (any chassis where `tons` is `null` in the chassis metadata) are hidden from all views.
- **Toggle:** A "Show incomplete chassis" checkbox on the Settings panel lets users opt in to seeing them.
- **Persistence:** Toggle state is saved in `localStorage` (key: `bt-sig-show-incomplete`).
- **Interaction with other filters:** The incomplete filter runs early in the render loop, before tonnage/class/industrial filters. If a chassis has no tonnage, it can't meaningfully participate in tonnage filters anyway.

### Rationale

This is strictly better than deletion:
- Data is preserved for future enrichment (someone could add tonnage later)
- No destructive changes to the dataset
- Users who want to explore industrial/exotic mechs can opt in
- The default experience is cleaner — only chassis with complete data appear

---

## User Documentation (Help Panel)

### Trigger

A `?` button in the header bar (next to the ⚙ Settings button). Opens a full-screen overlay similar to the Settings panel.

### Content Structure

The help panel has two distinct sections, each serving a different reader:

#### Section 1: Overview & Quick Start — "What is this?"

For first-time visitors or anyone who wants the big picture before diving in. Written conversationally, not as reference material.

**What this app does:**
This tool explores faction identity in BattleTech through mech usage data. It answers questions like: "What mechs define the Draconis Combine?" or "Who should I paint this Griffin for?" It does this by analyzing how heavily each faction fields each chassis compared to everyone else.

**How it works (the 30-second version):**
- Data comes from two sources: MegaMek's force generator (community-curated mech availability tables) and the official Master Unit List (canon confirmation).
- Each faction has a weight (1–10) for each chassis — how likely they are to field it. Higher = more common in that faction's forces.
- **Signature** measures how much a mech *belongs* to a faction. It combines usage (do they field it a lot?) with distinctiveness (does anyone else?). A mech only one faction uses scores very high. A mech everyone uses scores low.
- Signature tiers (T1–T5) group mechs by natural breaks in the data. T1 = the faction's totemic mechs.

**Key assumptions:**
- **MegaMek data is the primary source.** It's community-curated and richer than the official MUL, but may include reasonable extrapolations beyond strict canon.
- **Mode B (default) filters by canon.** If the MUL says a faction doesn't have a chassis in that era, it's excluded. Mode A shows everything MegaMek has.
- **Weight class distribution matters.** Factions that invest heavily in heavies get more sig credit for their heavy mechs. A Lyran Atlas counts more than a Lyran Locust in the identity ranking.
- **Unit quality is averaged by default.** Some mechs are elite-only (rating A) or garrison-only (rating F). The default view averages across all tiers. Use `rating=A` or `rating=F` to focus on a specific tier.
- **Signature is global and stable.** Adding or removing factions from your query doesn't change any faction's signature scores. It's a property of the faction's relationship to the chassis across the entire universe.

**Quick start — try these:**
_(Same example queries as the landing page, with one-line explanations of what each one shows)_

---

#### Section 2: Reference — "Tell me everything"

The detailed lookup for specific filters, columns, and settings. Organized by what the user is looking at or trying to do.

##### Columns — "What am I looking at?"

| Column | Appears When | Description |
|--------|-------------|-------------|
| **Chassis** | Always | Mech name (or family name if family merging is on). Click to see variant breakdown. |
| **Tons** | Always | Chassis tonnage with weight class badge (L/M/H/A). |
| **BV** | When BV data exists | Battle Value range across in-scope variants (min–max). |
| **[Faction] Sig** | Multi-faction queries | Signature tier (T1–T5) and raw score. T1 = faction-defining. Higher raw score = stronger association. See "How signature is computed" below. |
| **[Faction]** | Multi-faction queries | Raw MegaMek weight (1–10 logarithmic scale). Heat-colored: warm = high usage, cool = low. This is the faction's availability rating for the chassis — how likely they are to field it relative to other chassis in the same weight class. Each +2 on this scale doubles the probability of appearing in a force. |
| **[Faction] BW** | Multi-faction queries | Biased Weight — the chassis's effective probability of appearing in a faction's full roster. Formula: `2^(rating/2) × classShare`, where `classShare` is the faction's weight class distribution proportion for this chassis's weight class (e.g., Lyran Heavy share = 0.35, DC Assault share = 0.10). When filtering to a single weight class, BW is just `2^(rating/2)` (no class mixing). Hidden by default (☰ menu). |
| **Spread** | Multi-faction queries | Difference between highest and lowest raw weight across scoped factions. High spread = factions disagree about this mech = interesting. Hidden by default. |
| **Weight** | Single-faction view | Raw availability weight with usage bar. |

**Signature tiers explained:**
- **T1** — Faction-defining. The totemic mechs. If you're painting one faction, start here.
- **T2** — Strong identity markers. Clearly associated with the faction.
- **T3** — Moderate association. The faction fields it, and more than average.
- **T4** — Weak association. Present but not distinctive.
- **T5** — Incidental. The faction has access but it's not "theirs."

Tiers are assigned using Jenks Natural Breaks — a statistical method that finds natural gaps in the data rather than arbitrary cutoffs. Tiers are computed globally across all displayed factions, so T1 means the same thing regardless of which faction column you're reading.

**How signature is computed:**

```
effective_weight = rating × classShare    (always, all views)

z = (effective_weight - mean) / stddev    (across ALL factions, non-fielding = 0)

signature = effective_weight × max(0, z)
```

The z-score measures how unusual this faction's usage is. Non-fielding factions count as 0 in the mean/stddev calculation, so a mech that only one faction fields produces a very high z-score (everyone else pulls the mean down). The product of weight × z captures both signals: the faction uses it a lot AND they stand out from the crowd. Negative z-scores (below-average usage) are clamped to 0 — if a faction uses a mech less than average, it contributes nothing to their identity.

Weight class distribution (classShare) is always applied before the z-score calculation, even in single-class views. This means a faction's tonnage preferences always shape their identity — Lyran heavies get boosted, Lyran lights get dampened, reflecting how the faction actually builds its forces. (Raw weight display still skips WCD in single-class views, since within-class competition is the right lens for availability comparison.)

**Heat map coloring:** Faction weight cells are colored on a cool-to-warm scale based on the raw weight value. Weight 1 = coolest, weight 10 = hottest. This is independent of signature — a cell can be warm (high usage) but low signature (everyone else uses it too).

##### Query Language — "What can I type?"

**Filters** narrow which chassis appear:

| Filter | Example | What it does |
|--------|---------|-------------|
| `faction=` | `faction=DC`, `faction=GreatHouses` | Which factions to compare. Accepts codes (DC, FS), full names (Draconis Combine), or groups (GreatHouses, Clans, InnerSphere, ISClans, HomeClans, Periphery, InvasionClans). |
| `chassis=` | `chassis=Dragon`, `chassis!=Locust` | Show or exclude specific chassis. Partial match and model prefixes (DRG, AWS) work. |
| `class=` | `class=Assault`, `class=(Light OR Medium)` | Filter by weight class. |
| `tons` | `tons>50`, `tons=75` | Filter by tonnage. |
| `bv` | `bv>1000 bv<1500` | Filter by Battle Value. Multiple conditions narrow the range. |
| `spread` | `spread>3` | Only chassis where factions disagree by more than this. |
| `sig` | `sig>5` | Only chassis with signature score above threshold. |
| `weight` | `weight>5` | Only chassis with raw weight above threshold. |
| `year=` | `year=3039` | Set the target year. Filters out chassis/variants introduced after this date. |
| `era=` | `era=ClanInvasion` | Select an era by name. |
| `rating=` | `rating=A`, `rating=F` | Unit quality tier. A = elite/Keshik, B, C, D, F = garrison/PGC. MegaMek encodes that some mechs are more common at elite tiers (`+` modifier: highest at A, decreasing down) or garrison tiers (`-` modifier: highest at F, decreasing up). Flat entries (no modifier) are the same at all tiers. **Default (no rating filter):** cross-tier average — a `+` mech at base 8 averages to 6.0 because lower tiers pull it down. **`rating=A`:** shows what the faction's elite units field. **`rating=F`:** the garrison/militia picture. The roster shrinks at extreme tiers as many mechs go to zero. |
| `type=` | `type=omni`, `type=battlemech` | Filter by mech type. |
| `tech=` | `tech=clan`, `tech=is` | Filter by technology base. |
| `family=` | `family=on`, `family=off` | Toggle chassis family merging. |
| `mode=` | `mode=A`, `mode=B` | Data mode. A = MegaMek only, B = MegaMek × MUL (default). |
| `industrial=` | `industrial=show` | Show IndustrialMechs (hidden by default). |

**Operators:** `=`, `!=`, `>`, `<`, `>=`, `<=`. Text fields support `OR`: `class=(Light OR Medium)`, `NOT`: `NOT class=Assault`.

**Sorting:**
- `sort by spread desc` — sort by any numeric field, ascending or descending
- `sort by DC sig desc` — sort by a specific faction's signature
- `sort by DC weight desc` — sort by a specific faction's raw weight
- Multi-sort: `sort by DC sig desc, tons asc`

**Faction-specific filters:**
- `DC-sig>5` — only chassis where DC's signature exceeds 5
- `DC-weight>3` — only chassis where DC's raw weight exceeds 3

##### Settings — "What do the toggles do?"

| Setting | What it controls |
|---------|-----------------|
| **Enable family merging** | Related chassis (e.g. Dragon + Grand Dragon) are scored as one entry. Per-family toggles below. |
| **Show incomplete chassis** | 62 chassis with unknown tonnage (mostly IndustrialMechs) are hidden by default. Toggle to see them. |
| **Data Mode A/B** | Mode A uses raw MegaMek force generator data. Mode B (default) filters by MUL canon availability — if the MUL says a faction doesn't have a chassis in that era, it's excluded. |
| **Column visibility (☰)** | Show/hide individual columns. Weight and Spread columns are hidden by default to reduce clutter. |

### Implementation

- **Location:** `app/index.html` — new overlay div, similar structure to Settings panel
- **Trigger:** `?` button in header, next to ⚙
- **Style:** Same dark panel aesthetic. Collapsible sections via `<details>`/`<summary>` for scannability.
- **No JavaScript logic needed** — pure static HTML/CSS content. The help text is hardcoded, not generated.
- **Files touched:** `app/index.html` (help overlay HTML), `app/style.css` (help panel styles), `app/app.js` (open/close wiring — minimal)

### Design Rationale

In-app help rather than a separate docs page because:
1. Users are already in the app when they need help
2. No context switch — they can read and try simultaneously
3. Stays in sync with the deployed version (same deploy pipeline)
4. No separate hosting or docs framework needed

## Future Possibilities

- **Faction lineage / succession model:** Many factions merge, splinter, rename, or absorb others across eras. Current approach patches this case-by-case (e.g. LA/LC MUL merge → canonical LC). Needs a proper lineage map that understands rename (LC↔LA), merger (FS+LC→FC), splintering (FRR from DC), conquest-then-absorption (FRR→CGB occupation→RD), brief existence (WOB, ROS, SIC), etc. Scoring implications differ: a rename shares the same force pool, a merger combines two, a splinter starts fresh-ish. Key example: FRR goes DC→FRR→CGB/FRR→RD, with mech roster evolving at each transition.
- **Boolean query language (Level 3):** Replace the regex-based parser with a proper tokenizer + AST parser supporting full boolean logic: `(faction=DC AND class=Heavy) OR (faction=FS AND class=Light)`. Would require: tokenizer → recursive descent parser → AST → evaluator per row. Current parser handles AND implicitly (multiple fields) and OR within fields (`class=(Light OR Medium)`), plus `NOT`/`!=` negation. Cross-field OR and parenthetical grouping need AST evaluation. Big lift but would make the query bar a real query language.
- **Code consolidation:** Decompose `runQuery()` monolith. Clean up dead functions (`assignTier`, `renderMechDetail`, `toRating`).

- **Structured form UI:** Dropdowns and sliders layered on top of the query bar, reading/writing the same query syntax.
