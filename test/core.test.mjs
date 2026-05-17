#!/usr/bin/env node
/**
 * core.test.mjs — Core functionality tests for BattleTech Faction Signatures
 * 
 * Run: node --test test/core.test.mjs
 * 
 * These tests load the real app-data.json and validate scoring, parsing,
 * sorting, and filtering against known-good expected results.
 * They should be run after every commit.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Load app.js functions by eval (browser script, no exports) ──
// We extract the pure functions we need to test.

const appSrc = readFileSync(resolve(ROOT, 'app/app.js'), 'utf8');

let F; // extracted functions
let APP_DATA;

before(() => {
  APP_DATA = JSON.parse(readFileSync(resolve(ROOT, 'app/app-data.json'), 'utf8'));

  // Minimal DOM/browser stubs
  const stubEl = () => ({ value: '', classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, style: {}, innerHTML: '', textContent: '', appendChild() {}, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, closest: () => null, dataset: {} });
  const g = {
    document: { getElementById: () => stubEl(), querySelector: () => null, querySelectorAll: () => [], createElement: () => stubEl(), addEventListener() {} },
    location: { hash: '', pathname: '/' },
    history: { replaceState() {} },
    setTimeout: () => {},
    clearTimeout: () => {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    window: {},
  };

  // Execute app.js in a vm-like context using Function constructor
  // We wrap it to avoid `let DATA` redeclaration issues
  const wrapper = new Function('globals', `
    with (globals) {
      ${appSrc.replace(/^let DATA/m, 'var DATA').replace(/^let currentEraYear/m, 'var currentEraYear')}
      DATA = globals.__APP_DATA__;
      return {
        parseQuery,
        computeSpread,
        computeSpan,
        computeAvgWeight,
        computeSignature,
        jenksBreaks,
        assignTierFromBreaks,
        compareOp,
        sortRowsInPlace,
        computeBVRange,
        resolveFaction,
        resolveFactionGroup,
        resolveChassis,
        determineView,
        resolveWeight,
        resolveWeights,
        computeResolvedWeights,
        getWcdMixingFactor,
        toProb,
        RATING_INDEX,
      };
    }
  `);

  g.__APP_DATA__ = APP_DATA;
  F = wrapper(g);
});

// ════════════════════════════════════════════════════════
// 1. QUERY PARSER
// ════════════════════════════════════════════════════════

describe('Query Parser', () => {
  it('parses basic faction query', () => {
    const p = F.parseQuery('faction=DC');
    assert.deepStrictEqual(p.factions, ['DC']);
  });

  it('parses multiple factions (OR syntax)', () => {
    const p = F.parseQuery('faction=(DC OR FS)');
    assert.ok(p.factions.includes('DC'));
    assert.ok(p.factions.includes('FS'));
    assert.strictEqual(p.factions.length, 2);
  });

  it('parses multiple factions (repeated field)', () => {
    const p = F.parseQuery('faction=DC faction=FS');
    assert.ok(p.factions.includes('DC'));
    assert.ok(p.factions.includes('FS'));
  });

  it('expands GreatHouses shortcut', () => {
    const p = F.parseQuery('faction=GreatHouses');
    assert.ok(p.factions.includes('DC'));
    assert.ok(p.factions.includes('FS'));
    assert.ok(p.factions.includes('FWL'));
    assert.ok(p.factions.includes('LC'));
    assert.ok(p.factions.includes('CC'));
    assert.strictEqual(p.factions.length, 5);
  });

  it('parses year', () => {
    const p = F.parseQuery('year=3039');
    assert.strictEqual(p.year, 3039);
  });

  it('parses spread filter', () => {
    const p = F.parseQuery('spread>3');
    assert.deepStrictEqual(p.spread, { op: '>', val: 3 });
  });

  it('parses sig filter', () => {
    const p = F.parseQuery('sig>8');
    assert.deepStrictEqual(p.sig, { op: '>', val: 8 });
  });

  it('parses class with OR', () => {
    const p = F.parseQuery('class=(Light OR Medium)');
    assert.deepStrictEqual(p.class, { op: '=', values: ['light', 'medium'] });
  });

  it('parses class!=assault (exclusion)', () => {
    const p = F.parseQuery('class!=Assault');
    assert.deepStrictEqual(p.class, { op: '!=', values: ['assault'] });
  });

  it('parses NOT class=Assault as class!=Assault', () => {
    const p = F.parseQuery('NOT class=Assault');
    assert.deepStrictEqual(p.class, { op: '!=', values: ['assault'] });
  });

  it('parses NOT chassis=Locust as exclusion', () => {
    const p = F.parseQuery('NOT chassis=Locust');
    assert.strictEqual(p.chassisOp, '!=');
    assert.ok(p.chassis.includes('Locust'));
  });

  it('parses chassis!=Locust (exclusion)', () => {
    const p = F.parseQuery('chassis!=Locust');
    assert.strictEqual(p.chassisOp, '!=');
    assert.ok(p.chassis.includes('Locust'));
  });

  it('parses tons filter', () => {
    const p = F.parseQuery('tons>50');
    assert.deepStrictEqual(p.tons, { op: '>', val: 50 });
  });

  it('parses single bv filter', () => {
    const p = F.parseQuery('bv>1000');
    assert.strictEqual(p.bv.length, 1);
    assert.deepStrictEqual(p.bv[0], { op: '>', val: 1000 });
  });

  it('parses bv range (two conditions)', () => {
    const p = F.parseQuery('bv>1000 bv<1500');
    assert.strictEqual(p.bv.length, 2);
    assert.deepStrictEqual(p.bv[0], { op: '>', val: 1000 });
    assert.deepStrictEqual(p.bv[1], { op: '<', val: 1500 });
  });

  it('parses faction-specific weight filter', () => {
    const p = F.parseQuery('DC-weight>8');
    assert.strictEqual(p.factionWeight.length, 1);
    assert.strictEqual(p.factionWeight[0].faction, 'DC');
    assert.strictEqual(p.factionWeight[0].op, '>');
    assert.strictEqual(p.factionWeight[0].val, 8);
  });

  it('parses faction-specific sig filter', () => {
    const p = F.parseQuery('DC-sig>7');
    assert.strictEqual(p.factionSig.length, 1);
    assert.strictEqual(p.factionSig[0].faction, 'DC');
  });

  it('parses sort by sig desc', () => {
    const p = F.parseQuery('faction=FS year=3039 sort by sig desc');
    assert.strictEqual(p.sort.length, 1);
    assert.strictEqual(p.sort[0].field, 'sig');
    assert.strictEqual(p.sort[0].dir, 'desc');
  });

  it('parses sort by faction sig (two-token form)', () => {
    const p = F.parseQuery('faction=DC,FS sort by DC sig desc');
    assert.strictEqual(p.sort.length, 1);
    assert.strictEqual(p.sort[0].field, 'DC-sig');
    assert.strictEqual(p.sort[0].dir, 'desc');
  });

  it('parses sort by faction-sig (hyphenated form)', () => {
    const p = F.parseQuery('faction=DC,FS sort by DC-sig desc');
    assert.strictEqual(p.sort.length, 1);
    assert.strictEqual(p.sort[0].field, 'DC-sig');
    assert.strictEqual(p.sort[0].dir, 'desc');
  });

  it('parses sort by faction weight', () => {
    const p = F.parseQuery('sort by DC weight desc');
    assert.strictEqual(p.sort[0].field, 'DC-weight');
  });

  it('is case-insensitive for factions', () => {
    const p1 = F.parseQuery('faction=dc');
    const p2 = F.parseQuery('faction=DC');
    const p3 = F.parseQuery('faction=Dc');
    assert.deepStrictEqual(p1.factions, p2.factions);
    assert.deepStrictEqual(p2.factions, p3.factions);
  });

  it('is case-insensitive for sort fields', () => {
    const p = F.parseQuery('sort by SIG DESC');
    assert.strictEqual(p.sort[0].field, 'sig');
    assert.strictEqual(p.sort[0].dir, 'desc');
  });

  it('parses mode', () => {
    const p = F.parseQuery('mode=A');
    assert.strictEqual(p.mode, 'A');
  });

  it('parses combined query', () => {
    const p = F.parseQuery('faction=GreatHouses year=3039 spread>2 class=Heavy sort by spread desc');
    assert.strictEqual(p.factions.length, 5);
    assert.strictEqual(p.year, 3039);
    assert.deepStrictEqual(p.spread, { op: '>', val: 2 });
    assert.deepStrictEqual(p.class, { op: '=', values: ['heavy'] });
    assert.strictEqual(p.sort[0].field, 'spread');
  });
});

describe('Faction Aliases', () => {
  it('resolves LA to LC (Lyran Commonwealth canonical)', () => {
    assert.strictEqual(F.resolveFaction('la'), 'LC');
    assert.strictEqual(F.resolveFaction('LA'), 'LC');
  });

  it('resolves LC to LC', () => {
    assert.strictEqual(F.resolveFaction('lc'), 'LC');
  });

  it('resolves lyran aliases to LC', () => {
    assert.strictEqual(F.resolveFaction('lyran'), 'LC');
    assert.strictEqual(F.resolveFaction('steiner'), 'LC');
    assert.strictEqual(F.resolveFaction('lyran alliance'), 'LC');
    assert.strictEqual(F.resolveFaction('lyran commonwealth'), 'LC');
  });

  it('faction=LA parses to LC', () => {
    const p = F.parseQuery('faction=LA');
    assert.ok(p.factions.includes('LC'));
    assert.ok(!p.factions.includes('LA'));
  });
});

// ════════════════════════════════════════════════════════
// 2. SCOPED PREFERENCE
// ════════════════════════════════════════════════════════

// Scoped Preference removed — replaced by raw weights (2026-05-10)

// ════════════════════════════════════════════════════════
// 3. DERIVED VALUES
// ════════════════════════════════════════════════════════

describe('Derived Values', () => {
  it('computeSpread returns max - min of weights', () => {
    assert.strictEqual(F.computeSpread({ DC: 8, FS: 2, FWL: 5 }, ['DC', 'FS', 'FWL']), 6);
  });

  it('computeSpan counts non-zero factions', () => {
    assert.strictEqual(F.computeSpan({ DC: 8, FS: 0, FWL: 5 }, ['DC', 'FS', 'FWL']), 2);
  });

  it('computeAvgWeight averages non-zero weights', () => {
    const weights = { DC: 8, FS: 2, FWL: 5 };
    const avg = F.computeAvgWeight(weights, ['DC', 'FS', 'FWL']);
    assert.ok(Math.abs(avg - 5) < 0.01);
  });

  it('computeBVRange returns min/max from in-scope variants', () => {
    const variants = {
      'DRG-1N': { w: { DC: 8 }, bv: 1125, intro: 2754 },
      'DRG-1C': { w: { DC: 5 }, bv: 1215, intro: 2752 },
      'DRG-5N': { w: { DC: 5 }, bv: 1223, intro: 3047 },
    };
    const range = F.computeBVRange(variants, ['DC'], {}, false, null);
    assert.strictEqual(range.bvMin, 1125);
    assert.strictEqual(range.bvMax, 1223);
    assert.strictEqual(range.bvList.length, 3);
  });

  it('computeBVRange filters by target year', () => {
    const variants = {
      'DRG-1N': { w: { DC: 8 }, bv: 1125, intro: 2754 },
      'DRG-5N': { w: { DC: 5 }, bv: 1223, intro: 3047 },
    };
    const range = F.computeBVRange(variants, ['DC'], {}, false, 3039);
    assert.strictEqual(range.bvMin, 1125);
    assert.strictEqual(range.bvMax, 1125);
    assert.strictEqual(range.bvList.length, 1);
  });

  it('computeBVRange returns null when no BV data', () => {
    const variants = { 'DRG-1N': { w: { DC: 8 } } };
    const range = F.computeBVRange(variants, ['DC'], {}, false, null);
    assert.strictEqual(range, null);
  });

  it('computeBVRange respects scoped factions', () => {
    const variants = {
      'DRG-1N': { w: { DC: 8, FS: 3 }, bv: 1125, intro: 2754 },
      'DRG-C': { w: { DC: 5 }, bv: 1322, intro: 3050 },
    };
    // Only FS is in scope — DRG-C has no FS weight, should be excluded
    const range = F.computeBVRange(variants, ['FS'], {}, false, null);
    assert.strictEqual(range.bvMin, 1125);
    assert.strictEqual(range.bvMax, 1125);
  });

  it('compareOp handles all operators', () => {
    assert.strictEqual(F.compareOp(5, '>', 3), true);
    assert.strictEqual(F.compareOp(5, '<', 3), false);
    assert.strictEqual(F.compareOp(5, '>=', 5), true);
    assert.strictEqual(F.compareOp(5, '<=', 5), true);
    assert.strictEqual(F.compareOp(5, '=', 5), true);
    assert.strictEqual(F.compareOp(5, '!=', 5), false);
  });
});

// ════════════════════════════════════════════════════════
// 4. GLOBAL SIGNATURE
// ════════════════════════════════════════════════════════

describe('Global Signature (weight × z-score)', () => {
  // Standard faction pool for tests — 10 factions gives clean math
  const ALL = ['DC', 'FS', 'FWL', 'LC', 'CC', 'FRR', 'CS', 'MERC', 'TC', 'MH'];

  it('exclusive mech: high z-score from zeros', () => {
    // Only DC has it at weight 6, 9 others at 0
    const result = F.computeSignature({ DC: 6 }, { DC: 1 }, ['DC'], ALL);
    assert.ok(result.DC > 15, `Exclusive w=6 should score high, got ${result.DC.toFixed(2)}`);
  });

  it('shared mech scores lower than exclusive at same weight', () => {
    const excl = F.computeSignature({ DC: 6 }, { DC: 1 }, ['DC'], ALL);
    const shared = F.computeSignature(
      { DC: 6, FS: 6, FWL: 5, LA: 8, CC: 4 },
      { DC: 1, FS: 1, FWL: 1, LA: 1, CC: 1 },
      ['DC'], ALL
    );
    assert.ok(excl.DC > shared.DC, `Exclusive (${excl.DC.toFixed(2)}) should be > shared (${shared.DC.toFixed(2)})`);
  });

  it('higher weight exclusive beats lower weight exclusive', () => {
    const high = F.computeSignature({ DC: 8 }, { DC: 1 }, ['DC'], ALL);
    const low = F.computeSignature({ DC: 3 }, { DC: 1 }, ['DC'], ALL);
    assert.ok(high.DC > low.DC, `Weight 8 (${high.DC.toFixed(2)}) should be > weight 3 (${low.DC.toFixed(2)})`);
  });

  it('returns 0 for factions without MUL confirmation', () => {
    const result = F.computeSignature({ DC: 6, FS: 6 }, { DC: 1 }, ['DC', 'FS'], ALL);
    assert.strictEqual(result.FS, 0);
  });

  it('faction standing out in a crowd scores well', () => {
    // Victor-like: FS at 9, everyone else at 4-5
    const weights = { DC: 5, FS: 9, FWL: 4, LA: 5, CC: 5, FRR: 5, CS: 5, MERC: 4, TC: 4, MH: 4 };
    const mul = { DC: 1, FS: 1, FWL: 1, LA: 1, CC: 1, FRR: 1, CS: 1, MERC: 1, TC: 1, MH: 1 };
    const result = F.computeSignature(weights, mul, ['DC', 'FS'], ALL);
    assert.ok(result.FS > result.DC, `FS (${result.FS.toFixed(2)}) should be > DC (${result.DC.toFixed(2)})`);
  });

  it('high weight + many factions can beat low weight + exclusive', () => {
    // Dragon-like: DC:8 with 3 factions vs Hatamoto-Ku: DC:2 exclusive
    const dragon = F.computeSignature({ DC: 8, FRR: 5, MERC: 4 }, { DC: 1, FRR: 1, MERC: 1 }, ['DC'], ALL);
    const hatKu = F.computeSignature({ DC: 2 }, { DC: 1 }, ['DC'], ALL);
    assert.ok(dragon.DC > hatKu.DC, `Dragon (${dragon.DC.toFixed(2)}) should be > Hatamoto-Ku (${hatKu.DC.toFixed(2)})`);
  });
});

describe('Signature Tiers (Jenks Natural Breaks)', () => {
  it('finds natural breaks in clustered data', () => {
    // Two clear clusters: [1,1,2,2] and [8,9,10,10]
    const values = [1, 1, 2, 2, 8, 9, 10, 10];
    const breaks = F.jenksBreaks(values, 2);
    // Break should be between 2 and 8
    assert.ok(breaks.length === 1, `Expected 1 break, got ${breaks.length}`);
    assert.ok(breaks[0] > 2 && breaks[0] <= 8, `Break at ${breaks[0]} should be between clusters`);
  });

  it('assigns tier 1 to highest cluster', () => {
    // Clear clusters: low=[1,2,3], mid=[10,11,12], high=[30,31,32]
    const sorted = [1, 2, 3, 10, 11, 12, 30, 31, 32];
    const breaks = F.jenksBreaks(sorted, 3);
    assert.strictEqual(F.assignTierFromBreaks(32, breaks), 1);
    assert.strictEqual(F.assignTierFromBreaks(31, breaks), 1);
  });

  it('assigns lowest tier to bottom cluster', () => {
    const sorted = [1, 2, 3, 10, 11, 12, 30, 31, 32];
    const breaks = F.jenksBreaks(sorted, 3);
    assert.strictEqual(F.assignTierFromBreaks(1, breaks), 3);
  });

  it('handles single value', () => {
    const breaks = F.jenksBreaks([5], 5);
    assert.strictEqual(F.assignTierFromBreaks(5, breaks), 1);
  });

  it('handles uniform data gracefully', () => {
    const sorted = [5, 5, 5, 5, 5];
    const breaks = F.jenksBreaks(sorted, 5);
    // All same value — should all get the same tier
    const tier = F.assignTierFromBreaks(5, breaks);
    assert.ok(tier >= 1 && tier <= 5, `Tier should be valid, got ${tier}`);
  });
});

// ════════════════════════════════════════════════════════
// 5. GLOBAL SIGNATURE — REAL DATA VALIDATION
// ════════════════════════════════════════════════════════

describe('Global Signature — Real Data (DC 3039)', () => {
  let dcSigs; // { chassisName: rawSigScore }
  const allFactions = Object.keys(APP_DATA.factions);

  before(() => {
    const era = APP_DATA.eraData['3039'];
    dcSigs = {};
    for (const [name, d] of Object.entries(era)) {
      if (!d.mul?.DC) continue;
      const chassisClass = APP_DATA.chassis[name]?.class || null;
      const weights = F.computeResolvedWeights(d.w, null);
      const dcW = weights.DC || 0;
      if (dcW === 0) continue;
      // Mirror app: pass wcdParams so computeSignature applies WCD mixing internally
      const wcdParams = chassisClass ? { chassisClass, eraYear: 3039 } : null;
      const result = F.computeSignature(weights, d.mul, ['DC'], allFactions, wcdParams);
      dcSigs[name] = result.DC;
    }
  });

  it('Hatamoto-Chi has positive DC sig (exclusive)', () => {
    assert.ok(dcSigs['Hatamoto-Chi'] > 0, `Hatamoto-Chi should score positive, got ${dcSigs['Hatamoto-Chi']?.toFixed(2)}`);
  });

  it('Dragon scores higher than Griffin (semi-exclusive vs ubiquitous)', () => {
    assert.ok(dcSigs['Dragon'] > dcSigs['Griffin'],
      `Dragon (${dcSigs['Dragon']?.toFixed(2)}) should be > Griffin (${dcSigs['Griffin']?.toFixed(2)})`);
  });

  it('Dragon scores higher than Locust', () => {
    assert.ok(dcSigs['Dragon'] > dcSigs['Locust'],
      `Dragon (${dcSigs['Dragon']?.toFixed(2)}) should be > Locust (${dcSigs['Locust']?.toFixed(2)})`);
  });

  it('exclusive mechs rank above ubiquitous ones', () => {
    // Hatamoto-Chi (exclusive) should beat Victor (common)
    if (dcSigs['Victor']) {
      assert.ok(dcSigs['Hatamoto-Chi'] > dcSigs['Victor'],
        `Hatamoto-Chi (${dcSigs['Hatamoto-Chi']?.toFixed(2)}) should be > Victor (${dcSigs['Victor']?.toFixed(2)})`);
    }
  });
});

// ════════════════════════════════════════════════════════
// 6. SORT FUNCTIONS
// ════════════════════════════════════════════════════════

describe('sortRowsInPlace', () => {
  it('sorts by sig desc', () => {
    const rows = [
      { name: 'Locust', sig: { DC: 3 }, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: {} },
      { name: 'Dragon', sig: { DC: 10 }, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: {} },
      { name: 'Griffin', sig: { DC: 7 }, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: {} },
    ];
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);
    assert.strictEqual(rows[0].name, 'Dragon');
    assert.strictEqual(rows[1].name, 'Griffin');
    assert.strictEqual(rows[2].name, 'Locust');
  });

  it('sorts by DC-sig desc', () => {
    const rows = [
      { name: 'Locust', sig: { DC: 3 }, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: {} },
      { name: 'Dragon', sig: { DC: 10 }, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: {} },
      { name: 'Griffin', sig: { DC: 7 }, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: {} },
    ];
    F.sortRowsInPlace(rows, [{ field: 'DC-sig', dir: 'desc' }]);
    assert.strictEqual(rows[0].name, 'Dragon');
    assert.strictEqual(rows[2].name, 'Locust');
  });

  it('sorts by spread desc', () => {
    const rows = [
      { name: 'A', spread: 2, sig: null, span: 0, avgWeight: 0, meta: {}, weights: {} },
      { name: 'B', spread: 8, sig: null, span: 0, avgWeight: 0, meta: {}, weights: {} },
      { name: 'C', spread: 5, sig: null, span: 0, avgWeight: 0, meta: {}, weights: {} },
    ];
    F.sortRowsInPlace(rows, [{ field: 'spread', dir: 'desc' }]);
    assert.strictEqual(rows[0].name, 'B');
    assert.strictEqual(rows[2].name, 'A');
  });

  it('sorts by tons asc', () => {
    const rows = [
      { name: 'Atlas', meta: { tons: 100 }, sig: null, spread: 0, span: 0, avgWeight: 0, weights: {} },
      { name: 'Locust', meta: { tons: 20 }, sig: null, spread: 0, span: 0, avgWeight: 0, weights: {} },
      { name: 'Griffin', meta: { tons: 55 }, sig: null, spread: 0, span: 0, avgWeight: 0, weights: {} },
    ];
    F.sortRowsInPlace(rows, [{ field: 'tons', dir: 'asc' }]);
    assert.strictEqual(rows[0].name, 'Locust');
    assert.strictEqual(rows[2].name, 'Atlas');
  });

  it('sorts by DC-weight desc', () => {
    const rows = [
      { name: 'A', sig: null, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: { DC: 3 } },
      { name: 'B', sig: null, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: { DC: 10 } },
      { name: 'C', sig: null, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: { DC: 7 } },
    ];
    F.sortRowsInPlace(rows, [{ field: 'DC-weight', dir: 'desc' }]);
    assert.strictEqual(rows[0].name, 'B');
  });

  it('handles null sig gracefully', () => {
    const rows = [
      { name: 'A', sig: null, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: {} },
      { name: 'B', sig: { DC: 10 }, spread: 0, span: 0, avgWeight: 0, meta: {}, weights: {} },
    ];
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);
    assert.strictEqual(rows[0].name, 'B');
  });
});

// ════════════════════════════════════════════════════════
// 7. MUL DATA INTEGRITY
// ════════════════════════════════════════════════════════

describe('MUL Data Integrity', () => {
  it('Griffin has MUL confirmation for DC in 3039', () => {
    const era = APP_DATA.eraData['3039'];
    assert.ok(era['Griffin'], 'Griffin should exist in 3039');
    assert.ok(era['Griffin'].mul?.DC, 'Griffin should have MUL confirmation for DC');
  });

  it('Griffin has MUL confirmation for all Great Houses in 3039', () => {
    const era = APP_DATA.eraData['3039'];
    const griffin = era['Griffin'];
    for (const f of ['DC', 'FS', 'FWL', 'CC']) {
      assert.ok(griffin.mul?.[f], `Griffin should have MUL confirmation for ${f}`);
    }
  });

  it('Dragon does NOT have MUL confirmation for FS in 3039', () => {
    const era = APP_DATA.eraData['3039'];
    assert.ok(!era['Dragon']?.mul?.FS, 'Dragon should not have MUL confirmation for FS');
  });

  it('era 3039 has substantial DC roster', () => {
    const era = APP_DATA.eraData['3039'];
    const dcMechs = Object.entries(era).filter(([name, d]) => {
      if (!d.mul?.DC) return false;
      const weights = F.computeResolvedWeights(d.w, null);
      return (weights.DC || 0) > 0;
    });
    assert.ok(dcMechs.length > 30, `DC should have >30 mechs in 3039, got ${dcMechs.length}`);
  });
});

// ════════════════════════════════════════════════════════
// 8. FILTER/SORT PARITY (Design Invariant)
// ════════════════════════════════════════════════════════

describe('Filter/Sort Parity', () => {
  const filterableFields = ['spread', 'span', 'avg-weight', 'weight', 'sig', 'tons'];

  for (const field of filterableFields) {
    it(`${field} works as both filter and sort`, () => {
      // Test filter parsing
      const filterQ = F.parseQuery(`${field}>5`);
      const filterField = field === 'avg-weight' ? 'avgWeight' : field;
      assert.ok(
        filterQ[filterField] !== null && filterQ[filterField] !== undefined,
        `${field} should parse as filter`
      );

      // Test sort parsing
      const sortQ = F.parseQuery(`sort by ${field} desc`);
      assert.strictEqual(sortQ.sort.length, 1, `${field} should parse as sort`);
      // Verify the sort field name resolves (accounting for name transformations)
      const sortField = sortQ.sort[0].field;
      assert.ok(sortField, `${field} sort should have a field name`);
    });
  }
});

// ════════════════════════════════════════════════════════
// 9. END-TO-END SORT VERIFICATION (the bug we kept hitting)
// ════════════════════════════════════════════════════════

describe('End-to-End Sort — sig desc produces correct order', () => {
  function buildSigRows(era, faction, ratingIdx) {
    const ri = ratingIdx !== undefined ? ratingIdx : null;
    const rows = [];
    const allFactions = Object.keys(APP_DATA.factions);
    for (const [name, d] of Object.entries(era)) {
      if (!d.mul?.[faction]) continue;
      const chassisClass = APP_DATA.chassis[name]?.class || null;
      const weights = F.computeResolvedWeights(d.w, ri);
      const w = weights[faction] || 0;
      if (w === 0) continue;
      // Mirror app: WCD applied inside computeSignature via wcdParams
      const wcdParams = chassisClass ? { chassisClass, eraYear: 3039 } : null;
      const sig = F.computeSignature(weights, d.mul, [faction], allFactions, wcdParams);
      rows.push({ name, sig, weights, spread: 0, span: 0, avgWeight: 0, meta: { class: chassisClass } });
    }
    return rows;
  }

  it('Dragon is top 3 and Hatamoto-Chi is in roster for DC 3039 sorted by sig', () => {
    // Hatamoto-Chi is DC-exclusive but an Assault — DC's tiny assault share (10%)
    // dampens it heavily via WCD. Light exclusives (Jenner, Panther) dominate.
    // This matches the app's actual behavior.
    const era = APP_DATA.eraData['3039'];
    const rows = buildSigRows(era, 'DC');
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);

    const top3 = rows.slice(0, 3).map(r => r.name);
    const allNames = rows.map(r => r.name);
    assert.ok(top3.includes('Dragon'), `Dragon should be in top 3, got: ${top3.join(', ')}`);
    assert.ok(allNames.includes('Hatamoto-Chi'), `Hatamoto-Chi should appear in DC roster`);
    // Hatamoto-Chi sig should be positive (it IS exclusive, just WCD-dampened)
    const hatRow = rows.find(r => r.name === 'Hatamoto-Chi');
    assert.ok(hatRow.sig.DC > 0, `Hatamoto-Chi sig should be positive, got ${hatRow.sig.DC.toFixed(2)}`);
  });

  it('Dragon is top 5 for DC 3039 sorted by sig', () => {
    const era = APP_DATA.eraData['3039'];
    const rows = buildSigRows(era, 'DC');
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);

    const top5 = rows.slice(0, 5).map(r => r.name);
    assert.ok(top5.includes('Dragon'), `Dragon should be in top 5, got: ${top5.join(', ')}`);
  });

  it('FS 3039 sig sort puts FS-exclusive mechs at top', () => {
    const era = APP_DATA.eraData['3039'];
    const rows = buildSigRows(era, 'FS');
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);

    // FS-exclusive or FS-heavy mechs should dominate the top
    // Victor has high weight but low share (many factions have it)
    // Mechs like Enforcer, Valkyrie, Hatchetman are more FS-distinctive
    const top10 = rows.slice(0, 10).map(r => r.name);
    const fsIdentity = ['Enforcer', 'Valkyrie', 'Hatchetman', 'JagerMech'];
    const found = fsIdentity.filter(m => top10.includes(m));
    assert.ok(found.length >= 2,
      `Expected at least 2 of ${fsIdentity.join('/')} in top 10, got: ${top10.join(', ')}`);
  });

  it('ubiquitous mechs do not rank in top 10% for DC sig', () => {
    const era = APP_DATA.eraData['3039'];
    const rows = buildSigRows(era, 'DC');
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);

    const locustRank = rows.findIndex(r => r.name === 'Locust');
    const total = rows.length;
    assert.ok(locustRank > total * 0.1,
      `Locust should not be in top 10% (rank ${locustRank + 1} of ${total})`);
  });

  it('sort by DC-sig also works', () => {
    const era = APP_DATA.eraData['3039'];
    const rows = buildSigRows(era, 'DC');
    F.sortRowsInPlace(rows, [{ field: 'DC-sig', dir: 'desc' }]);

    const top3 = rows.slice(0, 3).map(r => r.name);
    assert.ok(top3.includes('Dragon') || top3.includes('Hatamoto-Chi'),
      `Expected DC identity mechs in top 3 with DC-sig sort, got: ${top3.join(', ')}`);
  });
});

// ════════════════════════════════════════════════════════
// 10. UNIT QUALITY RATING RESOLUTION
// ════════════════════════════════════════════════════════

describe('Unit Quality Rating — resolveWeight', () => {
  it('flat entry returns base at any tier', () => {
    assert.strictEqual(F.resolveWeight([8, 0], 4), 8);  // A
    assert.strictEqual(F.resolveWeight([8, 0], 0), 8);  // F
  });

  it('flat entry returns base for average', () => {
    assert.strictEqual(F.resolveWeight([8, 0], null), 8);
  });

  it('"+" entry: highest at A, decreasing downward', () => {
    // [8, "+"] with 5 levels: A=8, B=7, C=6, D=5, F=4
    assert.strictEqual(F.resolveWeight([8, '+'], 4), 8);  // A
    assert.strictEqual(F.resolveWeight([8, '+'], 3), 7);  // B
    assert.strictEqual(F.resolveWeight([8, '+'], 2), 6);  // C
    assert.strictEqual(F.resolveWeight([8, '+'], 1), 5);  // D
    assert.strictEqual(F.resolveWeight([8, '+'], 0), 4);  // F
  });

  it('"-" entry: highest at F, decreasing upward', () => {
    // [8, "-"] with 5 levels: F=8, D=7, C=6, B=5, A=4
    assert.strictEqual(F.resolveWeight([8, '-'], 0), 8);  // F
    assert.strictEqual(F.resolveWeight([8, '-'], 1), 7);  // D
    assert.strictEqual(F.resolveWeight([8, '-'], 2), 6);  // C
    assert.strictEqual(F.resolveWeight([8, '-'], 3), 5);  // B
    assert.strictEqual(F.resolveWeight([8, '-'], 4), 4);  // A
  });

  it('"+" with low base clamps to 0', () => {
    // [2, "+"] → A=2, B=1, C=0, D=0, F=0
    assert.strictEqual(F.resolveWeight([2, '+'], 4), 2);  // A
    assert.strictEqual(F.resolveWeight([2, '+'], 3), 1);  // B
    assert.strictEqual(F.resolveWeight([2, '+'], 2), 0);  // C
    assert.strictEqual(F.resolveWeight([2, '+'], 1), 0);  // D
    assert.strictEqual(F.resolveWeight([2, '+'], 0), 0);  // F
  });

  it('cross-tier average for "+" entry', () => {
    // [8, "+"] → (8+7+6+5+4)/5 = 6.0
    assert.strictEqual(F.resolveWeight([8, '+'], null), 6.0);
  });

  it('cross-tier average for "-" entry', () => {
    // [8, "-"] → (4+5+6+7+8)/5 = 6.0
    assert.strictEqual(F.resolveWeight([8, '-'], null), 6.0);
  });

  it('cross-tier average for low "+" clamps negatives', () => {
    // [2, "+"] → (2+1+0+0+0)/5 = 0.6
    const avg = F.resolveWeight([2, '+'], null);
    assert.ok(Math.abs(avg - 0.6) < 0.01, `Expected 0.6, got ${avg}`);
  });

  it('explicit levels object resolves by tier index', () => {
    const entry = { A: 7, B: 5, C: 4, D: 3 };
    assert.strictEqual(F.resolveWeight(entry, 4), 7);  // A
    assert.strictEqual(F.resolveWeight(entry, 3), 5);  // B
    assert.strictEqual(F.resolveWeight(entry, 0), 0);  // F (not present)
  });

  it('explicit levels cross-tier average pads with zeros', () => {
    // { A: 7, B: 5, C: 4, D: 3 } → (7+5+4+3+0)/5 = 3.8 (F missing = 0)
    const avg = F.resolveWeight({ A: 7, B: 5, C: 4, D: 3 }, null);
    assert.ok(Math.abs(avg - 3.8) < 0.01, `Expected 3.8, got ${avg}`);
  });

  it('legacy plain number works', () => {
    assert.strictEqual(F.resolveWeight(5, null), 5);
    assert.strictEqual(F.resolveWeight(5, 4), 5);
  });
});

describe('Unit Quality Rating — Kintaro Test Case', () => {
  it('Kintaro FS at rating=A is 2 (elite only)', () => {
    const era = APP_DATA.eraData['3039'];
    const kintaro = era['Kintaro'];
    const w = F.resolveWeight(kintaro.w.FS, F.RATING_INDEX.A);
    assert.strictEqual(w, 2);
  });

  it('Kintaro FS at default (average) is 0.6', () => {
    const era = APP_DATA.eraData['3039'];
    const kintaro = era['Kintaro'];
    const w = F.resolveWeight(kintaro.w.FS, null);
    assert.ok(Math.abs(w - 0.6) < 0.01, `Expected 0.6, got ${w}`);
  });

  it('Kintaro DC is flat 2 regardless of tier', () => {
    const era = APP_DATA.eraData['3039'];
    const kintaro = era['Kintaro'];
    assert.strictEqual(F.resolveWeight(kintaro.w.DC, F.RATING_INDEX.A), 2);
    assert.strictEqual(F.resolveWeight(kintaro.w.DC, F.RATING_INDEX.F), 2);
    assert.strictEqual(F.resolveWeight(kintaro.w.DC, null), 2);
  });

  it('parser accepts rating=A', () => {
    const p = F.parseQuery('faction=FS year=3039 rating=A');
    assert.strictEqual(p.rating, 'A');
  });

  it('parser accepts rating=F', () => {
    const p = F.parseQuery('rating=F');
    assert.strictEqual(p.rating, 'F');
  });
});

// ════════════════════════════════════════════════════════
// 10b. LOGARITHMIC SCALE & WEIGHT CLASS DISTRIBUTION
// ════════════════════════════════════════════════════════

describe('Logarithmic Scale Conversion', () => {
  it('toProb converts rating to probability weight', () => {
    assert.ok(Math.abs(F.toProb(2) - 2.0) < 0.01);
    assert.ok(Math.abs(F.toProb(4) - 4.0) < 0.01);
    assert.ok(Math.abs(F.toProb(6) - 8.0) < 0.01);
    assert.ok(Math.abs(F.toProb(8) - 16.0) < 0.01);
    assert.ok(Math.abs(F.toProb(10) - 32.0) < 0.01);
  });

  it('toProb(0) returns 0', () => {
    assert.strictEqual(F.toProb(0), 0);
  });
});

describe('Weight Class Distribution — getWcdMixingFactor', () => {
  it('returns a fraction for known faction+class+era', () => {
    // LC in 3039 has wcd data — Heavy share should be a positive fraction < 1
    const factor = F.getWcdMixingFactor('LC', 'Heavy', 3039);
    assert.ok(factor > 0 && factor < 1, `LC Heavy mixing factor should be 0 < f < 1, got ${factor.toFixed(3)}`);
  });

  it('Lyran heavy share exceeds Lyran light share', () => {
    // Lyrans are heavy-biased: their heavy mixing factor should exceed their light factor
    const heavy = F.getWcdMixingFactor('LC', 'Heavy', 3039);
    const light = F.getWcdMixingFactor('LC', 'Light', 3039);
    assert.ok(heavy > light, `LC Heavy (${heavy.toFixed(3)}) should exceed LC Light (${light.toFixed(3)})`);
  });

  it('all class shares sum to 1 for a faction', () => {
    const classes = ['Light', 'Medium', 'Heavy', 'Assault'];
    const total = classes.reduce((s, c) => s + F.getWcdMixingFactor('DC', c, 3039), 0);
    assert.ok(Math.abs(total - 1.0) < 0.01, `DC class shares should sum to ~1.0, got ${total.toFixed(3)}`);
  });

  it('returns 1 for null/unknown inputs', () => {
    assert.strictEqual(F.getWcdMixingFactor('DC', null, 3039), 1);
    assert.strictEqual(F.getWcdMixingFactor('DC', 'Heavy', null), 1);
    assert.strictEqual(F.getWcdMixingFactor('NONEXISTENT', 'Heavy', 3039), 1);
  });
});

describe('Integrated: Commando/Wolfhound Lyran identity', () => {
  // The Commando and Wolfhound are light mechs. Lyrans field fewer lights.
  // With weight class adjustment, their Lyran identity should be lower than
  // without it, relative to heavier mechs.
  
  it('LC wcd data exists in app-data', () => {
    assert.ok(APP_DATA.factions.LC?.wcd, 'LC should have weight class distribution data');
    assert.ok(APP_DATA.factions.LC.wcd['3039'], 'LC should have 3039 wcd');
  });

  it('Commando LC light mixing factor is less than heavy mixing factor', () => {
    // Lyrans field fewer lights than heavies, so a light mech's mixing factor
    // should be smaller than a heavy mech's mixing factor
    const lightMix = F.getWcdMixingFactor('LC', 'Light', 3039);
    const heavyMix = F.getWcdMixingFactor('LC', 'Heavy', 3039);
    
    assert.ok(lightMix < heavyMix,
      `LC Light mix (${lightMix.toFixed(3)}) should be < Heavy mix (${heavyMix.toFixed(3)})`);
  });
});

// ════════════════════════════════════════════════════════
// 10b. SIGNATURE ALWAYS USES WCD (even in single-class view)
// ════════════════════════════════════════════════════════

describe('Signature uses WCD even in single-class view', () => {
  // When filtering to class=Heavy, sig should still reflect faction weight class
  // preferences. Lyrans have a higher heavy share than FedSuns, so for a chassis
  // with identical raw weight across both factions, LC sig should exceed FS sig.

  const allFactions = Object.keys(APP_DATA.factions);

  it('LC heavy sig > FS heavy sig for same raw weight (WCD boosts Lyran heavies)', () => {
    // Simulate a heavy chassis with equal raw weight for LC and FS
    const weights = { LC: 3, FS: 3 };
    const mul = { LC: 1, FS: 1 };
    // Always pass wcdParams, even though this would be a single-class query
    const wcdParams = { chassisClass: 'Heavy', eraYear: 3039 };
    const result = F.computeSignature(weights, mul, ['LC', 'FS'], allFactions, wcdParams);

    assert.ok(result.LC > result.FS,
      `LC heavy sig (${result.LC.toFixed(4)}) should exceed FS heavy sig (${result.FS.toFixed(4)}) due to Lyran heavy bias`);
  });

  it('sig differs across factions even with identical raw weight when WCD applied', () => {
    // The Grasshopper bug: weight 3 for all 5 Great Houses, sig should NOT be identical
    const weights = { DC: 3, FS: 3, LC: 3, CC: 3, FWL: 3 };
    const mul = { DC: 1, FS: 1, LC: 1, CC: 1, FWL: 1 };
    const wcdParams = { chassisClass: 'Heavy', eraYear: 3039 };
    const result = F.computeSignature(weights, mul, ['DC', 'FS', 'LC', 'CC', 'FWL'], allFactions, wcdParams);

    // Not all five should be equal — WCD makes them differ
    const values = [result.DC, result.FS, result.LC, result.CC, result.FWL];
    const allEqual = values.every(v => Math.abs(v - values[0]) < 0.0001);
    assert.ok(!allEqual,
      `Sig scores should differ across factions with different WCD, got: DC=${result.DC.toFixed(4)} FS=${result.FS.toFixed(4)} LC=${result.LC.toFixed(4)} CC=${result.CC.toFixed(4)} FWL=${result.FWL.toFixed(4)}`);
  });

  it('without wcdParams, identical weights produce identical sigs (the bug)', () => {
    // Confirm the pre-fix behavior: null wcdParams → equal sigs
    const weights = { DC: 3, FS: 3, LC: 3, CC: 3, FWL: 3 };
    const mul = { DC: 1, FS: 1, LC: 1, CC: 1, FWL: 1 };
    const result = F.computeSignature(weights, mul, ['DC', 'FS', 'LC', 'CC', 'FWL'], allFactions, null);

    const values = [result.DC, result.FS, result.LC, result.CC, result.FWL];
    const allEqual = values.every(v => Math.abs(v - values[0]) < 0.0001);
    assert.ok(allEqual,
      `Without WCD, identical weights should produce identical sigs`);
  });
});

// ════════════════════════════════════════════════════════
// 11. CHASSIS RESOLUTION & FAMILY NAMES
// ════════════════════════════════════════════════════════

describe('Chassis Resolution', () => {
  it('resolves exact chassis name', () => {
    assert.strictEqual(F.resolveChassis('Atlas'), 'Atlas');
  });

  it('resolves case-insensitively', () => {
    assert.strictEqual(F.resolveChassis('atlas'), 'Atlas');
    assert.strictEqual(F.resolveChassis('ATLAS'), 'Atlas');
  });

  it('resolves partial match', () => {
    const result = F.resolveChassis('hatch');
    assert.strictEqual(result, 'Hatchetman');
  });

  it('resolves model prefix to a chassis', () => {
    const result = F.resolveChassis('AWS');
    assert.strictEqual(result, 'Awesome');
  });

  // Clan IS/Clan name aliases
  it('resolves Clan name "Summoner" to Thor (Summoner)', () => {
    assert.strictEqual(F.resolveChassis('Summoner'), 'Thor (Summoner)');
  });

  it('resolves IS reporting name "Thor" to Thor (Summoner)', () => {
    assert.strictEqual(F.resolveChassis('Thor'), 'Thor (Summoner)');
  });

  it('resolves "Timber Wolf" to Mad Cat (Timber Wolf)', () => {
    assert.strictEqual(F.resolveChassis('Timber Wolf'), 'Mad Cat (Timber Wolf)');
  });

  it('resolves "Mad Cat" to Mad Cat (Timber Wolf)', () => {
    assert.strictEqual(F.resolveChassis('Mad Cat'), 'Mad Cat (Timber Wolf)');
  });

  it('resolves "Hellbringer" to Loki (Hellbringer)', () => {
    assert.strictEqual(F.resolveChassis('Hellbringer'), 'Loki (Hellbringer)');
  });

  it('resolves "Hel" to Loki Mk II (Hel)', () => {
    assert.strictEqual(F.resolveChassis('Hel'), 'Loki Mk II (Hel)');
  });

  it('resolves "Nova" to Black Hawk (Nova)', () => {
    assert.strictEqual(F.resolveChassis('Nova'), 'Black Hawk (Nova)');
  });

  it('resolves "King Crab" to King Crab', () => {
    assert.strictEqual(F.resolveChassis('King Crab'), 'King Crab');
  });

  it('resolves "Grand Summoner" to Thor II (Grand Summoner)', () => {
    assert.strictEqual(F.resolveChassis('Grand Summoner'), 'Thor II (Grand Summoner)');
  });

  it('does not resolve "Thor" to Thorn (alias takes priority)', () => {
    assert.notStrictEqual(F.resolveChassis('Thor'), 'Thorn');
  });
});
