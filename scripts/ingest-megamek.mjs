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
// The + or - after the number is an era modifier (introduced/phasing out)
// We take the base numeric weight, ignoring rating levels (use max across levels)

function parseAvailability(avail) {
  if (!avail) return {};
  const result = {};
  // Split on commas, but need to handle rating-level entries like "CLAN!Keshik:2!Front Line:1"
  // Strategy: split on comma, then for each entry parse faction:weight pairs
  const entries = String(avail).split(',');
  
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    
    // Split on '!' to get faction and optional rating levels
    const parts = trimmed.split('!');
    // First part is "FACTION:weight" or just "FACTION"
    const firstMatch = parts[0].match(/^([^:]+):(\d+)([+-]?)(?::(\d+))?$/);
    
    if (!firstMatch) {
      // Could be just a faction key without weight in this part
      // e.g., "CLAN!Solahma:1!Provisional Garrison:1" — faction is CLAN, no base weight
      const factionKey = parts[0].trim();
      let maxWeight = 0;
      for (let i = 1; i < parts.length; i++) {
        const rm = parts[i].match(/([^:]+):(\d+)([+-]?)/);
        if (rm) {
          const w = parseInt(rm[2]);
          if (w > maxWeight) maxWeight = w;
        }
      }
      if (maxWeight > 0) {
        result[factionKey] = maxWeight;
      }
      continue;
    }
    
    const factionKey = firstMatch[1];
    const baseWeight = parseInt(firstMatch[2]);
    // introYear from :YYYY suffix  
    // const introYear = firstMatch[4] ? parseInt(firstMatch[4]) : null;
    
    let maxWeight = baseWeight;
    // Check rating-level entries for higher weights
    for (let i = 1; i < parts.length; i++) {
      const rm = parts[i].match(/([^:]+):(\d+)([+-]?)/);
      if (rm) {
        const w = parseInt(rm[2]);
        if (w > maxWeight) maxWeight = w;
      }
    }
    
    result[factionKey] = maxWeight;
  }
  
  return result;
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

for (const eraFile of eraFiles) {
  const era = parseInt(eraFile);
  const xml = fs.readFileSync(path.join(DATA_DIR, eraFile), 'utf8');
  const parsed = eraParser.parse(xml);
  
  const ratgen = parsed.ratgen;
  if (!ratgen) {
    console.warn(`No ratgen in ${eraFile}`);
    continue;
  }
  
  // Chassis are under ratgen.units.chassis
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
    
    rawData[era][chassisName] = {
      unitType,
      omni,
      factions: chassisAvail,
      variants,
    };
  }
  
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
    const explicitFactions = chassisData.factions; // {fkey: weight}
    const resolvedFactions = {};
    const resolvedVariants = {}; // {modelName: {fkey: weight}}
    
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
          resolvedFactions[fkey] = explicitFactions[ancestor];
          break;
        }
      }
    }
    
    // Skip chassis that no faction fields
    if (Object.keys(resolvedFactions).length === 0) continue;
    
    // Resolve variant weights with inheritance + scaling
    for (const [modelName, modelFactions] of Object.entries(chassisData.variants)) {
      resolvedVariants[modelName] = {};
      
      for (const fkey of Object.keys(resolvedFactions)) {
        // If faction has explicit variant entry
        if (modelFactions[fkey] !== undefined) {
          resolvedVariants[modelName][fkey] = modelFactions[fkey];
          continue;
        }
        
        // Check "General" — a catch-all for variant distribution
        if (modelFactions['General'] !== undefined) {
          // Scale General weight by faction's chassis affinity ratio
          const factionChassisWeight = resolvedFactions[fkey];
          // Find the reference weight: use the faction that "General" represents
          // General is basically the base/default, treat as parent weight
          // We scale: effective = General_weight × (faction_chassis / reference_chassis)
          // Reference = we need to find what General maps to. Use the max explicit parent weight.
          // Actually, "General" in variant context means "all factions get this variant at this base weight"
          // We should scale it by faction's chassis affinity relative to a baseline
          
          // For simplicity and accuracy: find the parent faction weight for chassis
          const ancestors = getAncestors(fkey);
          let parentChassisWeight = null;
          let parentVariantWeight = null;
          
          // First check if any ancestor has explicit variant weight
          for (const anc of ancestors) {
            if (modelFactions[anc] !== undefined) {
              parentVariantWeight = modelFactions[anc];
              parentChassisWeight = explicitFactions[anc] !== undefined ? explicitFactions[anc] : null;
              break;
            }
          }
          
          if (parentVariantWeight !== null && parentChassisWeight !== null && parentChassisWeight > 0) {
            // Scale by chassis affinity ratio
            resolvedVariants[modelName][fkey] = parentVariantWeight * (factionChassisWeight / parentChassisWeight);
          } else {
            // Fall back to General with scaling
            // Use "General" weight scaled by faction weight / average chassis weight
            resolvedVariants[modelName][fkey] = modelFactions['General'] * (factionChassisWeight / Math.max(...Object.values(explicitFactions).filter(v => v > 0), 1));
          }
          continue;
        }
        
        // Inherit from parent faction's variant weight, scaled
        const ancestors = getAncestors(fkey);
        let inherited = false;
        for (const anc of ancestors) {
          if (modelFactions[anc] !== undefined) {
            const parentVariantWeight = modelFactions[anc];
            const parentChassisWeight = explicitFactions[anc] !== undefined ? explicitFactions[anc] : resolvedFactions[anc];
            const factionChassisWeight = resolvedFactions[fkey];
            
            if (parentChassisWeight && parentChassisWeight > 0) {
              resolvedVariants[modelName][fkey] = parentVariantWeight * (factionChassisWeight / parentChassisWeight);
            } else {
              resolvedVariants[modelName][fkey] = parentVariantWeight;
            }
            inherited = true;
            break;
          }
        }
        
        // If still no variant weight, check General as last resort
        if (!inherited && modelFactions['General'] !== undefined) {
          resolvedVariants[modelName][fkey] = modelFactions['General'];
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

const output = {
  _meta: {
    generated: new Date().toISOString(),
    description: 'MegaMek force generator data with full faction inheritance resolution',
    eras: Object.keys(resolved).map(Number).sort((a,b) => a-b),
    factionCount: Object.keys(factionMeta).length,
  },
  factionMeta,
  eras: resolved,
};

const outPath = path.join(OUT_DIR, 'megamek-resolved.json');
fs.writeFileSync(outPath, JSON.stringify(output));
console.log(`\nWrote ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
