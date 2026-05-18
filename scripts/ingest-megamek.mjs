#!/usr/bin/env node
/**
 * ingest-megamek.mjs — Parse MegaMek force generator XMLs with full
 * parent-faction inheritance resolution.
 *
 * Output: output/megamek-resolved.json
 */

import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

const DATA_DIR = path.resolve(import.meta.dirname, '..', 'data', 'megamek');
const OUT_DIR  = path.resolve(import.meta.dirname, '..', 'output');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── 1. Parse factions.xml → hierarchy ──────────────────────────────────────
const fxml = fs.readFileSync(path.join(DATA_DIR, 'factions.xml'), 'utf8');
const fparser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'faction' || name === 'nameChange',
});
const fdata = fparser.parse(fxml);

const factionMeta = {};   // key → { name, clan, periphery, parents:[], years }
const childrenOf  = {};   // parentKey → [childKeys]

for (const f of fdata.factions.faction) {
  const key  = f['@_key'];
  const name = f['@_name'] || key;
  const clan = f['@_clan'] === 'true';
  const periphery = f['@_periphery'] === 'true';
  const minor = f['@_minor'] === 'true';
  const years = f.years || '';

  // parentFaction can be comma-separated (multiple parents)
  let parents = [];
  if (f.parentFaction) {
    parents = String(f.parentFaction).split(',').map(s => s.trim());
  }

  factionMeta[key] = { name, clan, periphery, minor, parents, years };
  for (const p of parents) {
    if (!childrenOf[p]) childrenOf[p] = [];
    childrenOf[p].push(key);
  }
}

// Also add root factions that have no parent
for (const key of Object.keys(factionMeta)) {
  if (!factionMeta[key].parents.length) {
    // root faction (IS, CLAN, Periphery, General, etc.)
  }
}

console.log(`Parsed ${Object.keys(factionMeta).length} factions`);

// Build ancestor chain for a faction (breadth-first, first parent priority)
function getAncestors(fkey) {
  const ancestors = [];
  const visited = new Set();
  let queue = [...(factionMeta[fkey]?.parents || [])];
  while (queue.length) {
    const p = queue.shift();
    if (visited.has(p)) continue;
    visited.add(p);
    ancestors.push(p);
    if (factionMeta[p]) {
      queue.push(...factionMeta[p].parents);
    }
  }
  return ancestors;
}

// ── 2. Parse availability strings ──────────────────────────────────────────
// Format: "DC:7+,FRR:5+,MERC:4+,Periphery.DD:3+"
// The ! separates rating-level weights: "CLAN!Keshik:2!Front Line:1!Second Line:1"
// The + after the number means: stated weight applies to highest equipment rating,
//   decreasing by 1 per tier down (elite-skewed).
// The - after the number means: stated weight applies to lowest equipment rating,
//   decreasing by 1 per tier up (garrison-skewed).
// No modifier means flat across all tiers.
//
// Output format:
//   Simple entries: { factionKey: [baseWeight, modifier] }
//     where modifier is "+", "-", or 0 (flat)
//   Explicit rating entries: { factionKey: { levelName: weight, ... } }
//     e.g. { CGB: { Keshik: 4, "Front Line": 3, "Second Line": 1, Solahma: 1 } }

function parseAvailability(avail) {
  if (!avail) return {};
  const result = {};
  const entries = String(avail).split(',');
  
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    
    // Split on '!' to get faction and optional rating levels
    const parts = trimmed.split('!');
    // First part is "FACTION:weight" or just "FACTION"
    const firstMatch = parts[0].match(/^([^:]+):(\d+)([+-]?)(?::(\d+))?$/);
    
    if (!firstMatch) {
      // Explicit rating levels without base weight
      // e.g., "CLAN!Solahma:1!Provisional Garrison:1" — faction is CLAN, no base weight
      const factionKey = parts[0].trim();
      if (parts.length > 1) {
        const levels = {};
        for (let i = 1; i < parts.length; i++) {
          const rm = parts[i].match(/([^:]+):(\d+)/);
          if (rm) {
            levels[rm[1].trim()] = parseInt(rm[2]);
          }
        }
        if (Object.keys(levels).length > 0) {
          result[factionKey] = levels;
        }
      }
      continue;
    }
    
    const factionKey = firstMatch[1];
    const baseWeight = parseInt(firstMatch[2]);
    const modifier = firstMatch[3] || 0; // "+", "-", or "" → 0
    
    if (parts.length > 1) {
      // Has explicit rating-level overrides after the base
      // e.g., "DC:8+!A:10!B:7" — explicit levels take precedence
      const levels = {};
      for (let i = 1; i < parts.length; i++) {
        const rm = parts[i].match(/([^:]+):(\d+)/);
        if (rm) {
          levels[rm[1].trim()] = parseInt(rm[2]);
        }
      }
      if (Object.keys(levels).length > 0) {
        result[factionKey] = levels;
      } else {
        result[factionKey] = [baseWeight, modifier || 0];
      }
    } else {
      result[factionKey] = [baseWeight, modifier || 0];
    }
  }
  
  return result;
}

