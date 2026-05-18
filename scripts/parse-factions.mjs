#!/usr/bin/env node
/**
 * parse-factions.mjs — Parse faction metadata from mm-data YAML files
 * 
 * Reads mm-data/data/universe/factions/*.yml and extracts enriched
 * faction metadata (name, yearsActive, tags, color, sucsCodes, parentFaction).
 * Outputs output/faction-metadata.json.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FACTIONS_DIR = join(ROOT, 'mm-data/data/universe/factions');
const OUTPUT_DIR = join(ROOT, 'output');

mkdirSync(OUTPUT_DIR, { recursive: true });

const files = readdirSync(FACTIONS_DIR).filter(f => f.endsWith('.yml'));
const factions = {};

for (const file of files) {
  const raw = readFileSync(join(FACTIONS_DIR, file), 'utf8');
  const doc = yaml.load(raw);
  if (!doc || !doc.key) continue;

  const entry = {
    key: doc.key,
    name: doc.name || null,
    yearsActive: null,
    tags: doc.tags || [],
    parentFaction: doc.parentFaction || null,
    sucsCodes: doc.sucsCodes || [],
    color: doc.color || null
  };

  // Parse yearsActive — array of {start, end?} ranges
  if (Array.isArray(doc.yearsActive)) {
    entry.yearsActive = doc.yearsActive.map(r => {
      const range = { start: r.start };
      if (r.end != null) range.end = r.end;
      return range;
    });
  }

  factions[doc.key] = entry;
}

writeFileSync(join(OUTPUT_DIR, 'faction-metadata.json'), JSON.stringify(factions, null, 2));
console.log(`faction-metadata.json: ${Object.keys(factions).length} factions parsed from ${files.length} YAML files`);
