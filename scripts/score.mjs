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

// All factions with data are included — no filtering by "major" status.
// The UI handles grouping and display; the data pipeline passes everything through.

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

// Copy all faction metadata
for (const [code, meta] of Object.entries(resolved.factionMeta)) {
  output.factionMeta[code] = meta;
}

// Copy all weight class distributions
for (const [code, wcd] of Object.entries(resolved.weightClassDistributions || {})) {
  output.weightClassDistributions[code] = wcd;
}

// Process each era
for (const [eraYear, chassisData] of Object.entries(resolved.eras)) {
  const eraOut = {};
  
  for (const [chassisName, data] of Object.entries(chassisData)) {
    const factionWeights = data.factions || {};
    if (Object.keys(factionWeights).length === 0) continue;
    
    // Pass through all variant weights
    const variants = {};
    if (data.variants) {
      for (const [varName, varFactions] of Object.entries(data.variants)) {
        if (Object.keys(varFactions).length > 0) {
          variants[varName] = varFactions;
        }
      }
    }
    
    eraOut[chassisName] = {
      unitType: data.unitType || 'Mek',
      omni: data.omni || null,
      weights: factionWeights,
      variants: Object.keys(variants).length > 0 ? variants : undefined,
      family: familyMap[chassisName] || undefined
    };
  }
  
  output.eras[eraYear] = eraOut;
}

writeFileSync(join(ROOT, 'output/scores.json'), JSON.stringify(output, null, 2));
console.log(`scores.json written: ${Object.keys(output.eras).length} eras, ${Object.keys(output.factionMeta).length} factions`);
