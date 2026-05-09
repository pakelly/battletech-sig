#!/usr/bin/env node
/**
 * ingest-mul.mjs
 * Pulls BattleMech availability from the Master Unit List API.
 * Caches aggressively, respects rate limits (~200ms between requests).
 *
 * Output: output/mul-availability.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = resolve(__dirname, '..');
const CACHE_DIR = resolve(BASE, 'data', 'mul-cache');
const OUTPUT = resolve(BASE, 'output', 'mul-availability.json');

const MUL_BASE = 'https://masterunitlist.azurewebsites.net/Unit/QuickList';
const TYPE_BATTLEMECH = 18;
const DELAY_MS = 250;

// ─── ID Mappings ────────────────────────────────────────────────────────

const FACTIONS = {
  // Inner Sphere Major
  DC:   { id: 27, name: 'Draconis Combine' },
  FS:   { id: 29, name: 'Federated Suns' },
  CC:   { id: 5,  name: 'Capellan Confederation' },
  FWL:  { id: 30, name: 'Free Worlds League' },
  LA:   { id: 32, name: 'Lyran Alliance' },
  LC:   { id: 60, name: 'Lyran Commonwealth' },
  FC:   { id: 84, name: 'Federated Commonwealth' },
  FRR:  { id: 28, name: 'Free Rasalhague Republic' },
  CS:   { id: 18, name: 'ComStar' },
  WOB:  { id: 48, name: 'Word of Blake' },
  SIC:  { id: 83, name: "St. Ives Compact" },
  ROS:  { id: 41, name: 'Republic of the Sphere' },

  // Periphery
  TC:   { id: 47, name: 'Taurian Concordat' },
  MH:   { id: 35, name: 'Marian Hegemony' },
  OA:   { id: 36, name: 'Outworlds Alliance' },
  MC:   { id: 33, name: 'Magistracy of Canopus' },
  CIR:  { id: 9,  name: 'Circinus Federation' },

  // Clans - Invading
  CW:   { id: 24, name: 'Clan Wolf' },
  CJF:  { id: 15, name: 'Clan Jade Falcon' },
  CGB:  { id: 11, name: 'Clan Ghost Bear' },
  CSJ:  { id: 20, name: 'Clan Smoke Jaguar' },
  CHH:  { id: 13, name: "Clan Hell's Horses" },
  CNC:  { id: 17, name: 'Clan Nova Cat' },
  CSV:  { id: 22, name: 'Clan Steel Viper' },
  CDS:  { id: 8,  name: 'Clan Diamond Shark' },
  CSR:  { id: 21, name: 'Clan Snow Raven' },

  // Clans - Homeworld
  CBS:  { id: 2,  name: 'Clan Blood Spirit' },
  CCO:  { id: 7,  name: 'Clan Coyote' },
  CFM:  { id: 10, name: 'Clan Fire Mandrill' },
  CGS:  { id: 12, name: 'Clan Goliath Scorpion' },
  CIH:  { id: 14, name: 'Clan Ice Hellion' },
  CSA:  { id: 19, name: 'Clan Star Adder' },

  // Mercenary
  MERC: { id: 34, name: 'Mercenary' },
  KH:   { id: 31, name: 'Kell Hounds' },
  WD:   { id: 49, name: "Wolf's Dragoons" },

  // Late-era
  RD:   { id: 40, name: 'Rasalhague Dominion' },
  RA:   { id: 39, name: 'Raven Alliance' },
  CSF:  { id: 82, name: 'Clan Sea Fox' },
  RAF:  { id: 41, name: 'Republic of the Sphere' },

  // Star League
  SL:   { id: 45, name: 'Star League Regular' },
  SLR:  { id: 43, name: 'Star League Royal' },
  TH:   { id: 87, name: 'Terran Hegemony' },

  // General
  IS:   { id: 55, name: 'Inner Sphere General' },
  CLAN: { id: 56, name: 'IS Clan General' }, // Clans in IS
  PERI: { id: 57, name: 'Periphery General' },
};

const ERAS = {
  'AgeOfWar':       { id: 9,   name: 'Age of War',       start: 2005 },
  'StarLeague':     { id: 10,  name: 'Star League',      start: 2571 },
  'EarlySuccession':{ id: 11,  name: 'Early Succession',  start: 2781 },
  'LateSuccessionLT':{ id: 255, name: 'Late Succession - LosTech', start: 2901 },
  'LateSuccessionR':{ id: 256, name: 'Late Succession - Renaissance', start: 3020 },
  'ClanInvasion':   { id: 13,  name: 'Clan Invasion',    start: 3050 },
  'CivilWar':       { id: 247, name: 'Civil War',        start: 3062 },
  'Jihad':          { id: 14,  name: 'Jihad',            start: 3068 },
  'EarlyRepublic':  { id: 15,  name: 'Early Republic',   start: 3081 },
  'LateRepublic':   { id: 254, name: 'Late Republic',    start: 3101 },
  'DarkAge':        { id: 16,  name: 'Dark Age',         start: 3131 },
  'ilClan':         { id: 257, name: 'ilClan',           start: 3151 },
};

// Map MUL era IDs to our MegaMek era years (approximate mapping)
const ERA_TO_MEGAMEK = {
  'AgeOfWar': ['2398', '2440', '2460', '2470', '2490', '2520'],
  'StarLeague': ['2571', '2650', '2700', '2765'],
  'EarlySuccession': ['2780', '2807', '2815', '2823', '2830', '2835', '2855', '2860', '2865', '2870', '2900'],
  'LateSuccessionLT': ['2950'],
  'LateSuccessionR': ['3019', '3028', '3039', '3049'],
  'ClanInvasion': ['3049', '3055', '3058', '3060'],
  'CivilWar': ['3060', '3067'],
  'Jihad': ['3067', '3075', '3078'],
  'EarlyRepublic': ['3082', '3085', '3100'],
  'LateRepublic': ['3100', '3131'],
  'DarkAge': ['3131', '3145', '3150'],
  'ilClan': ['3150', '3160'],
};

// ─── Fetch with caching ────────────────────────────────────────────────

async function fetchMUL(factionKey, eraKey) {
  const faction = FACTIONS[factionKey];
  const era = ERAS[eraKey];
  if (!faction || !era) return null;

  const cacheFile = resolve(CACHE_DIR, `${factionKey}-${eraKey}.json`);

  if (existsSync(cacheFile)) {
    const cached = JSON.parse(await readFile(cacheFile, 'utf-8'));
    return cached;
  }

  const url = `${MUL_BASE}?Factions=${faction.id}&AvailableEras=${era.id}&Types=${TYPE_BATTLEMECH}`;
  console.log(`  Fetching ${factionKey}/${eraKey}: ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  WARN: ${res.status} for ${factionKey}/${eraKey}`);
    return null;
  }

  const data = await res.json();
  const units = data.Units || data;

  await writeFile(cacheFile, JSON.stringify(units, null, 2));

  // Rate limit
  await new Promise(r => setTimeout(r, DELAY_MS));

  return units;
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('=== MUL BattleMech Availability Ingestion ===\n');

  await mkdir(CACHE_DIR, { recursive: true });

  // Which factions/eras to pull: focus on major ones that overlap with MegaMek data
  const majorFactions = [
    'DC', 'FS', 'CC', 'FWL', 'LA', 'LC', 'FC', 'FRR', 'CS', 'WOB', 'SIC',
    'CW', 'CJF', 'CGB', 'CSJ', 'CHH', 'CNC', 'CSV', 'CDS', 'CSR',
    'CBS', 'CCO', 'CFM', 'CGS', 'CIH', 'CSA',
    'TC', 'MH', 'OA', 'MC',
    'MERC', 'KH', 'WD',
    'ROS', 'RD', 'RA',
    'SL', 'SLR', 'TH',
  ];

  const majorEras = [
    'AgeOfWar', 'StarLeague', 'EarlySuccession',
    'LateSuccessionLT', 'LateSuccessionR',
    'ClanInvasion', 'CivilWar', 'Jihad',
    'EarlyRepublic', 'LateRepublic', 'DarkAge', 'ilClan'
  ];

  const output = {
    meta: {
      source: 'Master Unit List (masterunitlist.azurewebsites.net)',
      generatedAt: new Date().toISOString(),
      description: 'Binary BattleMech availability by faction and era from MUL API',
      factionIds: FACTIONS,
      eraIds: ERAS,
      eraMegamekMapping: ERA_TO_MEGAMEK
    },
    availability: {}
  };

  let totalRequests = 0;
  let totalUnits = 0;

  for (const eraKey of majorEras) {
    console.log(`\nEra: ${ERAS[eraKey].name}`);
    output.availability[eraKey] = {};

    for (const factionKey of majorFactions) {
      // Skip obviously invalid combos (e.g., Clans before 2807, specific factions outside their years)
      const eraStart = ERAS[eraKey].start;
      if (factionKey.startsWith('C') && factionKey !== 'CS' && factionKey !== 'CC' && factionKey !== 'CIR' && eraStart < 2807) continue;
      if (factionKey === 'WOB' && eraStart < 2781) continue;
      if (factionKey === 'FC' && (eraStart < 3020 || eraStart > 3067)) continue;
      if (factionKey === 'ROS' && eraStart < 3081) continue;
      if (factionKey === 'RD' && eraStart < 3081) continue;
      if (factionKey === 'RA' && eraStart < 3068) continue;
      if (factionKey === 'FRR' && eraStart < 2781) continue;
      if (factionKey === 'SIC' && (eraStart < 2781 || eraStart > 3067)) continue;

      const units = await fetchMUL(factionKey, eraKey);
      totalRequests++;

      if (!units || units.length === 0) continue;

      // Build a clean availability record
      const mechs = {};
      for (const unit of units) {
        const chassisName = unit.Class || unit.Name?.split(' ')[0] || 'Unknown';
        const variant = unit.Variant || unit.Name || '';
        const key = chassisName;

        if (!mechs[key]) {
          mechs[key] = {
            chassis: chassisName,
            variants: [],
            tonnage: unit.Tonnage,
            technology: unit.Technology?.Name || 'Unknown'
          };
        }
        mechs[key].variants.push({
          name: unit.Name,
          variant: variant,
          bv: unit.BattleValue,
          pv: unit.BFPointValue,
          cost: unit.Cost,
          role: unit.Role?.Name || null,
          introduced: unit.DateIntroduced,
          rules: unit.Rules
        });
      }

      output.availability[eraKey][factionKey] = {
        totalUnits: units.length,
        totalChassis: Object.keys(mechs).length,
        chassis: mechs
      };

      totalUnits += units.length;
      console.log(`  ${factionKey}: ${units.length} units, ${Object.keys(mechs).length} chassis`);
    }
  }

  // Write output
  await writeFile(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`\nTotal requests: ${totalRequests}`);
  console.log(`Total units across all faction/era combos: ${totalUnits}`);
  console.log(`Output written to ${OUTPUT}`);
  console.log(`File size: ${(JSON.stringify(output).length / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(err => { console.error(err); process.exit(1); });
