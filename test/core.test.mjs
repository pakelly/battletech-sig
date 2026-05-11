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
      const dcW = d.w.DC || 0;
      if (dcW === 0) continue;
      const result = F.computeSignature(d.w, d.mul, ['DC'], allFactions);
      dcSigs[name] = result.DC;
    }
  });

  it('Hatamoto-Chi has high DC sig (exclusive)', () => {
    assert.ok(dcSigs['Hatamoto-Chi'] > 20, `Hatamoto-Chi should score high, got ${dcSigs['Hatamoto-Chi']?.toFixed(2)}`);
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
    const dcMechs = Object.entries(era).filter(([, d]) => d.mul?.DC && d.w.DC > 0);
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
  function buildSigRows(era, faction) {
    const rows = [];
    for (const [name, d] of Object.entries(era)) {
      if (!d.mul?.[faction]) continue;
      const w = d.w[faction] || 0;
      if (w === 0) continue;
      const allFactions = Object.keys(APP_DATA.factions);
      const sig = F.computeSignature(d.w, d.mul, [faction], allFactions);
      rows.push({ name, sig, weights: d.w, spread: 0, span: 0, avgWeight: 0, meta: {} });
    }
    return rows;
  }

  it('Dragon and Hatamoto-Chi are top 3 for DC 3039 sorted by sig', () => {
    const era = APP_DATA.eraData['3039'];
    const rows = buildSigRows(era, 'DC');
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);

    const top3 = rows.slice(0, 3).map(r => r.name);
    assert.ok(top3.includes('Dragon'), `Dragon should be in top 3, got: ${top3.join(', ')}`);
    assert.ok(top3.includes('Hatamoto-Chi'), `Hatamoto-Chi should be in top 3, got: ${top3.join(', ')}`);
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

  it('ubiquitous mechs rank in bottom 60% for DC sig', () => {
    const era = APP_DATA.eraData['3039'];
    const rows = buildSigRows(era, 'DC');
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);

    const locustRank = rows.findIndex(r => r.name === 'Locust');
    const total = rows.length;
    assert.ok(locustRank > total * 0.4,
      `Locust should be in bottom 60% (rank ${locustRank + 1} of ${total})`);
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
});