// Helper: extract the peak weight from a parsed availability entry
// (used during inheritance resolution where we need a single number)
function peakWeight(entry) {
  if (Array.isArray(entry)) return entry[0]; // [base, modifier] — base IS the peak
  if (typeof entry === 'object') return Math.max(...Object.values(entry), 0); // explicit levels
  return entry; // legacy number
}

// ── 3. Parse era XMLs ──────────────────────────────────────────────────────

const eraFiles = fs.readdirSync(DATA_DIR)
  .filter(f => /^\d+\.xml$/.test(f))
  .sort((a, b) => parseInt(a) - parseInt(b));

console.log(`Found ${eraFiles.length} era files`);

const eraParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'chassis' || name === 'model' || name === 'faction',
  preserveOrder: false,
});

// Result: { era: { chassis: { factions: {fkey: weight}, variants: {modelName: {fkey: weight}}, unitType } } }
const rawData = {};
// Weight class distributions: { factionKey: { era: [L, M, H, A] } }
const rawWcd = {};

for (const eraFile of eraFiles) {
  const era = parseInt(eraFile);
  const xml = fs.readFileSync(path.join(DATA_DIR, eraFile), 'utf8');
  const parsed = eraParser.parse(xml);
  
  const ratgen = parsed.ratgen;
  if (!ratgen) {
    console.warn(`No ratgen in ${eraFile}`);
    continue;
  }
  
  // ── Parse faction data (weight class distributions) ──
  let factionNodes = [];
  if (ratgen.factions && ratgen.factions.faction) {
    factionNodes = Array.isArray(ratgen.factions.faction) ? ratgen.factions.faction : [ratgen.factions.faction];
  }
  
  for (const fNode of factionNodes) {
    const fkey = fNode['@_key'];
    if (!fkey) continue;
    
    // Parse weightDistribution for Mek unit type
    const wdNodes = fNode.weightDistribution
      ? (Array.isArray(fNode.weightDistribution) ? fNode.weightDistribution : [fNode.weightDistribution])
      : [];
    
    for (const wd of wdNodes) {
      // weightDistribution can be a string "3,4,2,1" or an object with #text and attributes
      let unitType, values;
      if (typeof wd === 'string') {
        unitType = 'Mek'; // default
        values = wd;
      } else if (wd && typeof wd === 'object') {
        unitType = wd['@_unitType'] || 'Mek';
        values = wd['#text'] || wd;
      } else {
        continue;
      }
      
      // Only care about Mek distributions
      if (unitType !== 'Mek') continue;
      
      const nums = String(values).split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
      if (nums.length === 4) {
        if (!rawWcd[fkey]) rawWcd[fkey] = {};
        rawWcd[fkey][era] = nums; // [Light, Medium, Heavy, Assault]
      }
    }
  }
  
  // ── Parse chassis data ──
  let chassisList = [];
  const units = ratgen.units;
  if (units && units.chassis) {
    chassisList = Array.isArray(units.chassis) ? units.chassis : [units.chassis];
  }
  
  rawData[era] = {};
  
  for (const ch of chassisList) {
    const chassisName = ch['@_name'];
    const unitType = ch['@_unitType'] || 'Unknown';
    const omni = ch['@_omni'] || null;
    
    // Only process BattleMechs (Mek) and IndustrialMechs
    if (unitType !== 'Mek' && unitType !== 'IndustrialMek') continue;
    
    const chassisAvail = parseAvailability(ch.availability);
    
    // Parse model/variant availability
    const variants = {};
    const models = ch.model ? (Array.isArray(ch.model) ? ch.model : [ch.model]) : [];
    for (const m of models) {
      const modelName = m['@_name'] || '';
      const modelAvail = parseAvailability(m.availability);
      if (Object.keys(modelAvail).length > 0) {
        variants[modelName] = modelAvail;
      }
    }
    
    // Collect entries, tagging omni status. We'll disambiguate name collisions after.
    const tempKey = omni ? chassisName + '\x00omni' : chassisName;
    
    if (rawData[era][tempKey]) {
      Object.assign(rawData[era][tempKey].variants, variants);
      for (const [f, a] of Object.entries(chassisAvail)) {
        if (!rawData[era][tempKey].factions[f]) {
          rawData[era][tempKey].factions[f] = a;
        }
      }
    } else {
      rawData[era][tempKey] = {
        unitType,
        omni,
        factions: chassisAvail,
        variants,
      };
    }
  }
  
  console.log(`Era ${era}: ${Object.keys(rawData[era]).length} mech chassis (pre-disambiguation)`);
  
  // Disambiguate: only suffix "(Omni)" when both BM and Omni exist for the same name
  const disambiguated = {};
  for (const [tempKey, data] of Object.entries(rawData[era])) {
    const isOmni = tempKey.includes('\x00omni');
    const baseName = tempKey.replace('\x00omni', '');
    const hasBoth = rawData[era][baseName] && rawData[era][baseName + '\x00omni'];
    
    let finalKey;
    if (hasBoth) {
      finalKey = isOmni ? baseName + ' (Omni)' : baseName;
    } else {
      finalKey = baseName; // no collision, use original name
    }
    
    disambiguated[finalKey] = data;
  }
  rawData[era] = disambiguated;
  console.log(`Era ${era}: ${Object.keys(rawData[era]).length} mech chassis`);
}

