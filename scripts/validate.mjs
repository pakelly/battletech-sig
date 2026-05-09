#!/usr/bin/env node
/**
 * validate.mjs — Run validation tests against app-data.json
 * Tests the new scoped preference + spread model.
 */

import fs from 'fs';
import path from 'path';

const BASE = path.resolve(import.meta.dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(BASE, 'app', 'app-data.json'), 'utf8'));

// ── Core functions (mirrors app.js) ───────────────────────────────────────
function fw(fEntry) { return fEntry ? fEntry[0] : 0; }

function scopedPreference(weights, scopedFactions) {
  const vals = [];
  const fks = [];
  for (const f of scopedFactions) {
    const w = fw(weights[f]);
    if (w > 0) { vals.push(w); fks.push(f); }
  }
  if (vals.length === 0) return null;
  if (vals.length === 1) return { [fks[0]]: 10 };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max === min) {
    const result = {};
    for (const f of fks) result[f] = 5;
    return result;
  }
  const result = {};
  for (let i = 0; i < fks.length; i++) {
    const w = fw(weights[fks[i]]);
    result[fks[i]] = 1 + 9 * (w - min) / (max - min);
  }
  return result;
}

function computeSpread(prefs, scopedFactions) {
  if (!prefs) return 0;
  const prefVals = Object.values(prefs);
  if (prefVals.length === 0) return 0;
  const absentCount = scopedFactions ? scopedFactions.length - prefVals.length : 0;
  const effectiveMin = absentCount > 0 ? 0 : Math.min(...prefVals);
  return Math.max(...prefVals) - effectiveMin;
}

function getSource(era, useFamily = true) {
  const eraData = DATA.eras[era];
  const source = { ...eraData.individual };
  if (useFamily) {
    for (const [groupName, famEntry] of Object.entries(eraData.family)) {
      for (const member of famEntry.members) delete source[member];
      source[groupName] = famEntry;
    }
  }
  return source;
}

// ── Test helpers ──────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

