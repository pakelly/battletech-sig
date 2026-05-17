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

---

_Last updated: 2026-05-17 12:30 PT_