// ── 4. Resolve inheritance ─────────────────────────────────────────────────
// For each era, for each chassis:
//   - For every faction that has explicit entry → use it
//   - For factions without entry → inherit from first parent that has one
// We only resolve for factions that appear in factions.xml

const resolved = {};

// Determine which factions are "leaf" (concrete) — we want all non-abstract factions
// Abstract factions: IS, CLAN, Periphery, General, and their sub-groupings
// Actually, let's resolve for ALL factions and let the UI decide what to show
// But we should focus on factions that are actually meaningful

// Get all faction keys that appear in any era data
const allFactionKeysInData = new Set();
for (const era of Object.keys(rawData)) {
  for (const ch of Object.keys(rawData[era])) {
    for (const fk of Object.keys(rawData[era][ch].factions)) {
      allFactionKeysInData.add(fk);
    }
  }
}

// Get all concrete factions (non-minor, or commonly referenced)
// We'll resolve for all factions in factionMeta that have a parent
// Plus the major ones without parents
const factionsToResolve = new Set();
for (const [key, meta] of Object.entries(factionMeta)) {
  // Include non-minor factions and common parent factions
  if (!meta.minor) {
    factionsToResolve.add(key);
  }
}
// Also add any faction that appears directly in data
for (const fk of allFactionKeysInData) {
  factionsToResolve.add(fk);
}

console.log(`\nResolving inheritance for ${factionsToResolve.size} factions...`);

