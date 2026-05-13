#!/usr/bin/env node
/**
 * score.mjs — Organize resolved MegaMek data for the UI.
 * 
 * Input:  output/megamek-resolved.json
 * Output: output/scores.json
 * 
 * Produces raw weights per chassis per faction per era,
 * variant weights, and faction counts. No precomputed scores.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const resolved = JSON.parse(readFileSync(join(ROOT, 'output/megamek-resolved.json'), 'utf8'));
const families = JSON.parse(readFileSync(join(ROOT, 'config/chassis-families.json'), 'utf8'));

// Build family lookup: chassis name -> family group name
const familyMap = {};
for (const fam of families) {
  if (fam.enabled) {
    for (const ch of fam.chassis) {
      familyMap[ch] = fam.groupName;
    }
  }
}

// Which factions are "major" — have entries in mul-faction-map (the ones we show by default)
const mulFactionMap = JSON.parse(readFileSync(join(ROOT, 'data/mul-faction-map.json'), 'utf8'));
const majorFactions = new Set(Object.keys(mulFactionMap).filter(k => k !== '_description'));

// Filter to major factions only for the parent-level factions in weights
function filterToMajorFactions(factionWeights) {
  const result = {};
  for (const [f, w] of Object.entries(factionWeights)) {
    if (majorFactions.has(f)) {
      result[f] = w;
    }
  }
  return result;
}

const output = {
  _meta: {
    generated: new Date().toISOString(),
    description: 'Organized MegaMek weights for UI consumption',
    eraYears: resolved._meta.eras
  },
  factionMeta: {},
  weightClassDistributions: {},
  eras: {}
};

// Copy faction metadata for major factions
for (const [code, meta] of Object.entries(resolved.factionMeta)) {
  if (majorFactions.has(code)) {
    output.factionMeta[code] = meta;
  }
}

// Copy weight class distributions for major factions
for (const [code, wcd] of Object.entries(resolved.weightClassDistributions || {})) {
  if (majorFactions.has(code)) {
    output.weightClassDistributions[code] = wcd;
  }
}

// Process each era
for (const [eraYear, chassisData] of Object.entries(resolved.eras)) {
  const eraOut = {};
  
  for (const [chassisName, data] of Object.entries(chassisData)) {
    const majorFactionWeights = filterToMajorFactions(data.factions || {});
    if (Object.keys(majorFactionWeights).length === 0) continue;
    
    // Filter variant weights to major factions too
    const variants = {};
    if (data.variants) {
      for (const [varName, varFactions] of Object.entries(data.variants)) {
        const filtered = filterToMajorFactions(varFactions);
        if (Object.keys(filtered).length > 0) {
          variants[varName] = filtered;
        }
      }
    }
    
    eraOut[chassisName] = {
      unitType: data.unitType || 'Mek',
      omni: data.omni || null,
      weights: majorFactionWeights,
      variants: Object.keys(variants).length > 0 ? variants : undefined,
      family: familyMap[chassisName] || undefined
    };
  }
  
  output.eras[eraYear] = eraOut;
}

writeFileSync(join(ROOT, 'output/scores.json'), JSON.stringify(output, null, 2));
console.log(`scores.json written: ${Object.keys(output.eras).length} eras, ${Object.keys(output.factionMeta).length} factions`);
