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
        computeGlobalSignature,
        compareOp,
        sortRowsInPlace,
        resolveFaction,
        resolveFactionGroup,
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

describe('Global Signature', () => {
  it('exclusive + high weight = 10.0', () => {
    // Dragon: DC has 8, only DC has MUL confirmation
    const weights = { DC: 8, FS: 0 };
    const mulData = { DC: 1 };
    const allFactions = ['DC', 'FS', 'FWL', 'LA', 'CC'];
    const fwr = { DC: { min: 1, max: 8 } };
    const result = F.computeGlobalSignature(weights, mulData, allFactions, fwr, ['DC']);
    assert.ok(Math.abs(result.DC - 10.0) < 0.01, `Expected 10.0, got ${result.DC}`);
  });

  it('shared mech scores lower than exclusive mech', () => {
    // Shared mech: everyone has it
    const sharedWeights = { DC: 6, FS: 6, FWL: 5, LA: 8, CC: 4 };
    const sharedMul = { DC: 1, FS: 1, FWL: 1, LA: 1, CC: 1 };
    // Exclusive mech: only DC
    const exclWeights = { DC: 6 };
    const exclMul = { DC: 1 };

    const allFactions = ['DC', 'FS', 'FWL', 'LA', 'CC'];
    const fwr = { DC: { min: 1, max: 8 } };

    const shared = F.computeGlobalSignature(sharedWeights, sharedMul, allFactions, fwr, ['DC']);
    const excl = F.computeGlobalSignature(exclWeights, exclMul, allFactions, fwr, ['DC']);
    assert.ok(excl.DC > shared.DC, `Exclusive (${excl.DC}) should be > shared (${shared.DC})`);
  });

  it('low weight exclusive scores lower than high weight exclusive', () => {
    const allFactions = ['DC', 'FS', 'FWL', 'LA', 'CC'];
    const fwr = { DC: { min: 1, max: 8 } };

    const highW = F.computeGlobalSignature({ DC: 8 }, { DC: 1 }, allFactions, fwr, ['DC']);
    const lowW = F.computeGlobalSignature({ DC: 3 }, { DC: 1 }, allFactions, fwr, ['DC']);
    assert.ok(highW.DC > lowW.DC, `High weight (${highW.DC}) should be > low weight (${lowW.DC})`);
  });

  it('returns 0 for factions without MUL confirmation', () => {
    const result = F.computeGlobalSignature({ DC: 6, FS: 6 }, { DC: 1 }, ['DC', 'FS'], { DC: { min: 1, max: 8 } }, ['DC', 'FS']);
    assert.strictEqual(result.FS, 0);
  });
});

// ════════════════════════════════════════════════════════
// 5. GLOBAL SIGNATURE — REAL DATA VALIDATION
// ════════════════════════════════════════════════════════

