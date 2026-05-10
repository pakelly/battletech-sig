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
        scopedPref,
        computeSpread,
        computeSpan,
        computeAvgPref,
        computeSignature,
        assignTier,
        compareOp,
        sortRowsInPlace,
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
    assert.ok(p.factions.includes('LA'));
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

  it('parses tons filter', () => {
    const p = F.parseQuery('tons>50');
    assert.deepStrictEqual(p.tons, { op: '>', val: 50 });
  });

  it('parses faction-specific pref filter', () => {
    const p = F.parseQuery('DC-pref>8');
    assert.strictEqual(p.factionPref.length, 1);
    assert.strictEqual(p.factionPref[0].faction, 'DC');
    assert.strictEqual(p.factionPref[0].op, '>');
    assert.strictEqual(p.factionPref[0].val, 8);
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

  it('parses sort by faction preference', () => {
    const p = F.parseQuery('sort by DC preference desc');
    assert.strictEqual(p.sort[0].field, 'DC-preference');
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
    assert.strictEqual(p.class, 'heavy');
    assert.strictEqual(p.sort[0].field, 'spread');
  });
});

// ════════════════════════════════════════════════════════
// 2. SCOPED PREFERENCE
// ════════════════════════════════════════════════════════

describe('Scoped Preference', () => {
  it('returns 10 for highest, 1 for lowest', () => {
    const result = F.scopedPref({ DC: 8, FS: 2 }, ['DC', 'FS']);
    assert.ok(Math.abs(result.DC - 10) < 0.01);
    assert.ok(Math.abs(result.FS - 1) < 0.01);
  });

  it('includes zeros — exclusive mech scores 10', () => {
    const result = F.scopedPref({ DC: 6, FS: 0 }, ['DC', 'FS']);
    assert.ok(Math.abs(result.DC - 10) < 0.01);
    assert.ok(Math.abs(result.FS - 1) < 0.01);
  });

  it('equal weights produce 5.0 for all', () => {
    const result = F.scopedPref({ DC: 5, FS: 5, FWL: 5 }, ['DC', 'FS', 'FWL']);
    assert.ok(Math.abs(result.DC - 5) < 0.01);
    assert.ok(Math.abs(result.FS - 5) < 0.01);
  });

  it('returns null when no faction has weight', () => {
    const result = F.scopedPref({ DC: 0, FS: 0 }, ['DC', 'FS']);
    assert.strictEqual(result, null);
  });

  it('missing faction treated as zero', () => {
    const result = F.scopedPref({ DC: 8 }, ['DC', 'FS']);
    assert.ok(Math.abs(result.DC - 10) < 0.01);
    assert.ok(Math.abs(result.FS - 1) < 0.01);
  });
});

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

  it('computeAvgPref averages non-zero preferences', () => {
    const prefs = { DC: 10, FS: 1, FWL: 4 };
    const avg = F.computeAvgPref(prefs, ['DC', 'FS', 'FWL']);
    assert.ok(Math.abs(avg - 5) < 0.01);
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

describe('Global Signature (weight × share)', () => {
  it('exclusive mech: share = 100%, sig = weight', () => {
    // Only DC has it at weight 6
    const weights = { DC: 6 };
    const mulData = { DC: 1 };
    const result = F.computeSignature(weights, mulData, ['DC']);
    assert.ok(Math.abs(result.DC - 6.0) < 0.01, `Expected 6.0, got ${result.DC}`);
  });

  it('shared mech: sig = weight × share', () => {
    // DC:8, FS:5, MERC:4 → total 17, DC share = 8/17
    const weights = { DC: 8, FS: 5, MERC: 4 };
    const mulData = { DC: 1, FS: 1, MERC: 1 };
    const result = F.computeSignature(weights, mulData, ['DC']);
    const expected = 8 * (8 / 17);
    assert.ok(Math.abs(result.DC - expected) < 0.01, `Expected ${expected.toFixed(2)}, got ${result.DC}`);
  });

  it('exclusive mech scores higher than shared mech at same weight', () => {
    const exclW = { DC: 6 };
    const exclMul = { DC: 1 };
    const sharedW = { DC: 6, FS: 6, FWL: 5, LA: 8, CC: 4 };
    const sharedMul = { DC: 1, FS: 1, FWL: 1, LA: 1, CC: 1 };

    const excl = F.computeSignature(exclW, exclMul, ['DC']);
    const shared = F.computeSignature(sharedW, sharedMul, ['DC']);
    assert.ok(excl.DC > shared.DC, `Exclusive (${excl.DC}) should be > shared (${shared.DC})`);
  });

  it('higher weight exclusive beats lower weight exclusive', () => {
    const high = F.computeSignature({ DC: 8 }, { DC: 1 }, ['DC']);
    const low = F.computeSignature({ DC: 3 }, { DC: 1 }, ['DC']);
    assert.ok(high.DC > low.DC, `Weight 8 (${high.DC}) should be > weight 3 (${low.DC})`);
  });

  it('returns 0 for factions without MUL confirmation', () => {
    const result = F.computeSignature({ DC: 6, FS: 6 }, { DC: 1 }, ['DC', 'FS']);
    assert.strictEqual(result.FS, 0);
  });

  it('high weight + low share can beat low weight + high share', () => {
    // Dragon: DC:8 out of 17 total = 3.76
    // Hatamoto-Ku: DC:2 out of 2 total = 2.00
    const dragon = F.computeSignature({ DC: 8, FRR: 5, MERC: 4 }, { DC: 1, FRR: 1, MERC: 1 }, ['DC']);
    const hatKu = F.computeSignature({ DC: 2 }, { DC: 1 }, ['DC']);
    assert.ok(dragon.DC > hatKu.DC, `Dragon (${dragon.DC}) should be > Hatamoto-Ku (${hatKu.DC})`);
  });
});

describe('Signature Tiers', () => {
  it('assigns tier 1 to top 20% (most iconic)', () => {
    // 10 items, sorted desc. Top 2 should be tier 1.
    const values = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    assert.strictEqual(F.assignTier(0, values.length), 1);
    assert.strictEqual(F.assignTier(1, values.length), 1);
  });

  it('assigns tier 5 to bottom 20% (incidental)', () => {
    const values = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    assert.strictEqual(F.assignTier(8, values.length), 5);
    assert.strictEqual(F.assignTier(9, values.length), 5);
  });

  it('assigns tier 3 to middle', () => {
    const values = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    assert.strictEqual(F.assignTier(4, values.length), 3);
    assert.strictEqual(F.assignTier(5, values.length), 3);
  });

  it('handles single item', () => {
    assert.strictEqual(F.assignTier(0, 1), 1);
  });
});

// ════════════════════════════════════════════════════════
// 5. GLOBAL SIGNATURE — REAL DATA VALIDATION
// ════════════════════════════════════════════════════════

describe('Global Signature — Real Data (DC 3039)', () => {
  let dcSigs; // { chassisName: rawSigScore }

  before(() => {
    const era = APP_DATA.eraData['3039'];
    dcSigs = {};
    for (const [name, d] of Object.entries(era)) {
      if (!d.mul?.DC) continue;
      const dcW = d.w.DC || 0;
      if (dcW === 0) continue;
      const result = F.computeSignature(d.w, d.mul, ['DC']);
      dcSigs[name] = result.DC;
    }
  });

  it('Hatamoto-Chi is DC-exclusive (sig = weight)', () => {
    assert.ok(Math.abs(dcSigs['Hatamoto-Chi'] - 6.0) < 0.01, `Hatamoto-Chi: ${dcSigs['Hatamoto-Chi']}`);
  });

  it('Hatamoto-Chi scores higher than Dragon (exclusive vs shared)', () => {
    assert.ok(dcSigs['Hatamoto-Chi'] > dcSigs['Dragon'],
      `Hatamoto-Chi (${dcSigs['Hatamoto-Chi']}) should be > Dragon (${dcSigs['Dragon']})`);
  });

  it('Dragon scores higher than Griffin (semi-exclusive vs ubiquitous)', () => {
    assert.ok(dcSigs['Dragon'] > dcSigs['Griffin'],
      `Dragon (${dcSigs['Dragon']}) should be > Griffin (${dcSigs['Griffin']})`);
  });

  it('Dragon scores higher than Locust', () => {
    assert.ok(dcSigs['Dragon'] > dcSigs['Locust'],
      `Dragon (${dcSigs['Dragon']}) should be > Locust (${dcSigs['Locust']})`);
  });

  it('Dragon scores higher than Exterminator (weight matters)', () => {
    assert.ok(dcSigs['Dragon'] > dcSigs['Exterminator'],
      `Dragon (${dcSigs['Dragon']}) should be > Exterminator (${dcSigs['Exterminator']})`);
  });

  it('Grand Dragon scores higher than Panther (higher share)', () => {
    // Grand Dragon: DC:6, mostly DC. Panther: DC:8, widely shared.
    assert.ok(dcSigs['Grand Dragon'] > dcSigs['Panther'],
      `Grand Dragon (${dcSigs['Grand Dragon']}) should be > Panther (${dcSigs['Panther']})`);
  });
});

// ════════════════════════════════════════════════════════
// 6. SORT FUNCTIONS
// ════════════════════════════════════════════════════════

describe('sortRowsInPlace', () => {
  it('sorts by sig desc', () => {
    const rows = [
      { name: 'Locust', sig: { DC: 3 }, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
      { name: 'Dragon', sig: { DC: 10 }, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
      { name: 'Griffin', sig: { DC: 7 }, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
    ];
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);
    assert.strictEqual(rows[0].name, 'Dragon');
    assert.strictEqual(rows[1].name, 'Griffin');
    assert.strictEqual(rows[2].name, 'Locust');
  });

  it('sorts by DC-sig desc', () => {
    const rows = [
      { name: 'Locust', sig: { DC: 3 }, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
      { name: 'Dragon', sig: { DC: 10 }, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
      { name: 'Griffin', sig: { DC: 7 }, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
    ];
    F.sortRowsInPlace(rows, [{ field: 'DC-sig', dir: 'desc' }]);
    assert.strictEqual(rows[0].name, 'Dragon');
    assert.strictEqual(rows[2].name, 'Locust');
  });

  it('sorts by spread desc', () => {
    const rows = [
      { name: 'A', spread: 2, sig: null, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
      { name: 'B', spread: 8, sig: null, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
      { name: 'C', spread: 5, sig: null, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
    ];
    F.sortRowsInPlace(rows, [{ field: 'spread', dir: 'desc' }]);
    assert.strictEqual(rows[0].name, 'B');
    assert.strictEqual(rows[2].name, 'A');
  });

  it('sorts by tons asc', () => {
    const rows = [
      { name: 'Atlas', meta: { tons: 100 }, sig: null, spread: 0, span: 0, avgPref: 0, weights: {}, prefs: {} },
      { name: 'Locust', meta: { tons: 20 }, sig: null, spread: 0, span: 0, avgPref: 0, weights: {}, prefs: {} },
      { name: 'Griffin', meta: { tons: 55 }, sig: null, spread: 0, span: 0, avgPref: 0, weights: {}, prefs: {} },
    ];
    F.sortRowsInPlace(rows, [{ field: 'tons', dir: 'asc' }]);
    assert.strictEqual(rows[0].name, 'Locust');
    assert.strictEqual(rows[2].name, 'Atlas');
  });

  it('sorts by DC-preference desc', () => {
    const rows = [
      { name: 'A', prefs: { DC: 3 }, sig: null, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {} },
      { name: 'B', prefs: { DC: 10 }, sig: null, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {} },
      { name: 'C', prefs: { DC: 7 }, sig: null, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {} },
    ];
    F.sortRowsInPlace(rows, [{ field: 'DC-preference', dir: 'desc' }]);
    assert.strictEqual(rows[0].name, 'B');
  });

  it('handles null sig gracefully', () => {
    const rows = [
      { name: 'A', sig: null, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
      { name: 'B', sig: { DC: 10 }, spread: 0, span: 0, avgPref: 0, meta: {}, weights: {}, prefs: {} },
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
  const filterableFields = ['spread', 'span', 'avg-pref', 'weight', 'sig', 'tons'];

  for (const field of filterableFields) {
    it(`${field} works as both filter and sort`, () => {
      // Test filter parsing
      const filterQ = F.parseQuery(`${field}>5`);
      const filterField = field === 'avg-pref' ? 'avgPref' : field;
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
      const sig = F.computeSignature(d.w, d.mul, [faction]);
      rows.push({ name, sig, weights: d.w, prefs: {}, spread: 0, span: 0, avgPref: 0, meta: {} });
    }
    return rows;
  }

  it('Hatamoto-Chi is #1 for DC 3039 sorted by sig', () => {
    const era = APP_DATA.eraData['3039'];
    const rows = buildSigRows(era, 'DC');
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);

    assert.strictEqual(rows[0].name, 'Hatamoto-Chi',
      `Expected Hatamoto-Chi first, got ${rows[0].name} (sig: ${rows[0].sig?.DC})`);
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

    assert.strictEqual(rows[0].name, 'Hatamoto-Chi',
      `Expected Hatamoto-Chi first with DC-sig sort, got ${rows[0].name}`);
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
