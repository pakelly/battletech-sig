# Version Tracker

## Current State

| Environment | Version | Deployed | Accepted |
|-------------|---------|----------|----------|
| prod | 1.21.1 | 2026-05-18 18:49 UTC | pending |
| test | 1.21.1 | 2026-05-18 18:51 UTC | pending |

## History

| Version | Target | Timestamp (UTC) | Accepted | Notes |
|---------|--------|-----------------|----------|-------|
| 1.21.1 | test | 2026-05-18 18:51 | pending | fix: help panel tables scrollable on mobile |
| 1.21.1 | prod | 2026-05-18 18:49 | pending | VERSION.md: auto-stamp 1.21.1 test deploy |
| 1.21.1 | test | 2026-05-18 18:38 | pending | docs: audit and update DESIGN.md against v1.21.1 implementation |
| 1.21.0 | test | 2026-05-18 16:45 | pending | fix: remove scores.json from git (113MB exceeds GitHub limit) |
| 1.20.0 | prod | 2026-05-18 15:55 | pending | v1.20.0: mm-data integration — richer chassis/faction metadata |
| 1.19.2 | prod | 2026-05-18 05:38 | pending | VERSION.md: auto-stamp 1.19.2 test deploy |
| 1.19.2 | test | 2026-05-18 05:24 | pending | fix: parseValueList paren stripping + chip removal for spaced values |
| 1.19.1 | test | 2026-05-18 05:05 | pending | Fix parser: chassis=X (Y) auto-quoted for parenthetical names |
| 1.19.0 | test | 2026-05-18 04:38 | pending | Fix BM/Omni chassis split: use MegaMek's own separation instead of MUL tonnage heuristic |
| 1.18.5 | test | 2026-05-18 03:33 | pending | Add faction aliases: Scorpion Empire, Rassalhague Dominion, Sea Fox, etc |
| 1.18.4 | test | 2026-05-18 01:32 | pending | Add families for all BattleMech/OmniMech tonnage split pairs |
| 1.18.3 | test | 2026-05-18 01:24 | pending | Include all families in app-data (not just enabled ones) |
| 1.18.2 | prod | 2026-05-17 23:39 | pending | VERSION.md: auto-stamp 1.18.2 test deploy |
| 1.18.2 | test | 2026-05-17 23:33 | pending | Compute sig for all views, even without scoped factions |
| 1.18.1 | test | 2026-05-17 23:22 | pending | Mech view: add DR + Prob columns, sort by sig desc |
| 1.18.0 | test | 2026-05-17 20:42 | pending | Clan name aliases + multi-word chassis search |
| 1.17.0 | test | 2026-05-17 19:38 | pending | Split same-name chassis with different tonnages (Firestarter fix) |
| 1.16.0 | test | 2026-05-17 19:34 | pending | Single-faction view: add DR, Prob columns; default sort by DR desc |
| 1.15.1 | prod | 2026-05-17 17:49 | pending | VERSION.md: auto-stamp 1.15.1 test deploy |
| 1.15.1 | test | 2026-05-17 17:35 | pending | Legend: default to expanded |
| 1.15.0 | test | 2026-05-17 17:27 | pending | Legend: replace dismiss with expand/collapse toggle |
| 1.14.9 | test | 2026-05-17 17:03 | pending | Legend: explain Prob instead of Weight, add dismiss button with localStorage persistence |
| 1.14.8 | test | 2026-05-17 16:46 | pending | Add column legend (DR + Weight) above results, visible on query |
| 1.14.7 | prod | 2026-05-17 16:43 | pending | VERSION.md: auto-stamp 1.14.7 test deploy |
| 1.14.7 | test | 2026-05-17 16:42 | pending | Add Clan Sea Fox to Draconis Reach query |
| 1.14.6 | test | 2026-05-17 16:40 | pending | Add both Hot Spots queries: Hinterlands (LC/CW/CJF/CHH/MERC) and Draconis Reach (DC/FS/RA/MERC) |
| 1.14.5 | test | 2026-05-17 16:38 | pending | Replace Hinterlands query with Draconis Reach (DC/FS/RA/MERC 3152) |
| 1.14.4 | test | 2026-05-17 16:34 | pending | Add Hinterlands ilClan era example query (LC/CW/CJF/MERC 3151) |
| 1.14.3 | test | 2026-05-17 16:20 | pending | Update example queries: add Civil War, Invasion Clans; remove Zeus/DC solo |
| 1.14.2 | test | 2026-05-17 16:03 | pending | Add social meta tags, landing hook text, attribution footer |
| 1.14.1 | prod | 2026-05-17 15:58 | pending | VERSION.md: auto-stamp 1.14.1 test deploy |
| 1.14.1 | test | 2026-05-17 15:57 | pending | Add loading spinner + CDN-friendly cache-bust |
| 1.14.0 | prod | 2026-05-17 15:42 | pending | VERSION.md: auto-stamp 1.14.0 test deploy |
| 1.14.0 | test | 2026-05-17 15:36 | pending | sig: always apply WCD mixing, even in single-class view |
| 1.13.3 | prod | 2026-05-17 00:39 | pending | VERSION.md: auto-stamp 1.13.3 test deploy |
| 1.13.3 | test | 2026-05-17 00:34 | pending | Refactor chip removal: unified generic pattern replaces per-field regexes |
| 1.13.2 | test | 2026-05-17 00:33 | pending | Fix rating chip removal for multi-rating syntax rating=(A OR B) |
| 1.13.1 | prod | 2026-05-17 00:22 | pending | VERSION.md: auto-stamp 1.13.1 test deploy |
| 1.13.1 | test | 2026-05-17 00:14 | pending | Fix cross-tier averaging: compute in probability space (Jensen's fix) |
| 1.13.0 | prod | 2026-05-16 20:29 | pending | VERSION.md: auto-stamp 1.13.0 test deploy |
| 1.13.0 | test | 2026-05-16 17:34 | pending | Rename Signature to Distinctiveness Rating (DR1-DR5) |
| 1.12.5 | prod | 2026-05-16 15:03 | pending | VERSION.md: auto-stamp 1.12.5 test deploy |
| 1.12.5 | test | 2026-05-16 15:00 | pending | Support multi-rating filter: rating=(A OR B) averages tiers |
| 1.12.4 | test | 2026-05-16 04:06 | pending | Fix sig sort: fielded-but-zero-sig sorts above not-fielded |
| 1.12.3 | prod | 2026-05-16 00:56 | pending | VERSION.md: auto-stamp 1.12.3 test deploy |
| 1.12.3 | test | 2026-05-16 00:54 | pending | Show T5 for fielded-but-not-distinctive instead of en-dash |
| 1.12.2 | test | 2026-05-16 00:52 | pending | Distinguish 'fielded but not distinctive' from 'not fielded' in sig column |
| 1.12.1 | test | 2026-05-16 00:45 | pending | Bump to 1.12.1 — increment patch for each test deploy |
| 1.12.0 | test | 2026-05-16 00:44 | pending | Add deploy timestamp to version stamp |
| 1.12.0 | test | 2026-05-16 00:40 | pending | Tech-base-aware signature: compare against plausible factions only |
| 1.12.0 | test | 2026-05-16 00:27 | pending | Fix WCD bar alignment: fixed-width label, remove inline marker |
| 1.12.0 | test | 2026-05-16 00:21 | pending | Log-Jenks tier assignment for prob-space signature |
| 1.12.0 | test | 2026-05-16 00:13 | pending | Signature computation in probability space instead of rating space |
| 1.11.0 | prod | 2026-05-15 22:57 | pending | VERSION.md: auto-stamp 1.11.0 test deploy |
| 1.11.0 | test | 2026-05-15 22:54 | pending | Fix column visibility defaults not applied after reset |
| 1.11.0 | test | 2026-05-15 22:40 | pending | Add 'Reset to defaults' button in Settings panel |
| 1.10.2 | test | 2026-05-15 19:50 | pending | Rename BW column to Prob (Probability Weight) |
| 1.10.1 | test | 2026-05-15 19:42 | pending | Always apply WCD to biased weight, even in single-class view |
| 1.10.0 | prod | 2026-05-15 19:12 | pending | VERSION.md: auto-stamp 1.10.0 test deploy |
| 1.10.0 | test | 2026-05-15 19:11 | pending | Heat map coloring for Biased Weight columns |
| 1.9.0 | prod | 2026-05-15 19:06 | pending | VERSION.md: auto-stamp 1.9.0 test deploy |
| 1.9.0 | test | 2026-05-15 19:05 | pending | Show explanatory text when faction doesn't field a chassis |
| 1.9.0 | test | 2026-05-15 18:47 | pending | Make empty faction cells clickable for drill-down |
| 1.9.0 | test | 2026-05-15 18:29 | pending | Chassis detail drill-down: rating tiers + weight class distribution |
| 1.8.1 | prod | 2026-05-15 17:24 | pending | VERSION.md: auto-stamp 1.8.1 test deploy |
| 1.8.1 | test | 2026-05-15 17:23 | pending | Fix VERSION.md auto-stamper: section-aware awk replaces fragile sed/awk |
| 1.8.1 | test | 2026-05-15 17:22 | pending | Unify versioning: APP_VERSION is single source of truth |
| 1.8.0 | prod | 2026-05-15 17:15 | pending | Help panel (? button) — overview, column reference, query language, settings docs |
| 1.8.0 | test | 2026-05-15 17:05 | 2026-05-15 17:13 | Help panel (? button) — overview, column reference, query language, settings docs |
| 1.7.0 | prod | 2026-05-15 03:58 | pending | Tech debt cleanup + faction keywords (InnerSphere, ISClans, HomeClans) + incomplete chassis filter |
| 1.5.0 | prod | 2026-05-14 20:09 | 2026-05-15 00:09 | Global Jenks tiers across all displayed factions |
| 1.4.0 | prod | 2026-05-14 19:46 | 2026-05-14 19:55 | Default to cross-tier average instead of A-tier |
| 1.3.0 | prod | 2026-05-14 18:54 | 2026-05-14 19:04 | Sig uses rating-space × WCD instead of prob-space × WCD |
| 1.2.0 | prod | 2026-05-14 18:17 | 2026-05-14 18:24 | Added app versioning, cache-bust by version |
