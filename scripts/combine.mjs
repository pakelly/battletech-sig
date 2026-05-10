#!/usr/bin/env node
/**
 * combine.mjs — Generate app-data.json
 * 
 * Merges MegaMek weights with MUL availability data.
 * MUL availability is CUMULATIVE: if a faction has a chassis in any era
 * up to and including the current era, it's considered available.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const scores = JSON.parse(readFileSync(join(ROOT, 'output/scores.json'), 'utf8'));
const families = JSON.parse(readFileSync(join(ROOT, 'config/chassis-families.json'), 'utf8'));

// ── MUL era ordering (chronological) ──
const MUL_ERA_ORDER = [
  'AgeOfWar', 'StarLeague', 'EarlySuccession',
  'LateSuccessionLT', 'LateSuccessionR',
  'ClanInvasion', 'CivilWar', 'Jihad',
  'EarlyRepublic', 'LateRepublic', 'DarkAge', 'ilClan'
];

// MegaMek year → MUL era name
const YEAR_TO_MUL_ERA = {};
const yearToMulEra = {
  2398: 'AgeOfWar', 2440: 'AgeOfWar', 2460: 'AgeOfWar', 2470: 'AgeOfWar', 2490: 'AgeOfWar', 2520: 'AgeOfWar',
  2571: 'StarLeague', 2650: 'StarLeague', 2700: 'StarLeague', 2765: 'StarLeague',
  2780: 'EarlySuccession', 2807: 'EarlySuccession', 2815: 'EarlySuccession', 2823: 'EarlySuccession',
  2830: 'EarlySuccession', 2835: 'EarlySuccession', 2855: 'EarlySuccession', 2860: 'EarlySuccession',
  2865: 'EarlySuccession', 2870: 'EarlySuccession',
  2900: 'LateSuccessionLT', 2950: 'LateSuccessionLT',
  3019: 'LateSuccessionR', 3028: 'LateSuccessionR', 3039: 'LateSuccessionR',
  3049: 'ClanInvasion', 3055: 'ClanInvasion', 3058: 'ClanInvasion', 3060: 'ClanInvasion',
  3067: 'CivilWar',
  3075: 'Jihad', 3078: 'Jihad',
  3082: 'EarlyRepublic', 3085: 'EarlyRepublic',
  3100: 'LateRepublic',
  3131: 'DarkAge', 3145: 'DarkAge', 3150: 'DarkAge',
  3160: 'ilClan'
};

// Era list with labels for UI
const ERA_LIST = [
  { year: 2398, label: 'Age of War (2398)', mulEra: 'AgeOfWar' },
  { year: 2440, label: 'Age of War (2440)', mulEra: 'AgeOfWar' },
  { year: 2460, label: 'Age of War (2460)', mulEra: 'AgeOfWar' },
  { year: 2470, label: 'Age of War (2470)', mulEra: 'AgeOfWar' },
  { year: 2490, label: 'Age of War (2490)', mulEra: 'AgeOfWar' },
  { year: 2520, label: 'Age of War (2520)', mulEra: 'AgeOfWar' },
  { year: 2571, label: 'Star League (2571)', mulEra: 'StarLeague' },
  { year: 2650, label: 'Star League (2650)', mulEra: 'StarLeague' },
  { year: 2700, label: 'Star League (2700)', mulEra: 'StarLeague' },
  { year: 2765, label: 'Star League (2765)', mulEra: 'StarLeague' },
  { year: 2780, label: 'Early Succession Wars (2780)', mulEra: 'EarlySuccession' },
  { year: 2807, label: 'Early Succession Wars (2807)', mulEra: 'EarlySuccession' },
  { year: 2815, label: 'Early Succession Wars (2815)', mulEra: 'EarlySuccession' },
  { year: 2823, label: 'Early Succession Wars (2823)', mulEra: 'EarlySuccession' },
  { year: 2830, label: 'Early Succession Wars (2830)', mulEra: 'EarlySuccession' },
  { year: 2835, label: 'Early Succession Wars (2835)', mulEra: 'EarlySuccession' },
  { year: 2855, label: 'Early Succession Wars (2855)', mulEra: 'EarlySuccession' },
  { year: 2860, label: 'Early Succession Wars (2860)', mulEra: 'EarlySuccession' },
  { year: 2865, label: 'Early Succession Wars (2865)', mulEra: 'EarlySuccession' },
  { year: 2870, label: 'Early Succession Wars (2870)', mulEra: 'EarlySuccession' },
  { year: 2900, label: 'Late Succession - LosTech (2900)', mulEra: 'LateSuccessionLT' },
  { year: 2950, label: 'Late Succession - LosTech (2950)', mulEra: 'LateSuccessionLT' },
  { year: 3019, label: 'Late Succession - Renaissance (3019)', mulEra: 'LateSuccessionR' },
  { year: 3028, label: 'Late Succession - Renaissance (3028)', mulEra: 'LateSuccessionR' },
  { year: 3039, label: 'Late Succession - Renaissance (3039)', mulEra: 'LateSuccessionR' },
  { year: 3049, label: 'Clan Invasion (3049)', mulEra: 'ClanInvasion' },
  { year: 3055, label: 'Clan Invasion (3055)', mulEra: 'ClanInvasion' },
  { year: 3058, label: 'Clan Invasion (3058)', mulEra: 'ClanInvasion' },
  { year: 3060, label: 'Clan Invasion (3060)', mulEra: 'ClanInvasion' },
  { year: 3067, label: 'Civil War (3067)', mulEra: 'CivilWar' },
  { year: 3075, label: 'Jihad (3075)', mulEra: 'Jihad' },
  { year: 3078, label: 'Jihad (3078)', mulEra: 'Jihad' },
  { year: 3082, label: 'Early Republic (3082)', mulEra: 'EarlyRepublic' },
  { year: 3085, label: 'Early Republic (3085)', mulEra: 'EarlyRepublic' },
  { year: 3100, label: 'Late Republic (3100)', mulEra: 'LateRepublic' },
  { year: 3131, label: 'Dark Age (3131)', mulEra: 'DarkAge' },
  { year: 3145, label: 'Dark Age (3145)', mulEra: 'DarkAge' },
  { year: 3150, label: 'Dark Age (3150)', mulEra: 'DarkAge' },
  { year: 3160, label: 'ilClan (3160)', mulEra: 'ilClan' }
];

// ── Load MUL cache data ──
// Build CUMULATIVE availability: { factionCode: { mulEraName: Set<chassisName> } }
// A chassis available in era N is also available in all eras > N
const mulRaw = {}; // per-era raw availability
const chassisMeta = {};
const modelPrefixes = {};

const mulCacheDir = join(ROOT, 'data/mul-cache');
const mulFiles = readdirSync(mulCacheDir);

for (const file of mulFiles) {
  if (!file.endsWith('.json')) continue;
  const match = file.match(/^([^-]+)-(.+)\.json$/);
  if (!match) continue;
  const [, faction, mulEra] = match;
  
  if (!mulRaw[faction]) mulRaw[faction] = {};
  if (!mulRaw[faction][mulEra]) mulRaw[faction][mulEra] = new Set();
  
  const entries = JSON.parse(readFileSync(join(mulCacheDir, file), 'utf8'));
  for (const entry of entries) {
    const chassis = entry.Class || entry.GroupName;
    if (!chassis) continue;
    mulRaw[faction][mulEra].add(chassis);
    
    // Collect chassis metadata (earliest intro date)
    if (!chassisMeta[chassis]) {
      chassisMeta[chassis] = {
        tonnage: entry.Tonnage,
        introDate: entry.DateIntroduced ? parseInt(entry.DateIntroduced) : null,
        tech: entry.Technology?.Name || null,
        type: entry.Type?.Name || null
      };
    }
    if (entry.DateIntroduced) {
      const introYear = parseInt(entry.DateIntroduced);
      if (!chassisMeta[chassis].introDate || introYear < chassisMeta[chassis].introDate) {
        chassisMeta[chassis].introDate = introYear;
      }
    }
    
    // Extract model prefix
    if (entry.Variant) {
      const prefix = entry.Variant.split('-')[0];
      if (prefix && prefix.length >= 2 && prefix.length <= 5) {
        if (!modelPrefixes[prefix] || modelPrefixes[prefix] === chassis) {
          modelPrefixes[prefix] = chassis;
        }
      }
    }
  }
}

// Build cumulative availability: once a faction gets a chassis, they keep it
const mulCumulative = {}; // { faction: { mulEra: Set<chassis> } }
for (const [faction, eraData] of Object.entries(mulRaw)) {
  mulCumulative[faction] = {};
  const accumulated = new Set();
  for (const era of MUL_ERA_ORDER) {
    if (eraData[era]) {
      for (const ch of eraData[era]) accumulated.add(ch);
    }
    mulCumulative[faction][era] = new Set(accumulated);
  }
}

// Merge LC (Lyran Commonwealth) availability into LA (Lyran Alliance)
// MegaMek uses LA for both eras; MUL treats them as separate factions (IDs 32 vs 60)
if (mulCumulative['LC']) {
  if (!mulCumulative['LA']) mulCumulative['LA'] = {};
  for (const [era, chassisSet] of Object.entries(mulCumulative['LC'])) {
    if (!mulCumulative['LA'][era]) mulCumulative['LA'][era] = new Set();
    for (const ch of chassisSet) mulCumulative['LA'][era].add(ch);
  }
}

function weightClass(tonnage) {
  if (!tonnage) return null;
  if (tonnage <= 35) return 'Light';
  if (tonnage <= 55) return 'Medium';
  if (tonnage <= 75) return 'Heavy';
  return 'Assault';
}

// ── Faction groups ──
const FACTION_GROUPS = {
  GreatHouses: ['DC', 'FS', 'FWL', 'LA', 'CC'],
  Clans: ['CW', 'CJF', 'CGB', 'CSJ', 'CHH', 'CNC', 'CSV', 'CDS', 'CSR', 'CBS', 'CCO', 'CFM', 'CGS', 'CIH', 'CSA'],
  Periphery: ['TC', 'MH', 'OA', 'MC']
};

// Map faction codes to their general MUL pool
// IS General covers all IS factions (Great Houses + ComStar + FRR + misc IS)
// CLAN covers all Clan factions; PERI covers periphery states
const IS_FACTIONS = new Set([
  ...FACTION_GROUPS.GreatHouses, 'LC', 'FC', 'FRR', 'CS', 'WOB', 'SIC', 'ROS',
  'MERC', 'KH', 'WD', 'SL', 'SLR', 'TH'
]);
const CLAN_FACTIONS = new Set(FACTION_GROUPS.Clans);
const PERI_FACTIONS = new Set(FACTION_GROUPS.Periphery);

function getGeneralPool(factionCode) {
  if (IS_FACTIONS.has(factionCode)) return 'IS';
  if (CLAN_FACTIONS.has(factionCode)) return 'CLAN';
  if (PERI_FACTIONS.has(factionCode)) return 'PERI';
  return null;
}

function hasMulAvail(factionCode, mulEra, chassisName) {
  // Direct faction match
  if (mulCumulative[factionCode]?.[mulEra]?.has(chassisName)) return true;
  // Fall back to general pool (IS/CLAN/PERI)
  const pool = getGeneralPool(factionCode);
  if (pool && mulCumulative[pool]?.[mulEra]?.has(chassisName)) return true;
  return false;
}

// ── Faction display info ──
const FACTION_INFO = {};
for (const [code, meta] of Object.entries(scores.factionMeta)) {
  FACTION_INFO[code] = {
    name: meta.name,
    clan: meta.clan,
    periphery: meta.periphery,
    minor: meta.minor
  };
}

// ── Build app-data ──
const appData = {
  _meta: {
    generated: new Date().toISOString(),
    description: 'BattleTech Faction Signatures app data',
    mulCumulative: true
  },
  factions: FACTION_INFO,
  factionGroups: FACTION_GROUPS,
  eras: ERA_LIST,
  families: families.filter(f => f.enabled),
  modelPrefixes,
  chassis: {},
  eraData: {}
};

const allChassis = new Set();

// Build chassis → family group name lookup from config
const chassisToFamily = {};
for (const fam of families) {
  for (const ch of fam.chassis) {
    chassisToFamily[ch] = fam.groupName;
  }
}

for (const [eraYear, chassisEntries] of Object.entries(scores.eras)) {
  const eraOut = {};
  const mulEra = yearToMulEra[parseInt(eraYear)];
  
  for (const [chassisName, data] of Object.entries(chassisEntries)) {
    allChassis.add(chassisName);
    
    const entry = { w: data.weights };
    
    if (data.variants && Object.keys(data.variants).length > 0) {
      entry.v = data.variants;
    }
    
    // MUL availability per faction (cumulative)
    if (mulEra) {
      const mul = {};
      for (const faction of Object.keys(data.weights)) {
        if (hasMulAvail(faction, mulEra, chassisName)) {
          mul[faction] = 1;
        }
      }
      if (Object.keys(mul).length > 0) {
        entry.mul = mul;
      }
    }
    
    // Stamp family membership from chassis-families.json config
    const famName = chassisToFamily[chassisName];
    if (famName) {
      entry.fam = famName;
    }
    
    eraOut[chassisName] = entry;
  }
  
  appData.eraData[eraYear] = eraOut;
}

// Fill chassis metadata
for (const name of allChassis) {
  const meta = chassisMeta[name];
  const tonnage = meta?.tonnage || null;
  appData.chassis[name] = {
    tons: tonnage,
    class: weightClass(tonnage),
    intro: meta?.introDate || null,
    industrial: meta?.type === 'IndustrialMech',
    tech: meta?.tech || null
  };
}

// Copy to app/ directory too
writeFileSync(join(ROOT, 'output/app-data.json'), JSON.stringify(appData));
writeFileSync(join(ROOT, 'app/app-data.json'), JSON.stringify(appData));

const sizeKB = Math.round(JSON.stringify(appData).length / 1024);
console.log(`app-data.json written: ${sizeKB}KB, ${allChassis.size} chassis, ${Object.keys(appData.eraData).length} eras`);

// Stats
let mulCoverage = 0, totalEntries = 0;
for (const [eraYear, chassisEntries] of Object.entries(appData.eraData)) {
  for (const [cn, entry] of Object.entries(chassisEntries)) {
    const factions = Object.keys(entry.w);
    totalEntries += factions.length;
    if (entry.mul) mulCoverage += Object.keys(entry.mul).length;
  }
}
console.log(`MUL coverage: ${mulCoverage}/${totalEntries} faction+chassis entries (${Math.round(100*mulCoverage/totalEntries)}%)`);
