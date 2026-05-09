# Progress

## 2026-05-09 — Full App Build

### Completed

1. **`scripts/score.mjs`** — Rewrote. Organizes resolved MegaMek data for UI consumption. Filters to major factions (those with MUL mapping), outputs raw weights per chassis per faction per era with variant weights and family tags.

2. **`scripts/combine.mjs`** — Rewrote. Generates `app-data.json` with:
   - Raw weights per faction per chassis per era
   - Variant weights for drill-down
   - **Cumulative MUL availability** (a chassis available in earlier eras stays available in later eras)
   - Faction metadata with clan/IS/periphery flags
   - Model prefix aliases (DRG→Dragon, AWS→Awesome, etc.)
   - Chassis metadata (tonnage, weight class, intro date, industrial flag)
   - Chassis family definitions
   - Faction group shortcuts (GreatHouses, Clans, Periphery)
   - Era list with labels

3. **`app/`** — Full web application:
   - **Query parser** with all fields: faction, chassis, class, spread, span, avg-pref, weight, year, era, family, industrial, mode, sort
   - **Operators**: =, !=, >, <, >=, <=, OR, parentheses, partial matching
   - **Faction Comparison View** — heat map table with scoped preference coloring, spread/span/avg columns
   - **Single Faction View** — roster ranked by raw weight with bar chart
   - **Mech View** — all factions that field a chassis, ranked by weight
   - **Auto-suggest** — context-aware suggestions (faction names after faction=, chassis names after chassis=, etc.)
   - **Variant drill-down** — click any faction+chassis cell to see variant weight distribution
   - **Filter chips** — removable chips below query bar showing active filters
   - **URL hash routing** — query preserved in URL hash for sharing
   - **Dark theme** with warm heat map palette (orange/red)
   - **Example queries** on landing page

### Scoring Verification

All critical scoring rules verified:
- **Dragon (DC only)**: DC=10, all other Great Houses=1 ✓ (zeros included in normalization)
- **Awesome (FWL favorite)**: FWL=10, others=1 ✓
- **Spread**: Computed from raw weights (not normalized preference) ✓
- **Mode B**: MUL-confirmed only; MUL availability is cumulative across eras ✓

### Data Stats
- 648 chassis across 39 eras
- 36 major factions
- 36% MUL coverage (faction+chassis entries with cumulative MUL confirmation)
- app-data.json: ~4.1MB

### Known Limitations / Future Work
- MUL coverage could be improved with more API pulls (some faction+era combos not yet cached)
- Chassis without MUL metadata (tonnage, intro date) show as "?" in the UI
- No structured form controls yet (query bar is the only input; dropdowns/sliders planned for future)
- Mobile responsive is basic (horizontal scroll for wide comparison tables)
- Family toggle UI control not yet implemented (use `family=off` in query)
