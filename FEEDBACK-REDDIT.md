# Reddit Feedback — r/battletech Post (2026-05-17)

**Thread:** https://www.reddit.com/r/battletech/s/TvjG1h9eoL
**Posted:** ~11:30 AM PT, Sunday May 17, 2026

## Comments & Feedback

### Comment 1
> I played with it for a few minutes. I wish the usage was a number instead of a bar. Also found a simple error — the firestarter is a 35 ton light not a 45 ton medium.

**Analysis:**
- **Usage as number:** Single-faction roster view shows a bar for weight. User wants numeric value displayed. Multi-faction view already shows numbers. Quick fix for single-faction view.
- **Firestarter bug:** CONFIRMED. Two Firestarters exist in canon: FS9-H (35t Light, 2550) and FS9-O (45t Medium OmniMech, 3057). Our data pipeline merged them into one entry at 45t/Medium/Omni. The OmniMech metadata is overwriting the classic. This is a data pipeline issue — the MUL has them as separate entries but they share the chassis name "Firestarter."

---

## Themes & Action Items

| # | Theme | Source | Priority | Notes |
|---|-------|--------|----------|-------|
| 1 | Show numeric weight in single-faction view | Comment 1 | 🟡 | Bar is visual but users want the number too |
| 2 | Firestarter tonnage wrong (35t→45t) | Comment 1 | 🔴 Bug | Data pipeline: OmniMech metadata overwriting classic BattleMech. Fix: split into separate chassis entries (e.g. "Firestarter" + "Firestarter (Omni)"). Users can recombine via family merge if they want. Need to scan for ALL same-name BattleMech/OmniMech pairs. |

### Comment 2 (detailed, knowledgeable player)

**Data accuracy (CJF 3150):**
> Scylla and Highlander IIC at higher usage than Summoners and Bane. Scylla is listed as extinct in ilClan on MUL. Falcons only had one Highlander IIC variant, lost access in ilClan. IS mechs (Highlander, Warhammer, Crusader) showing higher than Clan-produced mechs (Flamberge, Jade Hawk, Night Gyr, Thunderbolt IIC).

> Nova is 1.0 usage / 0.47 prob — very wrong. Lower than mechs out of production for decades or never produced by the Clan. Same probability as leftover exodus-era Crabs.

**Sort confusion:**
> Adding `sort by sig desc` changes the ordering and it's unclear why. (Single-faction default sort vs sig sort difference not explained in UI)

**Search/chassis resolution bugs:**
> - "Grand Summoner" → matches Grand Dragon (wrong)
> - "Thor" / "Thor II" / "Thor II (Grand Summoner)" → matches Thorn (wrong)
> - "Hel" → no results (should match Hel or Loki/Hellbringer)
> - "Loki" → only returns Hellbringer (correct but missing Nova/Loki alias?)
> - "Nova" → returns Supernova (wrong, should match Nova/Black Hawk KU)
> - "Black Hawk" → returns Black Knight (wrong)
> - "King Crab" → no results at all (space in name?)

---

## Themes & Action Items

| # | Theme | Source | Priority | Notes |
|---|-------|--------|----------|-------|
| 1 | Show numeric weight in single-faction view | Comment 1 | ✅ Done v1.16.0 | Added DR + Prob columns |
| 2 | Firestarter tonnage wrong (35t→45t) | Comment 1 | ✅ Done v1.17.0 | 12 chassis split by tonnage |
| 3 | CJF 3150 data inaccurate | Comment 2 | 🔴 | MegaMek weights may not respect MUL extinction. Mode B should filter but may not be working for Clan chassis. Investigate MUL filtering for CJF. |
| 4 | Nova prob way too low (0.47) | Comment 2 | 🔴 | May be a tonnage-split casualty or WCD issue. Nova = 50t Clan OmniMech. Check if split affected it. |
| 5 | Sort difference unexplained | Comment 2 | 🟡 | Default sort = weight desc; sig desc = different metric. UI doesn't explain this. Legend could mention it. |
| 6 | Clan IS-name aliases broken | Comment 2 | 🔴 | Thor→Thorn, Nova→Supernova, Black Hawk→Black Knight, Grand Summoner→Grand Dragon. Need Clan reporting name aliases in chassis resolution. |
| 7 | Space-in-name search broken | Comment 2 | 🔴 | "King Crab" returns nothing. Likely partial-match logic failing on multi-word names. |

---

_Last updated: 2026-05-17 12:47 PT_