describe('Global Signature — Real Data (DC 3039)', () => {
  let dcSigs; // { chassisName: sigScore }

  before(() => {
    const era = APP_DATA.eraData['3039'];
    const allFactions = [];
    const seen = new Set();
    for (const [, d] of Object.entries(era)) {
      for (const f of Object.keys(d.mul || {})) {
        if (!seen.has(f)) { seen.add(f); allFactions.push(f); }
      }
    }

    const fwr = {};
    for (const [, d] of Object.entries(era)) {
      const mul = d.mul || {};
      for (const f of Object.keys(mul)) {
        const w = d.w[f] || 0;
        if (w > 0) {
          if (!fwr[f]) fwr[f] = { min: w, max: w };
          else { fwr[f].min = Math.min(fwr[f].min, w); fwr[f].max = Math.max(fwr[f].max, w); }
        }
      }
    }

    dcSigs = {};
    for (const [name, d] of Object.entries(era)) {
      if (!d.mul?.DC) continue;
      const dcW = d.w.DC || 0;
      if (dcW === 0) continue;
      const result = F.computeGlobalSignature(d.w, d.mul, allFactions, fwr, ['DC']);
      dcSigs[name] = result.DC;
    }
  });

  it('Dragon scores 10.0', () => {
    assert.ok(Math.abs(dcSigs['Dragon'] - 10.0) < 0.01, `Dragon: ${dcSigs['Dragon']}`);
  });

  it('Panther scores 10.0', () => {
    assert.ok(Math.abs(dcSigs['Panther'] - 10.0) < 0.01, `Panther: ${dcSigs['Panther']}`);
  });

  it('Hatamoto-Chi scores higher than Griffin', () => {
    assert.ok(dcSigs['Hatamoto-Chi'] > dcSigs['Griffin'],
      `Hatamoto-Chi (${dcSigs['Hatamoto-Chi']}) should be > Griffin (${dcSigs['Griffin']})`);
  });

  it('Dragon scores higher than Locust', () => {
    assert.ok(dcSigs['Dragon'] > dcSigs['Locust'],
      `Dragon (${dcSigs['Dragon']}) should be > Locust (${dcSigs['Locust']})`);
  });

  it('Dragon scores higher than Exterminator', () => {
    assert.ok(dcSigs['Dragon'] > dcSigs['Exterminator'],
      `Dragon (${dcSigs['Dragon']}) should be > Exterminator (${dcSigs['Exterminator']})`);
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
  it('Victor is #1 for FS 3039 sorted by sig', () => {
    const era = APP_DATA.eraData['3039'];
    const factions = ['FS'];

    // Build all era factions
    const allFactions = [];
    const seen = new Set();
    for (const [, d] of Object.entries(era)) {
      for (const f of Object.keys(d.mul || {})) {
        if (!seen.has(f)) { seen.add(f); allFactions.push(f); }
      }
    }

    // Build weight ranges
    const fwr = {};
    for (const [, d] of Object.entries(era)) {
      const mul = d.mul || {};
      for (const f of Object.keys(mul)) {
        const w = d.w[f] || 0;
        if (w > 0) {
          if (!fwr[f]) fwr[f] = { min: w, max: w };
          else { fwr[f].min = Math.min(fwr[f].min, w); fwr[f].max = Math.max(fwr[f].max, w); }
        }
      }
    }

    // Build rows with sig
    const rows = [];
    for (const [name, d] of Object.entries(era)) {
      if (!d.mul?.FS) continue;
      const w = d.w.FS || 0;
      if (w === 0) continue;
      const sig = F.computeGlobalSignature(d.w, d.mul, allFactions, fwr, factions);
      rows.push({ name, sig, weights: d.w, prefs: {}, spread: 0, span: 0, avgPref: 0, meta: {} });
    }

    // Sort by sig desc
    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);

    assert.strictEqual(rows[0].name, 'Victor', `Expected Victor first, got ${rows[0].name} (sig: ${rows[0].sig?.FS})`);
    assert.ok(rows[0].sig.FS > rows[1].sig.FS, 'Victor sig should be highest');
  });

  it('Dragon is #1 for DC 3039 sorted by sig', () => {
    const era = APP_DATA.eraData['3039'];
    const factions = ['DC'];

    const allFactions = [...new Set(Object.values(era).flatMap(d => Object.keys(d.mul || {})))];
    const fwr = {};
    for (const [, d] of Object.entries(era)) {
      for (const f of Object.keys(d.mul || {})) {
        const w = d.w[f] || 0;
        if (w > 0) {
          if (!fwr[f]) fwr[f] = { min: w, max: w };
          else { fwr[f].min = Math.min(fwr[f].min, w); fwr[f].max = Math.max(fwr[f].max, w); }
        }
      }
    }

    const rows = [];
    for (const [name, d] of Object.entries(era)) {
      if (!d.mul?.DC) continue;
      const w = d.w.DC || 0;
      if (w === 0) continue;
      const sig = F.computeGlobalSignature(d.w, d.mul, allFactions, fwr, factions);
      rows.push({ name, sig, weights: d.w, prefs: {}, spread: 0, span: 0, avgPref: 0, meta: {} });
    }

    F.sortRowsInPlace(rows, [{ field: 'sig', dir: 'desc' }]);

    // Dragon or Panther should be #1 (both score 10.0)
    assert.ok(
      rows[0].name === 'Dragon' || rows[0].name === 'Panther',
      `Expected Dragon or Panther first, got ${rows[0].name}`
    );
    assert.ok(Math.abs(rows[0].sig.DC - 10.0) < 0.01);
  });
});
