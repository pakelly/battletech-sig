#!/usr/bin/env node
/**
 * build-families.mjs
 * Auto-detects chassis families from MegaMek data and writes config/chassis-families.json.
 * 
 * Detection patterns:
 * - "X" / "X II" / "X IIC" / "X III" / "X IV" (Clan IIC variants, numbered successors)
 * - "Grand X" / "Super X" / "Heavy X" prefix families
 * - IS/Clan dual names: "Vulture (Mad Dog)", "Thor (Summoner)", etc.
 * - Known aliases: "Wolf Trap (Tora)"
 * 
 * Output: config/chassis-families.json
 * Users can edit the file to enable/disable families or add custom groupings.
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = resolve(__dirname, '..');
const INPUT = resolve(BASE, 'output', 'megamek-data.json');
const OUTPUT = resolve(BASE, 'config', 'chassis-families.json');

async function main() {
  console.log('=== Chassis Family Auto-Detection ===\n');

  const data = JSON.parse(await readFile(INPUT, 'utf-8'));
  
  // Collect all unique chassis names across all eras
  const allChassis = new Set();
  for (const eraChassis of Object.values(data.eras)) {
    for (const name of Object.keys(eraChassis)) allChassis.add(name);
  }
  const names = [...allChassis].sort();
  console.log(`Total unique chassis: ${names.length}`);

  const families = new Map(); // groupName → Set of chassis names
  const used = new Set(); // track chassis already assigned

  // Pattern 1: Numbered successors (II, IIC, III, IV)
  const suffixes = [' II', ' IIC', ' III', ' IV', ' Mk II', ' Mk III', ' Mk IV'];
  for (const name of names) {
    for (const suffix of suffixes) {
      if (name.endsWith(suffix)) {
        const base = name.slice(0, -suffix.length);
        // Only if the base chassis also exists
        if (allChassis.has(base)) {
          const key = `${base} Family`;
          if (!families.has(key)) families.set(key, new Set([base]));
          families.get(key).add(name);
        }
      }
    }
  }

  // Pattern 2: Prefix families (Grand X, Heavy X, Super X)
  const prefixes = ['Grand ', 'Heavy ', 'Super '];
  for (const name of names) {
    for (const prefix of prefixes) {
      if (name.startsWith(prefix)) {
        const base = name.slice(prefix.length);
        if (allChassis.has(base)) {
          const key = `${base} Family`;
          if (!families.has(key)) families.set(key, new Set([base]));
          families.get(key).add(name);
        }
      }
    }
  }

  // Pattern 3: IS/Clan dual names — "ISName (ClanName)" pairs
  // These are the SAME mech with two names, used together already in MegaMek
  // We DON'T merge these as families — they're already the same chassis entry
  // But we track them for reference
  const dualNames = [];
  for (const name of names) {
    const m = name.match(/^(.+?)\s*\((.+?)\)$/);
    if (m) {
      dualNames.push({ entry: name, isName: m[1].trim(), clanName: m[2].trim() });
    }
  }

  // Pattern 4: Parenthetical variants that share a base
  // e.g., "Gladiator (Executioner)" and "Gladiator-B (Executioner-B)" 
  // or "Ryoken III (Skinwalker)" and "Ryoken III-XP (Skinwalker)"
  // Group by the clan name in parens
  const parenGroups = new Map();
  for (const dn of dualNames) {
    // Normalize: strip -B, -XP, etc. suffixes to find base clan name
    const baseClan = dn.clanName.replace(/[-\s]+(B|C|P|XP|PR)$/, '');
    if (!parenGroups.has(baseClan)) parenGroups.set(baseClan, new Set());
    parenGroups.get(baseClan).add(dn.entry);
  }
  const genericTerms = new Set(['Standard', 'B', 'C', 'P', 'XP', 'PR']);
  for (const [baseClan, members] of parenGroups) {
    if (members.size > 1 && !genericTerms.has(baseClan)) {
      const key = `${baseClan} Variants`;
      families.set(key, members);
    }
  }

  // Pattern 5: "Vulture Mk III (Mad Dog Mk III)" — merge with "Vulture (Mad Dog)" family
  // Look for Mk variants that reference the same dual-name base
  for (const dn of dualNames) {
    const baseIS = dn.isName.replace(/\s+Mk\s+[IVX]+$/, '').replace(/\s+II[CP]?$/, '');
    const baseClan = dn.clanName.replace(/\s+Mk\s+[IVX]+$/, '').replace(/\s+II[CP]?$/, '');
    
    // Find if a simpler version exists
    for (const other of dualNames) {
      if (other.entry !== dn.entry && 
          (other.isName === baseIS || other.clanName === baseClan) &&
          other.entry !== dn.entry) {
        const key = `${baseClan} Family`;
        if (!families.has(key)) families.set(key, new Set([other.entry]));
        families.get(key).add(dn.entry);
      }
    }
  }

  // Merge overlapping families
  const merged = mergeFamilies(families);

  // Build output
  const output = [];
  for (const [groupName, members] of merged) {
    if (members.size < 2) continue;
    output.push({
      groupName,
      chassis: [...members].sort(),
      enabled: true,
      autoDetected: true
    });
  }

  // Sort by group name
  output.sort((a, b) => a.groupName.localeCompare(b.groupName));

  console.log(`\nDetected ${output.length} chassis families:`);
  for (const f of output) {
    console.log(`  ${f.groupName}: ${f.chassis.join(', ')}`);
  }

  await writeFile(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`\nOutput written to ${OUTPUT}`);
}

function mergeFamilies(families) {
  // If any chassis appears in multiple families, merge those families
  const chassisToFamily = new Map();
  const merged = new Map();

  for (const [name, members] of families) {
    merged.set(name, new Set(members));
  }

  let changed = true;
  while (changed) {
    changed = false;
    const familyNames = [...merged.keys()];
    for (let i = 0; i < familyNames.length; i++) {
      for (let j = i + 1; j < familyNames.length; j++) {
        const a = merged.get(familyNames[i]);
        const b = merged.get(familyNames[j]);
        if (!a || !b) continue;
        
        // Check overlap
        let overlap = false;
        for (const m of a) {
          if (b.has(m)) { overlap = true; break; }
        }
        
        if (overlap) {
          // Merge b into a
          for (const m of b) a.add(m);
          merged.delete(familyNames[j]);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return merged;
}

main().catch(err => { console.error(err); process.exit(1); });
