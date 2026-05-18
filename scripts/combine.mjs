#!/usr/bin/env node
/**
 * combine.mjs — Generate app-data.json
 * 
 * Merges MegaMek weights with MUL availability data.
 * MUL availability is CUMULATIVE: if a faction has a chassis in any era
 * up to and including the current era, it's considered available.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const scores = JSON.parse(readFileSync(join(ROOT, 'output/scores.json'), 'utf8'));
const families = JSON.parse(readFileSync(join(ROOT, 'config/chassis-families.json'), 'utf8'));

// ── Load mekfile metadata (primary source for chassis/variant metadata) ──
const mekfilePath = join(ROOT, 'output/mekfile-metadata.json');
if (!existsSync(mekfilePath)) {
  console.log('mekfile-metadata.json not found, running parse-mekfiles.mjs...');
  execSync('node scripts/parse-mekfiles.mjs', { cwd: ROOT, stdio: 'inherit' });
}
const mekfileData = JSON.parse(readFileSync(mekfilePath, 'utf8'));
console.log(`Loaded mekfile metadata: ${Object.keys(mekfileData.chassis).length} chassis, ${Object.keys(mekfileData.variants).length} variants, ${Object.keys(mekfileData.modelPrefixes).length} prefixes`);

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

// ── Seed metadata from mekfile data (primary source) ──
const chassisMeta = {};
const modelPrefixes = {};
const variantMeta = {};

// Seed chassisMeta from mekfiles
for (const [name, mek] of Object.entries(mekfileData.chassis)) {
  chassisMeta[name] = {
    tonnage: mek.tonnage,
    introDate: mek.intro || null,
    tech: mek.tech || null,
    type: mek.omni ? 'OmniMech' : 'BattleMech'
  };
}

// Seed modelPrefixes from mekfiles
Object.assign(modelPrefixes, mekfileData.modelPrefixes);

// Seed variantMeta from mekfiles (intro only — BV comes from MUL)
for (const [variant, mek] of Object.entries(mekfileData.variants)) {
  variantMeta[variant] = {
    bv: null,  // BV not in .mtf files — filled from MUL below
    intro: mek.intro || null
  };
}

console.log(`Seeded from mekfiles: ${Object.keys(chassisMeta).length} chassis, ${Object.keys(variantMeta).length} variants, ${Object.keys(modelPrefixes).length} prefixes`);

// ── Load MUL cache data ──
// Build CUMULATIVE availability: { factionCode: { mulEraName: Set<chassisName> } }
// A chassis available in era N is also available in all eras > N
const mulRaw = {}; // per-era raw availability

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
    
    // Fill chassis metadata gaps: if mekfiles didn't have this chassis, use MUL
    if (!chassisMeta[chassis]) {
      chassisMeta[chassis] = {
        tonnage: entry.Tonnage,
        introDate: entry.DateIntroduced ? parseInt(entry.DateIntroduced) : null,
        tech: entry.Technology?.Name || null,
        type: entry.Type?.Name || null
      };
    } else {
      // Backfill earliest intro date from MUL if earlier
      if (entry.DateIntroduced) {
        const introYear = parseInt(entry.DateIntroduced);
        if (!chassisMeta[chassis].introDate || introYear < chassisMeta[chassis].introDate) {
          chassisMeta[chassis].introDate = introYear;
        }
      }
    }
    
    // Extract model prefix (fill gaps) + variant BV from MUL
    if (entry.Variant) {
      const variant = entry.Variant.trim();
      const prefix = variant.split('-')[0];
      if (prefix && prefix.length >= 2 && prefix.length <= 5) {
        if (!modelPrefixes[prefix] || modelPrefixes[prefix] === chassis) {
          modelPrefixes[prefix] = chassis;
        }
      }
      
      // Fill variant BV from MUL (primary BV source) and intro if missing
      if (!variantMeta[variant]) {
        variantMeta[variant] = {
          bv: entry.BattleValue || null,
          intro: entry.DateIntroduced ? parseInt(entry.DateIntroduced) : null
        };
      } else {
        if (!variantMeta[variant].bv && entry.BattleValue) {
          variantMeta[variant].bv = entry.BattleValue;
        }
        if (!variantMeta[variant].intro && entry.DateIntroduced) {
          variantMeta[variant].intro = parseInt(entry.DateIntroduced);
        }
      }
    }
  }
}

// ── Handle "(Omni)" suffixed chassis from MegaMek ──
// MegaMek's ingest creates separate entries for BattleMech vs OmniMech when they share
// a name (e.g., "Firestarter" and "Firestarter (Omni)"). We need to:
// 1. Map MUL metadata to these entries using tonnage to distinguish
// 2. Map MUL availability lookups using the base name

// Collect per-chassis tonnage sets from MUL for disambiguation
const chassisTonnages = {};  // { chassisName: Set<tonnage> }
const variantTonnage = {};   // { variantDesignation: tonnage }
for (const file of mulFiles) {
  if (!file.endsWith('.json')) continue;
  const entries = JSON.parse(readFileSync(join(mulCacheDir, file), 'utf8'));
  for (const entry of entries) {
    const chassis = entry.Class || entry.GroupName;
    if (!chassis || !entry.Tonnage) continue;
    if (!chassisTonnages[chassis]) chassisTonnages[chassis] = new Set();
    chassisTonnages[chassis].add(entry.Tonnage);
    if (entry.Variant) {
      variantTonnage[entry.Variant.trim()] = entry.Tonnage;
    }
  }
}

// Build MUL metadata for "(Omni)" entries
// The base name exists in chassisMeta from MUL (set to first tonnage seen).
// For "(Omni)" entries, find the OTHER tonnage from MUL.
const omniSuffixed = Object.keys(scores.eras).flatMap(era =>
  Object.keys(scores.eras[era]).filter(k => k.endsWith(' (Omni)'))
);
const omniBaseNames = [...new Set(omniSuffixed.map(k => k.replace(' (Omni)', '')))];

for (const baseName of omniBaseNames) {
  const omniName = baseName + ' (Omni)';
  const tonSet = chassisTonnages[baseName];
  const baseMeta = chassisMeta[baseName] || {};

  if (tonSet && tonSet.size >= 2) {
    // Different tonnages: BM gets lighter, Omni gets heavier
    const tons = [...tonSet].sort((a, b) => a - b);
    const bmTonnage = tons[0];
    const omniTonnage = tons[tons.length - 1];

    if (chassisMeta[baseName]) {
      chassisMeta[baseName] = { ...chassisMeta[baseName], tonnage: bmTonnage };
    }

    let introDate = null;
    for (const [v, vt] of Object.entries(variantTonnage)) {
      if (vt === omniTonnage) {
        const vm = variantMeta[v];
        if (vm?.intro && (!introDate || vm.intro < introDate)) introDate = vm.intro;
      }
    }
    chassisMeta[omniName] = {
      tonnage: omniTonnage,
      introDate: introDate || baseMeta.introDate,
      tech: baseMeta.tech,
      type: baseMeta.type
    };
  } else {
    // Same tonnage (or no MUL data): Omni entry shares the same tonnage as BM
    chassisMeta[omniName] = { ...baseMeta };
  }
}

if (omniBaseNames.length > 0) {
  console.log(`BM/Omni splits from MegaMek: ${omniBaseNames.join(', ')}`);
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

// Merge MUL availability: LA (Lyran Alliance) + LC (Lyran Commonwealth) → LC
// MegaMek uses LA internally; MUL treats them as separate factions (IDs 32 vs 60).
// We canonicalize on LC (Lyran Commonwealth) as the primary code.
if (mulCumulative['LA'] || mulCumulative['LC']) {
  if (!mulCumulative['LC']) mulCumulative['LC'] = {};
  // Merge LA data into LC
  if (mulCumulative['LA']) {
    for (const [era, chassisSet] of Object.entries(mulCumulative['LA'])) {
      if (!mulCumulative['LC'][era]) mulCumulative['LC'][era] = new Set();
      for (const ch of chassisSet) mulCumulative['LC'][era].add(ch);
    }
  }
  // Also copy LC back to LA key so hasMulAvail works during combine
  // (MegaMek weights reference LA, which we'll remap to LC in output)
  mulCumulative['LA'] = mulCumulative['LC'];
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
  GreatHouses: ['DC', 'FS', 'FWL', 'LC', 'CC'],
  Clans: ['CW', 'CJF', 'CGB', 'CSJ', 'CHH', 'CNC', 'CSV', 'CDS', 'CSR', 'CBS', 'CCO', 'CFM', 'CGS', 'CIH', 'CSA'],
  Periphery: ['TC', 'MH', 'OA', 'MC']
};

// Map faction codes to their general MUL pool
// IS General covers all IS factions (Great Houses + ComStar + FRR + misc IS)
// CLAN covers all Clan factions; PERI covers periphery states
const IS_FACTIONS = new Set([
  ...FACTION_GROUPS.GreatHouses, 'LA', 'FC', 'FRR', 'CS', 'WOB', 'SIC', 'ROS',
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

// ── Faction code remapping ──
// MegaMek uses LA (Lyran Alliance) internally; we canonicalize to LC (Lyran Commonwealth)
const FACTION_REMAP = { 'LA': 'LC' };

function remapFactionCode(code) {
  return FACTION_REMAP[code] || code;
}

// Helper: extract peak weight from a parsed availability entry
function peakWeight(entry) {
  if (Array.isArray(entry)) return entry[0]; // [base, modifier]
  if (typeof entry === 'object' && entry !== null) return Math.max(...Object.values(entry), 0); // explicit levels
  return entry; // plain number
}

// Remap faction keys in an object { factionCode: value } → { remappedCode: value }
// Values can be numbers, [base, mod] arrays, or {level: weight} objects
function remapFactionKeys(obj) {
  if (!obj) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const newKey = remapFactionCode(k);
    // If remapped key already exists, keep the higher peak value (merge LA+LC)
    if (result[newKey] !== undefined) {
      if (peakWeight(v) > peakWeight(result[newKey])) {
        result[newKey] = v;
      }
    } else {
      result[newKey] = v;
    }
  }
  return result;
}

// ── Faction display info + weight class distributions ──
const FACTION_INFO = {};
for (const [code, meta] of Object.entries(scores.factionMeta)) {
  const outCode = remapFactionCode(code);
  if (FACTION_INFO[outCode]) continue; // skip if already mapped (e.g. LA after LC)
  const wcd = scores.weightClassDistributions?.[code];
  FACTION_INFO[outCode] = {
    name: meta.name,
    clan: meta.clan,
    periphery: meta.periphery,
    minor: meta.minor,
    ...(wcd && Object.keys(wcd).length > 0 ? { wcd } : {})
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
  families: families,
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
    
    // If this chassis has a tonnage split, partition variants by tonnage
    allChassis.add(chassisName);
    
    const entry = { w: remapFactionKeys(data.weights) };
    
    if (data.variants && Object.keys(data.variants).length > 0) {
      const vOut = {};
      for (const [varName, factionWeights] of Object.entries(data.variants)) {
        const meta = variantMeta[varName];
        vOut[varName] = {
          w: remapFactionKeys(factionWeights),
          ...(meta?.bv != null ? { bv: meta.bv } : {}),
          ...(meta?.intro != null ? { intro: meta.intro } : {})
        };
      }
      entry.v = vOut;
    }
    
    // MUL availability per faction (cumulative)
    // For "(Omni)" entries, look up MUL using the base name (MUL doesn't suffix)
    const mulLookupName = chassisName.replace(' (Omni)', '');
    if (mulEra) {
      const mul = {};
      for (const faction of Object.keys(data.weights)) {
        if (hasMulAvail(faction, mulEra, mulLookupName)) {
          mul[remapFactionCode(faction)] = 1;
        }
      }
      if (Object.keys(mul).length > 0) {
        entry.mul = mul;
      }
    }
    
    // Stamp family membership from chassis-families.json config
    const famName = chassisToFamily[chassisName] || chassisToFamily[mulLookupName];
    if (famName) {
      entry.fam = famName;
    }
    
    eraOut[chassisName] = entry;
  }
  
  appData.eraData[eraYear] = eraOut;
}

// Collect omni status from scores data (any era where chassis appears)
const omniMap = {};
for (const [eraYear, chassisEntries] of Object.entries(scores.eras)) {
  for (const [name, data] of Object.entries(chassisEntries)) {
    if (data.omni && !omniMap[name]) omniMap[name] = data.omni;
  }
}

// Fill chassis metadata
for (const name of allChassis) {
  const meta = chassisMeta[name];
  const tonnage = meta?.tonnage || null;
  const isOmni = !!omniMap[name];
  appData.chassis[name] = {
    tons: tonnage,
    class: weightClass(tonnage),
    intro: meta?.introDate || null,
    industrial: meta?.type === 'IndustrialMech',
    tech: meta?.tech || null,
    omni: isOmni
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