for (const era of Object.keys(rawData)) {
  resolved[era] = {};
  
  for (const [chassisName, chassisData] of Object.entries(rawData[era])) {
    const explicitFactions = chassisData.factions; // {fkey: [base, mod] | {levels} }
    const resolvedFactions = {};
    const resolvedVariants = {}; // {modelName: {fkey: [base, mod] | {levels} | number}}
    
    // For each faction we want to resolve
    for (const fkey of factionsToResolve) {
      // Check if faction has explicit entry
      if (explicitFactions[fkey] !== undefined) {
        resolvedFactions[fkey] = explicitFactions[fkey];
        continue;
      }
      
      // Walk up ancestry chain to find inherited weight
      const ancestors = getAncestors(fkey);
      for (const ancestor of ancestors) {
        if (explicitFactions[ancestor] !== undefined) {
          // Inherit parent's entry (preserving modifier info)
          resolvedFactions[fkey] = explicitFactions[ancestor];
          break;
        }
      }
    }
    
    // Skip chassis that no faction fields
    if (Object.keys(resolvedFactions).length === 0) continue;
    
    // Resolve variant weights with inheritance + scaling
    // Variant scaling produces plain numbers (approximations), not modifier-encoded values
    for (const [modelName, modelFactions] of Object.entries(chassisData.variants)) {
      resolvedVariants[modelName] = {};
      
      for (const fkey of Object.keys(resolvedFactions)) {
        // If faction has explicit variant entry
        if (modelFactions[fkey] !== undefined) {
          resolvedVariants[modelName][fkey] = modelFactions[fkey];
          continue;
        }
        
        // For variant scaling, use peakWeight for arithmetic
        const factionChassisW = peakWeight(resolvedFactions[fkey]);
        
        // Check "General" — a catch-all for variant distribution
        if (modelFactions['General'] !== undefined) {
          const generalW = peakWeight(modelFactions['General']);
          
          // Find the parent faction weight for chassis
          const ancestors = getAncestors(fkey);
          let parentChassisWeight = null;
          let parentVariantWeight = null;
          
          // First check if any ancestor has explicit variant weight
          for (const anc of ancestors) {
            if (modelFactions[anc] !== undefined) {
              parentVariantWeight = peakWeight(modelFactions[anc]);
              parentChassisWeight = explicitFactions[anc] !== undefined ? peakWeight(explicitFactions[anc]) : null;
              break;
            }
          }
          
          if (parentVariantWeight !== null && parentChassisWeight !== null && parentChassisWeight > 0) {
            resolvedVariants[modelName][fkey] = parentVariantWeight * (factionChassisW / parentChassisWeight);
          } else {
            const maxExplicit = Math.max(...Object.values(explicitFactions).map(v => peakWeight(v)).filter(v => v > 0), 1);
            resolvedVariants[modelName][fkey] = generalW * (factionChassisW / maxExplicit);
          }
          continue;
        }
        
        // Inherit from parent faction's variant weight, scaled
        const ancestors = getAncestors(fkey);
        let inherited = false;
        for (const anc of ancestors) {
          if (modelFactions[anc] !== undefined) {
            const parentVariantWeight = peakWeight(modelFactions[anc]);
            const parentChassisW = explicitFactions[anc] !== undefined ? peakWeight(explicitFactions[anc]) : peakWeight(resolvedFactions[anc]);
            
            if (parentChassisW && parentChassisW > 0) {
              resolvedVariants[modelName][fkey] = parentVariantWeight * (factionChassisW / parentChassisW);
            } else {
              resolvedVariants[modelName][fkey] = parentVariantWeight;
            }
            inherited = true;
            break;
          }
        }
        
        // If still no variant weight, check General as last resort
        if (!inherited && modelFactions['General'] !== undefined) {
          resolvedVariants[modelName][fkey] = peakWeight(modelFactions['General']);
        }
      }
    }
    
    resolved[era][chassisName] = {
      unitType: chassisData.unitType,
      omni: chassisData.omni,
      factions: resolvedFactions,
      variants: resolvedVariants,
    };
  }
  
  console.log(`Era ${era}: ${Object.keys(resolved[era]).length} chassis resolved`);
}

// ── 5. Write output ────────────────────────────────────────────────────────

// ── 5b. Resolve weight class distribution inheritance ──────────────────────
// Factions without explicit wcd inherit from parent
const resolvedWcd = {};
function resolveWcd(fkey, era) {
  if (rawWcd[fkey]?.[era]) return rawWcd[fkey][era];
  const ancestors = getAncestors(fkey);
  for (const anc of ancestors) {
    if (rawWcd[anc]?.[era]) return rawWcd[anc][era];
  }
  return null;
}

// Build resolved wcd for all major factions across all eras
for (const fkey of Object.keys(factionMeta)) {
  const factionWcd = {};
  for (const era of Object.keys(resolved).map(Number)) {
    const wcd = resolveWcd(fkey, era);
    if (wcd) factionWcd[era] = wcd;
  }
  if (Object.keys(factionWcd).length > 0) {
    resolvedWcd[fkey] = factionWcd;
  }
}

console.log(`Weight class distributions: ${Object.keys(rawWcd).length} factions with explicit data, ${Object.keys(resolvedWcd).length} after inheritance`);

const output = {
  _meta: {
    generated: new Date().toISOString(),
    description: 'MegaMek force generator data with full faction inheritance resolution',
    eras: Object.keys(resolved).map(Number).sort((a,b) => a-b),
    factionCount: Object.keys(factionMeta).length,
  },
  factionMeta,
  weightClassDistributions: resolvedWcd,
  eras: resolved,
};

const outPath = path.join(OUT_DIR, 'megamek-resolved.json');
fs.writeFileSync(outPath, JSON.stringify(output));
console.log(`\nWrote ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