// ══════════════════════════════════════════════════════════════════════════
// TEST 1: faction=(DC OR FS) era=3049
// Dragon should have high spread, Locust low spread
// ══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 1: faction=(DC OR FS) era=3049 ═══');
{
  const source = getSource('3049');
  const factions = ['DC', 'FS'];

  // Dragon Family (family mode)
  const dragonFam = source['Dragon Family'];
  if (dragonFam) {
    const prefs = scopedPreference(dragonFam.f, factions);
    const spread = computeSpread(prefs, factions);
    console.log(`  Dragon Family: DC pref=${prefs?.DC?.toFixed(1)}, FS pref=${prefs?.FS?.toFixed(1)}, spread=${spread.toFixed(1)}`);
    console.log(`    Raw weights: DC=${fw(dragonFam.f.DC)}, FS=${fw(dragonFam.f.FS)}`);
    assert(spread > 3, `Dragon Family spread (${spread.toFixed(1)}) should be high (>3)`);
    assert(prefs?.DC > (prefs?.FS || 0), 'DC should prefer Dragon Family more than FS');
  } else {
    // Try individual Dragon
    const dragon = source['Dragon'];
    if (dragon) {
      const prefs = scopedPreference(dragon.f, factions);
      const spread = computeSpread(prefs, factions);
      console.log(`  Dragon: DC pref=${prefs?.DC?.toFixed(1)}, FS pref=${prefs?.FS?.toFixed(1)}, spread=${spread.toFixed(1)}`);
      console.log(`    Raw weights: DC=${fw(dragon.f.DC)}, FS=${fw(dragon.f.FS)}`);
      assert(spread > 3, `Dragon spread (${spread.toFixed(1)}) should be high (>3)`);
    } else {
      console.log('  ⚠️  Neither Dragon Family nor Dragon found in era 3049');
    }
  }

  const locustFam = source['Locust Family'] || source['Locust'];
  if (locustFam) {
    const prefs = scopedPreference(locustFam.f, factions);
    const spread = computeSpread(prefs, factions);
    const name = source['Locust Family'] ? 'Locust Family' : 'Locust';
    console.log(`  ${name}: DC pref=${prefs?.DC?.toFixed(1)}, FS pref=${prefs?.FS?.toFixed(1)}, spread=${spread.toFixed(1)}`);
    console.log(`    Raw weights: DC=${fw(locustFam.f.DC)}, FS=${fw(locustFam.f.FS)}`);
    assert(spread < 5, `${name} spread (${spread.toFixed(1)}) should be lower than Dragon's`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TEST 2: faction=GreatHouses chassis=Awesome era=3049
// FWL should have scoped preference 10
// ══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 2: faction=GreatHouses chassis=Awesome era=3049 ═══');
{
  const source = getSource('3049');
  const factions = ['DC', 'FS', 'FWL', 'LA', 'CC'];
  const awesome = source['Awesome'];
  if (awesome) {
    const prefs = scopedPreference(awesome.f, factions);
    const spread = computeSpread(prefs, factions);
    console.log('  Awesome scoped preferences:');
    for (const fk of factions) {
      console.log(`    ${fk}: pref=${prefs?.[fk]?.toFixed(1) || 'N/A'}, weight=${fw(awesome.f[fk])}`);
    }
    console.log(`  Spread: ${spread.toFixed(1)}`);
    
    // FWL should be highest
    const fwlPref = prefs?.FWL || 0;
    const maxPref = prefs ? Math.max(...Object.values(prefs)) : 0;
    assert(fwlPref === maxPref || Math.abs(fwlPref - maxPref) < 0.1, `FWL should have highest pref (${fwlPref.toFixed(1)} vs max ${maxPref.toFixed(1)})`);
    assert(spread > 2 && spread < 9.5, `Spread should be moderate (got ${spread.toFixed(1)})`);
  } else {
    console.log('  ⚠️  Awesome not found');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TEST 3: faction=DC era=3049 (single faction)
// Should show DC's mechs ranked by weight
// ══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 3: faction=DC era=3049 (single faction) ═══');
{
  const source = getSource('3049');
  const fk = 'DC';
  
  const dcMechs = Object.entries(source)
    .filter(([, data]) => fw(data.f[fk]) > 0)
    .map(([name, data]) => ({ name, weight: fw(data.f[fk]) }))
    .sort((a, b) => b.weight - a.weight);
  
  console.log(`  DC has ${dcMechs.length} chassis in era 3049`);
  console.log('  Top 15 by weight:');
  for (const ch of dcMechs.slice(0, 15)) {
    console.log(`    ${ch.name}: ${ch.weight}`);
  }
  
  assert(dcMechs.length > 50, `DC should have many chassis (got ${dcMechs.length})`);
  
  // Dragon family should appear high
  const dragonRank = dcMechs.findIndex(c => c.name.includes('Dragon'));
  assert(dragonRank >= 0, `Dragon should appear in DC's roster (rank: ${dragonRank + 1})`);
}

// ══════════════════════════════════════════════════════════════════════════
// TEST 4: chassis=Awesome era=3039 (no faction scope)
// Should list all factions with weights, FWL highest
// ══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 4: chassis=Awesome era=3039 (no faction scope) ═══');
{
  const source = getSource('3039');
  const awesome = source['Awesome'];
  if (awesome) {
    const factionWeights = Object.entries(awesome.f)
      .map(([fk, fd]) => ({ fk, weight: fw(fd) }))
      .filter(e => e.weight > 0)
      .sort((a, b) => b.weight - a.weight);
    
    console.log(`  Awesome fielded by ${factionWeights.length} factions in era 3039`);
    console.log('  Top 10 by weight:');
    for (const e of factionWeights.slice(0, 10)) {
      console.log(`    ${e.fk} (${DATA.factions[e.fk]?.name || '?'}): ${e.weight}`);
    }
    
    assert(factionWeights.length > 5, `Awesome should be fielded by many factions (got ${factionWeights.length})`);
    assert(factionWeights[0].fk === 'FWL' || factionWeights.some(e => e.fk === 'FWL' && e.weight >= factionWeights[0].weight * 0.9), 
      `FWL should be top or near-top (top is ${factionWeights[0].fk} with weight ${factionWeights[0].weight})`);
  } else {
    console.log('  ⚠️  Awesome not found in era 3039');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TEST 5: faction=(DC OR FS) spread>5 sort by spread desc era=3049
// Should show only mechs with big faction differences
// ══════════════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 5: faction=(DC OR FS) spread>5 sort by spread desc era=3049 ═══');
{
  const source = getSource('3049');
  const factions = ['DC', 'FS'];
  
  const highSpread = Object.entries(source)
    .map(([name, data]) => {
      const prefs = scopedPreference(data.f, factions);
      const spread = computeSpread(prefs, factions);
      return { name, prefs, spread, data };
    })
    .filter(e => e.prefs !== null && e.spread > 5)
    .sort((a, b) => b.spread - a.spread);
  
  console.log(`  ${highSpread.length} chassis with spread > 5 between DC and FS`);
  console.log('  Top entries:');
  for (const ch of highSpread.slice(0, 15)) {
    const dcPref = ch.prefs?.DC?.toFixed(1) || 'N/A';
    const fsPref = ch.prefs?.FS?.toFixed(1) || 'N/A';
    console.log(`    ${ch.name}: spread=${ch.spread.toFixed(1)}, DC pref=${dcPref}, FS pref=${fsPref} (DC w:${fw(ch.data.f.DC)}, FS w:${fw(ch.data.f.FS)})`);
  }
  
  assert(highSpread.length > 5, `Should have several high-spread mechs (got ${highSpread.length})`);
  
  // Verify no workhorses (Locust shouldn't be here)
  const locustHere = highSpread.some(c => c.name.includes('Locust'));
  assert(!locustHere, 'Locust (workhorse) should NOT appear in spread>5 results');
  
  // Some DC-favored mech should appear
  const dcFavored = highSpread.some(c => c.prefs?.DC > 8);
  assert(dcFavored, 'Some DC-favored mechs should appear (pref > 8)');
}

// ══════════════════════════════════════════════════════════════════════════
console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
process.exit(failed > 0 ? 1 : 0);
