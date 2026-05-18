#!/usr/bin/env node
/**
 * parse-mekfiles.mjs — Parse MegaMek .mtf files to extract unit metadata
 *
 * Recursively scans mm-data/data/mekfiles/meks/ for .mtf files and produces
 * output/mekfile-metadata.json with chassis, variant, and prefix indexes.
 *
 * This is Phase 2 of mm-data integration: proving we can get equivalent
 * metadata from .mtf files that we currently scrape from MUL.
 *
 * BV (Battle Value) is NOT present in .mtf files — MegaMek calculates it
 * at runtime from the loadout. BV fields will be null in the output.
 * We'll still need MUL or a BV calculator for that data.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEKS_DIR = join(ROOT, 'mm-data/data/mekfiles/meks');
const OUTPUT_FILE = join(ROOT, 'output/mekfile-metadata.json');

// ── Weight class thresholds ──
function weightClass(tonnage) {
  if (tonnage <= 35) return 'Light';
  if (tonnage <= 55) return 'Medium';
  if (tonnage <= 75) return 'Heavy';
  return 'Assault';
}

// ── Recursively find all .mtf files ──
function findMtfFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMtfFiles(full));
    } else if (entry.name.endsWith('.mtf')) {
      results.push(full);
    }
  }
  return results;
}

// ── Parse a single .mtf file ──
// We only need the header fields (before the equipment/armor blocks).
// The format is key:value pairs, one per line. Lines starting with # are comments.
function parseMtfFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  const fields = {};
  for (const line of lines) {
    // Skip comments and blank lines
    if (line.startsWith('#') || line.trim() === '') continue;

    // Stop parsing headers once we hit equipment/armor/weapon data blocks
    // These are indicated by lines that don't have a colon key:value format
    // or specific section markers
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    // Only capture fields we care about (first occurrence wins)
    if (!fields[key]) {
      fields[key] = value;
    }
  }

  const chassis = fields['chassis'] || null;
  const model = fields['model'] || null;
  const clanname = fields['clanname'] || null;
  const mulId = fields['mul id'] ? parseInt(fields['mul id']) : null;
  const mass = fields['mass'] ? parseInt(fields['mass']) : null;
  const era = fields['era'] ? parseInt(fields['era']) : null;
  const role = fields['role'] || null;

  // Tech base: normalize to 'IS' or 'Clan' or 'Mixed'
  let tech = null;
  const rawTech = (fields['techbase'] || '').toLowerCase();
  if (rawTech.includes('inner sphere')) tech = 'Inner Sphere';
  else if (rawTech.includes('clan')) tech = 'Clan';
  else if (rawTech.includes('mixed')) tech = 'Mixed';
  else if (rawTech) tech = fields['techbase']; // preserve unknown values

  // OmniMech detection from Config line
  const config = (fields['config'] || '').toLowerCase();
  const omni = config.includes('omnimek') || config.includes('omnimech');

  return { chassis, model, clanname, mulId, mass, era, tech, role, omni, config: fields['config'] || null };
}

// ── Main ──
function main() {
  console.log(`Scanning .mtf files in ${MEKS_DIR}...`);
  const files = findMtfFiles(MEKS_DIR);
  console.log(`Found ${files.length} .mtf files`);

  // Collect all parsed variants
  const variants = {};     // keyed by model designation (e.g., "AS7-D")
  const chassisMap = {};    // keyed by chassis name → accumulate variant data
  const prefixes = {};      // keyed by model prefix → chassis name
  let parseErrors = 0;
  let skipped = 0;

  for (const file of files) {
    let parsed;
    try {
      parsed = parseMtfFile(file);
    } catch (e) {
      parseErrors++;
      continue;
    }

    const { chassis, model, clanname, mulId, mass, era, tech, role, omni } = parsed;

    if (!chassis) {
      skipped++;
      continue;
    }

    // Build variant key — use model if available, otherwise just chassis
    const variantKey = model ? model : chassis;

    // Index variant (first occurrence wins for duplicates across TRO dirs)
    if (!variants[variantKey]) {
      variants[variantKey] = {
        chassis,
        tonnage: mass,
        bv: null, // BV not available in .mtf files
        intro: era,
        tech,
        role,
        mulId,
        omni,
        clanname: clanname || null
      };
    }

    // Accumulate chassis data
    if (!chassisMap[chassis]) {
      chassisMap[chassis] = {
        tonnage: mass,
        intros: [],
        techs: [],
        roles: [],
        omni,
        clanname: clanname || null,
        variantCount: 0
      };
    }
    const cm = chassisMap[chassis];
    if (era) cm.intros.push(era);
    if (role) cm.roles.push(role);
    if (tech && !cm.techs.includes(tech)) cm.techs.push(tech);
    if (omni) cm.omni = true; // if any variant is omni, chassis is omni
    if (clanname && !cm.clanname) cm.clanname = clanname;
    if (mass && !cm.tonnage) cm.tonnage = mass;
    cm.variantCount++;

    // Extract model prefix (e.g., AS7-D → AS7, DRG-1N → DRG)
    if (model) {
      const prefix = model.split('-')[0];
      if (prefix && prefix.length >= 2 && prefix.length <= 6) {
        if (!prefixes[prefix] || prefixes[prefix] === chassis) {
          prefixes[prefix] = chassis;
        }
      }
    }
  }

  // ── Build chassis index ──
  const chassisIndex = {};
  for (const [name, data] of Object.entries(chassisMap)) {
    // Most common role
    const roleCounts = {};
    for (const r of data.roles) {
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    }
    const topRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Earliest intro year
    const intro = data.intros.length > 0 ? Math.min(...data.intros) : null;

    // Primary tech base (most common)
    const tech = data.techs.length === 1 ? data.techs[0] : (data.techs.join('/') || null);

    chassisIndex[name] = {
      tonnage: data.tonnage,
      intro,
      tech,
      omni: data.omni,
      role: topRole,
      class: data.tonnage ? weightClass(data.tonnage) : null,
      clanname: data.clanname || undefined,
      variants: data.variantCount
    };
    // Clean up undefined clanname
    if (!chassisIndex[name].clanname) delete chassisIndex[name].clanname;
  }

  // ── Output ──
  const output = {
    _generated: new Date().toISOString(),
    _source: 'mm-data/data/mekfiles/meks',
    _note: 'BV (Battle Value) is not present in .mtf files — MegaMek calculates it at runtime. All BV fields are null.',
    stats: {
      totalFiles: files.length,
      totalVariants: Object.keys(variants).length,
      totalChassis: Object.keys(chassisIndex).length,
      totalPrefixes: Object.keys(prefixes).length,
      parseErrors,
      skipped
    },
    chassis: chassisIndex,
    variants,
    modelPrefixes: prefixes
  };

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\nOutput written to ${OUTPUT_FILE}`);
  console.log(`  Chassis: ${output.stats.totalChassis}`);
  console.log(`  Variants: ${output.stats.totalVariants}`);
  console.log(`  Prefixes: ${output.stats.totalPrefixes}`);
  console.log(`  Parse errors: ${parseErrors}`);
  console.log(`  Skipped (no chassis): ${skipped}`);
  console.log(`  BV: NOT AVAILABLE in .mtf files (all null)`);
}

main();
