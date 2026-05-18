/* ── BattleTech Faction Signatures — Client App ── */

const APP_VERSION = '1.18.4';
const DEPLOY_TIME = '20260518.0132';

let DATA = null; // app-data.json

// ── Faction code aliases ──
const FACTION_ALIASES = {
  'dc': 'DC', 'draconis': 'DC', 'draconis combine': 'DC', 'kurita': 'DC',
  'fs': 'FS', 'fedsuns': 'FS', 'federated suns': 'FS', 'davion': 'FS',
  'fwl': 'FWL', 'free worlds': 'FWL', 'free worlds league': 'FWL', 'marik': 'FWL',
  'lc': 'LC', 'lyran': 'LC', 'lyran commonwealth': 'LC', 'lyran alliance': 'LC', 'steiner': 'LC',
  'la': 'LC', // Map LA (Lyran Alliance) to LC — Commonwealth is the canonical name
  'cc': 'CC', 'capellan': 'CC', 'capellan confederation': 'CC', 'liao': 'CC',
  'fc': 'FC', 'fedcom': 'FC', 'federated commonwealth': 'FC',
  'frr': 'FRR', 'rasalhague': 'FRR', 'free rasalhague republic': 'FRR',
  'cs': 'CS', 'comstar': 'CS',
  'wob': 'WOB', 'word of blake': 'WOB', 'wobblies': 'WOB',
  'cw': 'CW', 'clan wolf': 'CW', 'wolf': 'CW',
  'cjf': 'CJF', 'jade falcon': 'CJF', 'clan jade falcon': 'CJF',
  'cgb': 'CGB', 'ghost bear': 'CGB', 'clan ghost bear': 'CGB',
  'csj': 'CSJ', 'smoke jaguar': 'CSJ', 'clan smoke jaguar': 'CSJ',
  'chh': 'CHH', 'hells horses': 'CHH', "hell's horses": 'CHH',
  'cnc': 'CNC', 'nova cat': 'CNC',
  'csv': 'CSV', 'steel viper': 'CSV',
  'cds': 'CDS', 'diamond shark': 'CDS',
  'csr': 'CSR', 'snow raven': 'CSR',
  'cbs': 'CBS', 'blood spirit': 'CBS',
  'cco': 'CCO', 'coyote': 'CCO',
  'cfm': 'CFM', 'fire mandrill': 'CFM',
  'cgs': 'CGS', 'goliath scorpion': 'CGS',
  'cih': 'CIH', 'ice hellion': 'CIH',
  'csa': 'CSA', 'star adder': 'CSA',
  'merc': 'MERC', 'mercenary': 'MERC', 'mercs': 'MERC',
  'tc': 'TC', 'taurian': 'TC', 'taurian concordat': 'TC',
  'mh': 'MH', 'marian': 'MH', 'marian hegemony': 'MH',
  'oa': 'OA', 'outworlds': 'OA', 'outworlds alliance': 'OA',
  'mc': 'MC', 'canopus': 'MC', 'magistracy': 'MC',
  'kh': 'KH', 'kell hounds': 'KH',
  'wd': 'WD', "wolf's dragoons": 'WD', 'dragoons': 'WD',
  'ros': 'ROS', 'republic': 'ROS', 'republic of the sphere': 'ROS',
  'sic': 'SIC', 'st. ives': 'SIC', 'st ives': 'SIC',
  'rd': 'RD', 'rasalhague dominion': 'RD',
  'ra': 'RA', 'raven alliance': 'RA',
  'sl': 'SL', 'star league': 'SL',
  'slr': 'SLR', 'star league royal': 'SLR',
  'th': 'TH', 'terran hegemony': 'TH',
};

// ── Unit Quality Rating Resolution ──
// MegaMek weights encode unit quality via [base, modifier]:
//   [8, "+"] → elite-skewed: A=8, B=7, C=6, D=5, F=4
//   [8, "-"] → garrison-skewed: F=8, D=7, C=6, B=5, A=4
//   [8, 0]   → flat across all tiers
//   { A: 7, B: 5, C: 4, D: 3 } → explicit per-level
// Rating indices: F=0, D=1, C=2, B=3, A=4 (IS) / PGC=0, Sol=1, SL=2, FL=3, K=4 (Clan)

const RATING_LEVELS = ['F', 'D', 'C', 'B', 'A'];
const RATING_INDEX = { F: 0, D: 1, C: 2, B: 3, A: 4 };
const NUM_LEVELS = 5;

// Map explicit Clan level names to tier indices
const CLAN_LEVEL_INDEX = {
  'PGC': 0, 'Provisional Garrison': 0,
  'Solahma': 1, 'Sol': 1,
  'Second Line': 2, 'SL': 2,
  'Front Line': 3, 'FL': 3,
  'Keshik': 4, 'K': 4
};

/**
 * Resolve a weight entry to a single numeric value for a given rating tier.
 * @param {Array|Object|number} entry - [base, mod], {level: weight}, or plain number
 * @param {number|null} ratingIdx - 0-4 tier index, or null for cross-tier average
 * @returns {number} resolved weight (may be fractional for averages)
 */
function resolveWeight(entry, ratingIdx) {
  if (typeof entry === 'number') return entry; // legacy plain number

  if (Array.isArray(entry)) {
    const [base, mod] = entry;
    if (mod === 0 || mod === '0' || !mod) {
      return base; // flat — same at all tiers
    }
    if (ratingIdx !== null && ratingIdx !== undefined) {
      // Resolve for specific tier
      let val;
      if (mod === '+') {
        val = base - (NUM_LEVELS - 1 - ratingIdx);
      } else { // '-'
        val = base - ratingIdx;
      }
      return Math.max(0, val);
    }
    // Cross-tier average (default)
    let sum = 0;
    for (let i = 0; i < NUM_LEVELS; i++) {
      let val;
      if (mod === '+') {
        val = base - (NUM_LEVELS - 1 - i);
      } else { // '-'
        val = base - i;
      }
      sum += Math.max(0, val);
    }
    return sum / NUM_LEVELS;
  }

  if (typeof entry === 'object' && entry !== null) {
    // Explicit per-level: { A: 7, B: 5, ... } or { Keshik: 4, "Front Line": 3, ... }
    if (ratingIdx !== null && ratingIdx !== undefined) {
      // Try IS level name first, then Clan level names
      const isLevel = RATING_LEVELS[ratingIdx];
      if (entry[isLevel] !== undefined) return entry[isLevel];
      // Try Clan level names for this index
      for (const [name, idx] of Object.entries(CLAN_LEVEL_INDEX)) {
        if (idx === ratingIdx && entry[name] !== undefined) return entry[name];
      }
      return 0; // tier not present = extinct
    }
    // Cross-tier average: average all level values, pad with zeros for missing levels
    const values = Object.values(entry);
    if (values.length === 0) return 0;
    // Pad to NUM_LEVELS (missing tiers = 0)
    const sum = values.reduce((a, b) => a + Math.max(0, b), 0);
    return sum / NUM_LEVELS;
  }

  return 0;
}

/**
 * Resolve all faction weights in a weights object.
 * @param {Object} weights - { factionCode: [base, mod] | {levels} | number }
 * @param {number|null} ratingIdx - tier index or null for average
 * @returns {Object} { factionCode: number }
 */
function resolveWeights(weights, ratingIdx) {
  const result = {};
  for (const [f, entry] of Object.entries(weights)) {
    result[f] = resolveWeight(entry, ratingIdx);
  }
  return result;
}

// ── Logarithmic Scale Conversion ──
// MegaMek availability ratings use a base-2 log scale: probability_weight = 2^(rating/2)
function toProb(rating) {
  if (rating <= 0) return 0;
  return Math.pow(2, rating / 2);
}

/**
 * Convert a weight entry to probability space, correctly averaging across tiers.
 * When ratingIdx is null (cross-tier average), converts each tier to prob first,
 * then averages — avoiding Jensen's inequality distortion from averaging on
 * the log scale before converting (Jensen's inequality).
 * When ratingIdx is an array (multi-rating), averages only those tiers in prob space.
 */
function entryToProb(entry, ratingIdx) {
  if (Array.isArray(ratingIdx)) {
    // Multi-rating: average specified tiers in probability space
    let sum = 0;
    for (const idx of ratingIdx) {
      sum += toProb(resolveWeight(entry, idx));
    }
    return sum / ratingIdx.length;
  }
  if (ratingIdx !== null && ratingIdx !== undefined) {
    return toProb(resolveWeight(entry, ratingIdx));
  }
  // Cross-tier average in probability space
  let sum = 0;
  for (let i = 0; i < NUM_LEVELS; i++) {
    sum += toProb(resolveWeight(entry, i));
  }
  return sum / NUM_LEVELS;
}

// ── Weight Class Distribution ──
// MegaMek applies weight class distribution as table-level mixing, NOT per-chassis adjustment.
// Within a weight class, chassis compete on raw availability only.
// When showing all weight classes together, each chassis's weight is scaled by the
// faction's proportion for that weight class: faction_wcd[class] / sum(faction_wcd).
// When filtering to a single weight class, WCD mixing is skipped entirely.

const WCD_CLASS_INDEX = { Light: 0, Medium: 1, Heavy: 2, Assault: 3 };

/**
 * Get the weight class distribution for a faction in a given era.
 * Falls back through era years (closest earlier era).
 */
function getFactionWcd(factionCode, eraYear) {
  if (!DATA) return null;
  const wcd = DATA.factions[factionCode]?.wcd;
  if (!wcd) return null;
  
  // Exact match
  if (wcd[eraYear]) return wcd[eraYear];
  
  // Find closest earlier era
  const years = Object.keys(wcd).map(Number).sort((a, b) => a - b);
  let best = null;
  for (const y of years) {
    if (y <= eraYear) best = wcd[y];
  }
  return best;
}

/**
 * Get the WCD mixing factor for a chassis in a faction.
 * Returns the faction's proportion for this weight class: wcd[classIdx] / sum(wcd).
 * Returns 1 if no WCD data (faction inherits baseline, no adjustment needed in mixed view).
 */
function getWcdMixingFactor(factionCode, chassisClass, eraYear) {
  if (!chassisClass) return 1;
  const idx = WCD_CLASS_INDEX[chassisClass];
  if (idx === undefined) return 1;
  
  const wcd = getFactionWcd(factionCode, eraYear);
  if (!wcd) return 1;
  
  const total = wcd.reduce((a, b) => a + b, 0);
  if (total === 0) return 1;
  
  return wcd[idx] / total;
}

/**
 * Resolve quality rating to numeric weights per faction.
 * No weight class adjustment — ratings are relative within their weight class.
 * Returns { factionCode: resolvedRating }
 */
function computeResolvedWeights(rawWeights, ratingIdx) {
  const resolved = resolveWeights(rawWeights, ratingIdx);
  const result = {};
  
  for (const [f, rating] of Object.entries(resolved)) {
    result[f] = Math.max(0, rating);
  }
  
  return result;
}

// ── Query Parser ──

function parseQuery(queryStr) {
  const result = {
    factions: [],
    chassis: [],
    chassisOp: '=',    // '=' or '!='
    class: null,       // {op, values: []} or null
    spread: null,    // {op, val}
    span: null,
    avgWeight: null,
    weight: null,
    sig: null,
    tons: null,
    bv: [],          // [{op, val}] — multiple allowed (bv>1000 bv<1500)
    factionWeight: [],  // [{faction, op, val}]
    factionSig: [],   // [{faction, op, val}]
    year: null,
    era: null,
    rating: null,     // 'A'|'B'|'C'|'D'|'F' or null (cross-tier average)
    family: null,     // 'on' | 'off'
    industrial: null,  // 'show' | 'hide'
    type: null,        // 'omni' | 'battlemech'
    tech: null,        // 'clan' | 'is' | 'mixed'
    mode: 'B',
    sort: [],          // [{field, dir}]
    raw: queryStr
  };

  if (!queryStr || !queryStr.trim()) return result;

  let q = queryStr.trim();

  // Extract sort clause first
  const sortMatch = q.match(/\bsort\s+by\s+(.+)$/i);
  if (sortMatch) {
    q = q.slice(0, sortMatch.index).trim();
    const sortParts = sortMatch[1].split(',').map(s => s.trim());
    for (const part of sortParts) {
      const tokens = part.split(/\s+/);
      let field = tokens[0].toLowerCase();
      let dir = 'desc';
      
      // Handle "DC preference desc" or "DC sig desc" -> field = DC-preference or DC-sig
      if (tokens.length >= 2 && (tokens[1].toLowerCase() === 'preference' || tokens[1].toLowerCase() === 'weight' || tokens[1].toLowerCase() === 'sig' || tokens[1].toLowerCase() === 'signature' || tokens[1].toLowerCase() === 'dr' || tokens[1].toLowerCase() === 'distinctiveness')) {
        const factionCode = resolveFaction(tokens[0]);
        const metric = (tokens[1].toLowerCase() === 'preference' || tokens[1].toLowerCase() === 'weight') ? 'weight' : 'sig'; // dr/distinctiveness also maps to sig
        if (factionCode) {
          field = factionCode + '-' + metric;
        } else {
          field = metric;
        }
        dir = (tokens[2] || 'desc').toLowerCase();
      } else {
        field = tokens[0].toLowerCase();
        // Handle faction-prefixed fields: fs-sig, dc-pref, dc-preference
        const prefixMatch = field.match(/^([a-z]+)-(sig|signature|dr|distinctiveness|pref|preference|weight)$/);
        if (prefixMatch) {
          const fCode = resolveFaction(prefixMatch[1]);
          const metric = (prefixMatch[2].startsWith('pref') || prefixMatch[2] === 'weight') ? 'weight' : 'sig';
          if (fCode) {
            field = fCode + '-' + metric;
          }
        } else {
          field = field.replace('-', '');
          if (field === 'avgpref') field = 'avg-pref';
          if (field === 'avgweight') field = 'avg-weight';
        }
        dir = (tokens[1] || 'desc').toLowerCase();
      }
      
      result.sort.push({ field, dir: dir === 'asc' ? 'asc' : 'desc' });
    }
  }

  // Normalize NOT prefix: "NOT field=value" → "field!=value"
  q = q.replace(/\bNOT\s+(\w[\w-]*)\s*=/gi, '$1!=');

  // Auto-quote multi-word chassis names: chassis=King Crab → chassis="King Crab"
  // Greedy match: after chassis= (not already quoted/parenthesized), try 2-4 word combos
  // and see if they resolve to a known chassis before the regex parser splits on whitespace.
  if (DATA?.chassis) {
    q = q.replace(/\bchassis\s*(=|!=)\s*(?!["(])(\S+(?:\s+\S+){0,3})/gi, (full, op, val) => {
      // Try progressively shorter multi-word combos
      const words = val.split(/\s+/);
      for (let len = words.length; len >= 2; len--) {
        const candidate = words.slice(0, len).join(' ');
        const resolved = resolveChassis(candidate);
        if (resolved !== candidate || DATA.chassis[candidate]) {
          const remainder = words.slice(len).join(' ');
          return 'chassis' + op + '"' + candidate + '"' + (remainder ? ' ' + remainder : '');
        }
      }
      return full; // no multi-word match, leave as-is
    });
  }

  // Parse individual field expressions
  // Tokenize: handle parenthesized OR groups
  const fieldRegex = /(\w[\w-]*)\s*(=|!=|>=|<=|>|<)\s*(\([^)]+\)|"[^"]+"|[^\s]+)/gi;
  let match;
  
  while ((match = fieldRegex.exec(q)) !== null) {
    const field = match[1].toLowerCase();
    const op = match[2];
    let value = match[3];
    
    // Remove quotes
    value = value.replace(/^"|"$/g, '');
    
    switch (field) {
      case 'faction': {
        const factions = parseValueList(value);
        for (const f of factions) {
          const resolved = resolveFactionGroup(f);
          result.factions.push(...resolved);
        }
        // Deduplicate
        result.factions = [...new Set(result.factions)];
        break;
      }
      case 'chassis': {
        const chassis = parseValueList(value);
        result.chassis.push(...chassis);
        result.chassisOp = op;
        break;
      }
      case 'class': {
        const classes = parseValueList(value).map(v => v.toLowerCase());
        result.class = { op, values: classes };
        break;
      }
      case 'spread':
        result.spread = { op, val: parseFloat(value) };
        break;
      case 'span':
        result.span = { op, val: parseFloat(value) };
        break;
      case 'avg-pref':
      case 'avgpref':
      case 'avg-weight':
      case 'avgweight':
        result.avgWeight = { op, val: parseFloat(value) };
        break;
      case 'weight':
        result.weight = { op, val: parseFloat(value) };
        break;
      case 'sig':
      case 'signature':
      case 'dr':
      case 'distinctiveness':
        result.sig = { op, val: parseFloat(value) };
        break;
      case 'year':
        result.year = parseInt(value);
        break;
      case 'era':
        result.era = value;
        break;
      case 'family':
        result.family = value.toLowerCase();
        break;
      case 'industrial':
        result.industrial = value.toLowerCase();
        break;
      case 'type':
        result.type = value.toLowerCase();
        break;
      case 'tech':
        result.tech = value.toLowerCase();
        break;
      case 'mode':
        result.mode = value.toUpperCase();
        break;
      case 'rating':
        // Support single (rating=A) or multi (rating=(A OR B))
        const rVals = value.toUpperCase().split(/\s+OR\s+|\s*,\s*/).map(v => v.replace(/[()]/g, '').trim());
        const validRatings = rVals.filter(v => RATING_INDEX[v] !== undefined);
        if (validRatings.length === 1) {
          result.rating = validRatings[0];
        } else if (validRatings.length > 1) {
          result.rating = validRatings; // array signals multi-rating average
        }
        break;
      case 'tons':
      case 'tonnage':
        result.tons = { op, val: parseFloat(value) };
        break;
      case 'bv':
      case 'battlevalue':
        result.bv.push({ op, val: parseFloat(value) });
        break;
      default: {
        // Handle faction-prefixed filters: DC-pref>8, FS-sig>5, etc.
        const fpMatch = field.match(/^([a-z]+)-(pref|preference|weight|sig|signature|dr|distinctiveness)$/);
        if (fpMatch) {
          const fCode = resolveFaction(fpMatch[1]);
          const metric = (fpMatch[2].startsWith('pref') || fpMatch[2].startsWith('w')) ? 'weight' : 'sig'; // dr/distinctiveness also → sig
          if (fCode) {
            const entry = { faction: fCode, op, val: parseFloat(value) };
            if (metric === 'weight') result.factionWeight.push(entry);
            else result.factionSig.push(entry);
          }
        }
        break;
      }
    }
  }

  return result;
}

function parseValueList(value) {
  // Handle "(X OR Y OR Z)" and bare values
  value = value.replace(/^\(|\)$/g, '');
  return value.split(/\s+OR\s+/i).map(v => v.trim().replace(/^"|"$/g, ''));
}

function resolveFaction(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  
  // Direct alias lookup
  if (FACTION_ALIASES[lower]) return FACTION_ALIASES[lower];
  
  // Check if it's already a valid faction code
  const upper = name.toUpperCase();
  if (DATA && DATA.factions[upper]) return upper;
  
  // Partial match on faction names
  if (DATA) {
    for (const [code, info] of Object.entries(DATA.factions)) {
      if (info.name.toLowerCase().includes(lower)) return code;
    }
  }
  
  return name.toUpperCase(); // fallback
}

function resolveFactionGroup(name) {
  const lower = name.toLowerCase().trim();
  
  // Check faction groups first
  if (lower === 'greathouses' || lower === 'great houses') {
    return DATA?.factionGroups?.GreatHouses || ['DC', 'FS', 'FWL', 'LC', 'CC'];
  }
  if (lower === 'clans') {
    return DATA?.factionGroups?.Clans || [];
  }
  if (lower === 'innersphere' || lower === 'inner sphere' || lower === 'is') {
    // All non-Clan, non-Periphery factions
    if (DATA?.factions) {
      return Object.entries(DATA.factions)
        .filter(([, info]) => info && !info.clan && !info.periphery)
        .map(([code]) => code);
    }
    return ['DC', 'FS', 'FWL', 'LC', 'CC', 'FC', 'FRR', 'CS', 'WOB', 'SIC', 'MERC', 'ROS'];
  }
  if (lower === 'invasionclans' || lower === 'invasion clans') {
    return ['CW', 'CJF', 'CGB', 'CSJ'];
  }
  if (lower === 'isclans' || lower === 'is clans' || lower === 'innersphereclans' || lower === 'inner sphere clans') {
    // Clans with significant Inner Sphere presence
    return ['CW', 'CJF', 'CGB', 'CSJ', 'CHH', 'CNC', 'CDS', 'CSR', 'RD', 'RA'];
  }
  if (lower === 'homeclans' || lower === 'home clans' || lower === 'homeworldclans' || lower === 'homeworld clans') {
    // Clans that remained in the homeworlds
    return ['CBS', 'CCO', 'CFM', 'CGS', 'CIH', 'CSA', 'CSV'];
  }
  if (lower === 'periphery') {
    return DATA?.factionGroups?.Periphery || [];
  }
  
  const resolved = resolveFaction(name);
  return resolved ? [resolved] : [];
}

// Chassis name alias map — built once from parenthetical naming convention
// e.g. "Thor (Summoner)" → aliases: "thor" → "Thor (Summoner)", "summoner" → "Thor (Summoner)"
// Stored on DATA object to survive eval/with scoping in tests.
function getChassisAliases() {
  if (DATA._chassisAliases) return DATA._chassisAliases;
  DATA._chassisAliases = {};
  if (!DATA?.chassis) return DATA._chassisAliases;
  for (const name of Object.keys(DATA.chassis)) {
    const match = name.match(/^(.+?)\s*\((.+)\)$/);
    if (match) {
      const primary = match[1].trim().toLowerCase();
      const alt = match[2].trim().toLowerCase();
      if (!DATA._chassisAliases[primary]) DATA._chassisAliases[primary] = name;
      if (!DATA._chassisAliases[alt]) DATA._chassisAliases[alt] = name;
    }
  }
  return DATA._chassisAliases;
}

function resolveChassis(name) {
  if (!name || !DATA) return name;
  const lower = name.toLowerCase().trim();
  
  // Exact match on full chassis name
  if (DATA.chassis[name]) return name;
  
  // Case-insensitive exact match on full chassis name
  for (const ch of Object.keys(DATA.chassis)) {
    if (ch.toLowerCase() === lower) return ch;
  }
  
  // Clan IS/Clan name aliases (exact match) — before model prefixes
  // so "Hel" → Loki Mk II (Hel) instead of HEL prefix → Helios
  const aliases = getChassisAliases();
  if (aliases[lower]) return aliases[lower];
  
  // Check model prefix aliases (e.g. AWS → Awesome, DRG → Dragon)
  const upper = name.toUpperCase();
  if (DATA.modelPrefixes[upper]) return DATA.modelPrefixes[upper];
  
  // startsWith: check aliases first (shorter, more specific matches),
  // then chassis names. This ensures "hel" → Loki Mk II (Hel) via alias
  // before "hel" → Helios via chassis name startsWith.
  for (const [alias, target] of Object.entries(aliases)) {
    if (alias.startsWith(lower)) return target;
  }
  
  for (const ch of Object.keys(DATA.chassis)) {
    if (ch.toLowerCase().startsWith(lower)) return ch;
  }
  
  // Fallback: includes match
  for (const ch of Object.keys(DATA.chassis)) {
    if (ch.toLowerCase().includes(lower)) return ch;
  }
  
  return name;
}

// ── Scoring Functions (all client-side) ──

function computeSpread(weights, scopedFactions) {
  const vals = scopedFactions.map(f => weights[f] || 0);
  return Math.max(...vals) - Math.min(...vals);
}

function computeSpan(weights, scopedFactions) {
  return scopedFactions.filter(f => (weights[f] || 0) > 0).length;
}

function computeAvgWeight(weights, scopedFactions) {
  const vals = scopedFactions.map(f => weights[f] || 0).filter(v => v > 0);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Compute BV range from in-scope variants.
 * Considers only variants that:
 *   - Have weight > 0 for at least one scoped faction
 *   - Are MUL-confirmed (in Mode B) for a scoped faction
 *   - Have intro year <= target year (if year filtering active)
 *   - Have BV data
 * Returns { bvMin, bvMax, bvList } or null if no BV data.
 */
function computeBVRange(variants, scopedFactions, mul, modeB, targetYear) {
  if (!variants) return null;
  const bvValues = [];
  for (const [varName, varData] of Object.entries(variants)) {
    const vWeights = varData.w || varData;
    const bv = varData.bv;
    const intro = varData.intro;
    if (bv == null) continue;
    if (targetYear && intro && intro > targetYear) continue;
    // Check if any scoped faction has weight > 0 for this variant
    // Variant weights may be [base, mod], {levels}, or plain numbers — resolve them
    const factions = scopedFactions.length > 0 ? scopedFactions : Object.keys(vWeights);
    const hasFaction = factions.some(f => {
      const raw = vWeights[f];
      if (raw === undefined || raw === null) return false;
      return resolveWeight(raw, null) > 0;
    });
    if (!hasFaction) continue;
    bvValues.push(bv);
  }
  if (bvValues.length === 0) return null;
  return { bvMin: Math.min(...bvValues), bvMax: Math.max(...bvValues), bvList: bvValues };
}

/**
 * Compute signature score per faction: weight × max(0, z-score)
 * 
 * z-score = (weight - mean) / stddev across ALL factions in the era,
 * with non-fielding factions counted as 0. This captures both usage
 * intensity and exclusivity in a single statistically sound metric.
 * 
 * allFactionCodes: array of ALL faction codes in the era (for zero-padding)
 * Returns { factionCode: rawSigScore } for the requested factions.
 */
/**
 * Compute signature scores for a chassis across factions.
 * All computation stays in rating space (1-10 linear scale) to keep mid-weight
 * exclusive mechs visible. Probability space (2^(n/2)) was burying them under
 * high-weight common designs.
 * When wcdParams is provided (mixed-class view), ratings are scaled by each
 * faction's WCD mixing factor to reflect weight class preferences (e.g. Lyran
 * heavy bias boosts their heavies in sig rankings).
 *
 * @param {Object} weights - { factionCode: resolvedRating } (raw within-class ratings)
 * @param {Object} mulData - { factionCode: 1 } MUL confirmation flags
 * @param {string[]} factions - scoped factions to compute sig for
 * @param {string[]} allFactionCodes - all faction codes for z-score baseline
 * @param {Object|null} wcdParams - { chassisClass, eraYear } or null to skip WCD mixing
 */
function computeSignature(weights, mulData, factions, allFactionCodes, wcdParams, chassisTech, rawW, ratingIdx) {
  const result = {};
  
  // Filter comparison pool by tech base so IS workhorse mechs aren't
  // inflated by Clan factions' zeros (and vice versa).
  // Include any faction that: (a) matches the tech base, OR (b) actually fields the chassis.
  // This handles late-era tech sharing (e.g., IS factions fielding Clan mechs).
  let compareFactions = allFactionCodes;
  if (chassisTech === 'Inner Sphere' || chassisTech === 'Primitive') {
    compareFactions = allFactionCodes.filter(f =>
      !DATA.factions[f]?.clan || (weights[f] && weights[f] > 0));
  } else if (chassisTech === 'Clan') {
    compareFactions = allFactionCodes.filter(f =>
      DATA.factions[f]?.clan || (weights[f] && weights[f] > 0));
  }
  // Mixed/null tech: compare against all factions
  
  // Build effective weight array in probability space.
  // Signature uses 2^(rating/2) to reflect actual battlefield presence —
  // a rating-8 mech is 8× more likely than rating-2, not 4×.
  // This better captures "you'll see this mech and it'll be theirs."
  // In mixed-class view, scale by WCD mixing factor to reflect faction
  // weight class preferences (e.g. Lyran heavy bias boosts their heavies).
  const allWeights = compareFactions.map(f => {
    const rating = (mulData[f] && weights[f]) ? weights[f] : 0;
    if (rating <= 0) return 0;
    const rawEntry = rawW?.[f];
    const prob = rawEntry ? entryToProb(rawEntry, ratingIdx) : toProb(rating);
    if (wcdParams) {
      const mixFactor = getWcdMixingFactor(f, wcdParams.chassisClass, wcdParams.eraYear);
      return prob * mixFactor;
    }
    return prob;
  });
  
  const n = allWeights.length;
  if (n === 0) { for (const f of factions) result[f] = 0; return result; }
  
  const mean = allWeights.reduce((a, b) => a + b, 0) / n;
  const variance = allWeights.reduce((s, w) => s + (w - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  
  for (const f of factions) {
    const rating = (mulData[f] && weights[f]) ? weights[f] : 0;
    if (rating <= 0 || stddev === 0) { result[f] = 0; continue; }
    const rawEntry = rawW?.[f];
    const prob = rawEntry ? entryToProb(rawEntry, ratingIdx) : toProb(rating);
    let w;
    if (wcdParams) {
      const mixFactor = getWcdMixingFactor(f, wcdParams.chassisClass, wcdParams.eraYear);
      w = prob * mixFactor;
    } else {
      w = prob;
    }
    const z = (w - mean) / stddev;
    result[f] = w * Math.max(0, z);
  }
  return result;
}

/**
 * Jenks Natural Breaks classification.
 * Finds breakpoints in sorted data that minimize within-class variance.
 * Returns array of (numClasses - 1) breakpoint values.
 */
function jenksBreaks(sortedValues, numClasses) {
  const n = sortedValues.length;
  if (n <= numClasses) {
    // Fewer values than classes — each value is its own class
    return sortedValues.slice(0, n - 1);
  }

  // GVF (Goodness of Variance Fit) based Jenks implementation
  // Build matrices for sum of squared deviations
  const lower = Array.from({ length: n + 1 }, () => new Float64Array(numClasses + 1));
  const variance = Array.from({ length: n + 1 }, () => new Float64Array(numClasses + 1).fill(Infinity));

  for (let i = 1; i <= numClasses; i++) {
    lower[1][i] = 1;
    variance[1][i] = 0;
  }

  for (let l = 2; l <= n; l++) {
    let sum = 0, sumSq = 0;
    for (let m = 1; m <= l; m++) {
      const idx = l - m; // 0-based index into sortedValues
      const val = sortedValues[idx];
      sum += val;
      sumSq += val * val;
      const w = m; // count of values in this range
      const iv = sumSq - (sum * sum) / w;

      if (idx > 0) {
        for (let j = 2; j <= numClasses; j++) {
          const test = variance[idx][j - 1] + iv;
          if (test < variance[l][j]) {
            lower[l][j] = idx + 1;
            variance[l][j] = test;
          }
        }
      }
    }
    lower[l][1] = 1;
    variance[l][1] = sumSq - (sum * sum) / l;
  }

  // Extract break indices
  const breaks = [];
  let k = n;
  for (let j = numClasses; j >= 2; j--) {
    const breakIdx = lower[k][j] - 1; // 0-based
    breaks.unshift(sortedValues[breakIdx]);
    k = lower[k][j] - 1;
  }
  return breaks;
}

function assignTierFromBreaks(value, breaks) {
  if (breaks.length === 0) return 1;
  // breaks sorted ascending: [b0, b1, b2, b3] for 5 classes
  // value >= b3 → tier 1 (highest)
  // value >= b2 → tier 2
  // value >= b1 → tier 3
  // value >= b0 → tier 4
  // else → tier 5
  for (let i = breaks.length - 1; i >= 0; i--) {
    if (value >= breaks[i]) return breaks.length - i;
  }
  return breaks.length + 1;
}

function compareOp(value, op, threshold) {
  switch (op) {
    case '>': return value > threshold;
    case '<': return value < threshold;
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '=': return value === threshold;
    case '!=': return value !== threshold;
    default: return true;
  }
}

// ── Get era year from target year ──

function getEraYear(targetYear) {
  if (!DATA) return null;
  const eraYears = DATA.eras.map(e => e.year).sort((a, b) => a - b);
  let best = eraYears[0];
  for (const ey of eraYears) {
    if (ey <= targetYear) best = ey;
    else break;
  }
  return best;
}

// ── Get chassis data for an era (with family merging) ──

function getChassisForEra(eraYear, familyMode) {
  if (!DATA || !DATA.eraData[eraYear]) return {};
  const eraData = DATA.eraData[eraYear];
  
  if (familyMode === 'off') return eraData;
  
  // Merge families (only enabled ones)
  const merged = {};
  const familyMembers = {}; // groupName -> [chassisNames]
  const disabledFamilies = new Set(); // families explicitly disabled by user
  
  const chassisToFamily = {}; // chassisName -> groupName (reverse lookup)

  for (const fam of DATA.families) {
    if (!fam.enabled) {
      disabledFamilies.add(fam.groupName);
      continue; // skip disabled families
    }
    for (const ch of fam.chassis) {
      if (!familyMembers[fam.groupName]) familyMembers[fam.groupName] = [];
      familyMembers[fam.groupName].push(ch);
      chassisToFamily[ch] = fam.groupName;
    }
  }
  
  // Also collect ad-hoc families from eraData fam fields not already in familyMembers
  // (e.g. IIC families defined only in the raw data, not in DATA.families)
  for (const [chassisName, data] of Object.entries(eraData)) {
    const famName = data.fam;
    if (famName && !disabledFamilies.has(famName)) {
      if (!familyMembers[famName]) familyMembers[famName] = [];
      // Add if not already listed (explicit DATA.families entries may overlap)
      if (!familyMembers[famName].includes(chassisName)) {
        familyMembers[famName].push(chassisName);
      }
    }
  }
  
  const processedFamilies = new Set();
  
  for (const [chassisName, data] of Object.entries(eraData)) {
    const famName = data.fam || chassisToFamily[chassisName] || null;
    
    if (famName && !disabledFamilies.has(famName) && !processedFamilies.has(famName)) {
      processedFamilies.add(famName);
      const members = familyMembers[famName] || [chassisName];
      
      // Merge weights from all family members
      const mergedWeights = {};
      const mergedVariants = {};
      let hasMul = {};
      
      for (const member of members) {
        const memberData = eraData[member];
        if (!memberData) continue;
        
        for (const [f, w] of Object.entries(memberData.w || {})) {
          mergedWeights[f] = (mergedWeights[f] || 0) + w;
        }
        if (memberData.v) {
          Object.assign(mergedVariants, memberData.v);
        }
        if (memberData.mul) {
          for (const [f, v] of Object.entries(memberData.mul)) {
            hasMul[f] = 1;
          }
        }
      }
      
      // Collect metadata from family members
      const tonValues = [];
      const classValues = new Set();
      let introMin = null;
      let isIndustrial = false;
      const techValues = new Set();
      for (const member of members) {
        const m = DATA.chassis[member];
        if (!m) continue;
        if (m.tons != null) tonValues.push(m.tons);
        if (m.class) classValues.add(m.class);
        if (m.intro != null) introMin = introMin == null ? m.intro : Math.min(introMin, m.intro);
        if (m.industrial) isIndustrial = true;
        if (m.tech) techValues.add(m.tech);
      }
      const tonsMin = tonValues.length ? Math.min(...tonValues) : null;
      const tonsMax = tonValues.length ? Math.max(...tonValues) : null;

      // Use family group name as display name
      const displayName = famName.replace(/ Family$/, '');
      merged[displayName] = {
        w: mergedWeights,
        v: Object.keys(mergedVariants).length > 0 ? mergedVariants : undefined,
        mul: Object.keys(hasMul).length > 0 ? hasMul : undefined,
        fam: famName,
        _members: members,
        _meta: {
          tons: tonsMin,
          tonsMax: tonsMax,
          class: classValues.size === 1 ? [...classValues][0] : [...classValues].join('/'),
          intro: introMin,
          industrial: isIndustrial,
          tech: techValues.size === 1 ? [...techValues][0] : [...techValues].join('/')
        }
      };
    } else if (!famName || disabledFamilies.has(famName)) {
      // No family, or family is disabled — show individually
      merged[chassisName] = data;
    }
    // Skip if already processed as part of an enabled family
  }
  
  return merged;
}


// Helper to get unique factions from rows (for mech view)
function getAllFactionsFromRows(rows) {
  const factions = new Set();
  for (const row of rows) {
    for (const [f, w] of Object.entries(row.weights)) {
      if (w > 0) factions.add(f);
    }
  }
  return [...factions];
}

// ── View Routing ──

function determineView(parsed) {
  const hasFaction = parsed.factions.length > 0;
  const hasChassis = parsed.chassis.length > 0;
  
  if (hasChassis && !hasFaction) return 'mech';
  if (hasFaction && !hasChassis && parsed.factions.length === 1) return 'single-faction';
  if (hasFaction && !hasChassis) return 'faction-comparison';
  if (hasFaction && hasChassis) return 'mech-detail';
  return 'landing';
}

// ── Rendering ──

function getFactionLabel(code) {
  if (!DATA || !DATA.factions[code]) return code;
  return code; // Use short code in table headers
}

function getFactionFullName(code) {
  if (!DATA || !DATA.factions[code]) return code;
  return DATA.factions[code].name;
}

function heatClass(pref) {
  if (!pref || pref <= 0) return 'no-data';
  return 'heat-' + Math.round(Math.min(10, Math.max(1, pref)));
}

function bwHeatClass(bw) {
  if (!bw || bw <= 0) return 'no-data';
  // Log-scale heat: map log2(bw) from [-3.5, 3.5] to heat 1–10
  const l = Math.log2(bw);
  const heat = Math.round(1 + 9 * (l + 3.5) / 7);
  return 'heat-' + Math.max(1, Math.min(10, heat));
}

function sigTierToHeat(tier) {
  // T1 (most iconic) = hottest, T5 = coolest
  const map = { 1: 'heat-10', 2: 'heat-8', 3: 'heat-6', 4: 'heat-3', 5: 'heat-1' };
  return map[tier] || 'no-data';
}

function renderFactionComparison(rows, scopedFactions, eraYear, query) {
  const container = document.getElementById('view-container');
  container.innerHTML = '';
  container.classList.remove('hidden');
  
  const eraLabel = DATA.eras.find(e => e.year === eraYear)?.label || `Era ${eraYear}`;
  const factionNames = scopedFactions.map(f => getFactionLabel(f)).join(' vs ');
  
  const title = document.createElement('div');
  title.className = 'view-title';
  title.textContent = `${factionNames} — ${eraLabel} (${rows.length} chassis)`;
  container.appendChild(title);

  if (rows.length === 0) {
    container.innerHTML += '<p style="color:var(--text-dim)">No results match your query.</p>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'data-table-wrapper';
  
  const table = document.createElement('table');
  table.className = 'data-table';
  
  // Header
  const thead = document.createElement('thead');
  const hasSig = rows.some(r => r.sig);
  const hasBV = rows.some(r => r.bvRange);
  let headerHTML = '<tr><th data-sort="name">Chassis</th><th data-sort="tonnage">Tons</th>';
  if (hasBV) headerHTML += '<th data-sort="bv">BV</th>';
  if (hasSig) {
    for (const f of scopedFactions) {
      headerHTML += `<th data-sort="${f}-sig" title="${getFactionFullName(f)} Distinctiveness">${getFactionLabel(f)} DR</th>`;
    }
  }
  for (const f of scopedFactions) {
    headerHTML += `<th data-sort="${f}-weight" title="${getFactionFullName(f)}">${getFactionLabel(f)}</th>`;
  }
  for (const f of scopedFactions) {
    headerHTML += `<th data-sort="${f}-bw" title="${getFactionFullName(f)} Probability Weight">${getFactionLabel(f)} Prob</th>`;
  }
  headerHTML += '<th data-sort="spread">Spread</th></tr>';
  thead.innerHTML = headerHTML;
  table.appendChild(thead);
  
  // Body — paginated
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
  
  function renderPage(page) {
    const pageSize = getPageSize();
    const { pageRows, totalPages, page: safePage } = paginateRows(rows, page, pageSize);
    currentPage = safePage;
    
    tbody.innerHTML = '';
    for (const row of pageRows) {
      const tr = document.createElement('tr');
      let html = `<td class="chassis-name">${escHtml(row.name)}</td>`;
      html += `<td class="tonnage-col">${formatTonnage(row.meta)} <span class="class-badge class-${(row.meta.class || '').split('/')[0]}">${formatClass(row.meta)}</span></td>`;
      if (hasBV) {
        if (row.bvRange) {
          const bvStr = row.bvRange.bvMin === row.bvRange.bvMax
            ? String(row.bvRange.bvMin)
            : `${row.bvRange.bvMin}–${row.bvRange.bvMax}`;
          html += `<td class="stat-col bv-col">${bvStr}</td>`;
        } else {
          html += '<td class="stat-col bv-col">—</td>';
        }
      }
      
      if (hasSig) {
        for (const f of scopedFactions) {
          const sigVal = row.sig?.[f] || 0;
          const sigTier = row.sig?.[f + '_tier'] || 0;
          const hasWeight = (row.weights[f] || 0) > 0;
          if (sigVal > 0) {
            const sigHeat = sigTierToHeat(sigTier);
            html += `<td class="faction-cell ${sigHeat}" data-chassis="${escAttr(row.name)}" data-faction="${f}">`;
            html += `<span class="pref-value">DR${sigTier}</span>`;
            html += `<span class="sig-raw">${sigVal.toFixed(1)}</span>`;
            html += `<span class="weight-value">w:${(row.weights[f] || 0).toFixed(1)}</span>`;
            html += '</td>';
          } else if (hasWeight) {
            // Faction fields the chassis but sig is 0 (below-average usage after WCD)
            html += `<td class="faction-cell heat-1" data-chassis="${escAttr(row.name)}" data-faction="${f}">`;
            html += `<span class="pref-value">DR5</span>`;
            html += '</td>';
          } else {
            html += `<td class="faction-cell no-data" data-chassis="${escAttr(row.name)}" data-faction="${f}">—</td>`;
          }
        }
      }

      for (const f of scopedFactions) {
        const w = row.weights[f] || 0;
        const cls = w > 0 ? heatClass(w) : 'no-data';
        
        if (w > 0) {
          html += `<td class="faction-cell ${cls}" data-chassis="${escAttr(row.name)}" data-faction="${f}">`;
          html += `<span class="pref-value">${w.toFixed(1)}</span>`;
          if (hasSig && row.sig?.[f] > 0) {
            const tier = row.sig?.[f + '_tier'] || 0;
            html += `<span class="sig-value">DR${tier}</span>`;
          }
          html += '</td>';
        } else {
          html += `<td class="faction-cell no-data" data-chassis="${escAttr(row.name)}" data-faction="${f}">—</td>`;
        }
      }
      for (const f of scopedFactions) {
        const bw = row.biasedWeights?.[f] || 0;
        if (bw > 0) {
          const bwCls = bwHeatClass(bw);
          html += `<td class="faction-cell ${bwCls}" data-chassis="${escAttr(row.name)}" data-faction="${f}">`;
          html += `<span class="pref-value">${bw.toFixed(2)}</span>`;
          html += '</td>';
        } else {
          html += `<td class="faction-cell no-data" data-chassis="${escAttr(row.name)}" data-faction="${f}">—</td>`;
        }
      }
      html += `<td class="stat-col">${row.spread.toFixed(1)}</td>`;
      
      tr.innerHTML = html;
      tbody.appendChild(tr);
    }
    
    renderPagination(container, rows.length, safePage, totalPages, renderPage);
    applyColVisibility();
  }
  
  renderPage(currentPage);
  
  // Click handler for faction cells
  table.addEventListener('click', handleCellClick);
  
  // Sortable headers
  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th || !th.dataset.sort) return;
    handleHeaderSort(th, rows, scopedFactions, eraYear, query);
  });

  updateColVisibility();
}

function renderSingleFaction(rows, faction, eraYear) {
  const container = document.getElementById('view-container');
  container.innerHTML = '';
  container.classList.remove('hidden');
  
  const eraLabel = DATA.eras.find(e => e.year === eraYear)?.label || `Era ${eraYear}`;
  const factionName = getFactionFullName(faction);
  
  const title = document.createElement('div');
  title.className = 'view-title';
  title.textContent = `${factionName} Roster — ${eraLabel} (${rows.length} chassis)`;
  container.appendChild(title);

  if (rows.length === 0) {
    container.innerHTML += '<p style="color:var(--text-dim)">No results match your query.</p>';
    return;
  }

  const maxWeight = Math.max(...rows.map(r => r.weights[faction] || 0));

  const wrapper = document.createElement('div');
  wrapper.className = 'data-table-wrapper';
  
  const table = document.createElement('table');
  table.className = 'data-table';
  
  const thead = document.createElement('thead');
  const singleHasBV = rows.some(r => r.bvRange);
  const singleHasSig = rows.some(r => r.sig?.[faction] > 0);
  thead.innerHTML = `<tr><th>Chassis</th><th>Tons</th><th>Class</th>${singleHasBV ? '<th>BV</th>' : ''}${singleHasSig ? '<th>DR</th>' : ''}<th>Prob</th><th>Availability</th></tr>`;
  table.appendChild(thead);
  
  // Filter to rows with weight > 0
  const activeRows = rows.filter(r => (r.weights[faction] || 0) > 0);

  // Default sort: DR desc (most iconic first) if sig data exists
  if (singleHasSig) {
    activeRows.sort((a, b) => {
      const sa = a.sig?.[faction] || 0;
      const sb = b.sig?.[faction] || 0;
      return sb - sa;
    });
  }

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
  
  function renderPage(page) {
    const pageSize = getPageSize();
    const { pageRows, totalPages, page: safePage } = paginateRows(activeRows, page, pageSize);
    currentPage = safePage;
    
    tbody.innerHTML = '';
    for (const row of pageRows) {
      const w = row.weights[faction] || 0;
      const pct = maxWeight > 0 ? (w / maxWeight * 100) : 0;
      
      let bvCell = '';
      if (singleHasBV) {
        if (row.bvRange) {
          const bvStr = row.bvRange.bvMin === row.bvRange.bvMax
            ? String(row.bvRange.bvMin)
            : `${row.bvRange.bvMin}–${row.bvRange.bvMax}`;
          bvCell = `<td class="stat-col bv-col">${bvStr}</td>`;
        } else {
          bvCell = '<td class="stat-col bv-col">—</td>';
        }
      }

      // DR cell
      let drCell = '';
      if (singleHasSig) {
        const sigVal = row.sig?.[faction] || 0;
        const sigTier = row.sig?.[faction + '_tier'] || 0;
        if (sigVal > 0) {
          const sigHeat = sigTierToHeat(sigTier);
          drCell = `<td class="faction-cell ${sigHeat}" data-chassis="${escAttr(row.name)}" data-faction="${faction}"><span class="pref-value">DR${sigTier}</span><span class="sig-raw">${sigVal.toFixed(1)}</span></td>`;
        } else {
          drCell = `<td class="faction-cell heat-1" data-chassis="${escAttr(row.name)}" data-faction="${faction}"><span class="pref-value">DR5</span></td>`;
        }
      }

      // Prob cell
      const bw = row.biasedWeights?.[faction] || 0;
      let probCell;
      if (bw > 0) {
        const bwCls = bwHeatClass(bw);
        probCell = `<td class="faction-cell ${bwCls}" data-chassis="${escAttr(row.name)}" data-faction="${faction}"><span class="pref-value">${bw.toFixed(2)}</span></td>`;
      } else {
        probCell = `<td class="faction-cell no-data">—</td>`;
      }
      
      const tr = document.createElement('tr');
      tr.className = 'faction-roster-row';
      tr.innerHTML = `
        <td class="chassis-name" style="cursor:pointer" data-chassis="${escAttr(row.name)}" data-faction="${faction}">${escHtml(row.name)}</td>
        <td class="tonnage-col">${formatTonnage(row.meta)}</td>
        <td><span class="class-badge class-${(row.meta.class || '').split('/')[0]}">${formatClass(row.meta)}</span></td>
        ${bvCell}
        ${drCell}
        ${probCell}
        <td><div class="weight-bar-container"><div class="weight-bar" style="width:${pct}%"></div><span class="weight-bar-label">${w.toFixed(1)}</span></div></td>
      `;
      tbody.appendChild(tr);
    }
    
    renderPagination(container, activeRows.length, safePage, totalPages, renderPage);
  }
  
  renderPage(currentPage);
  
  table.addEventListener('click', handleCellClick);

  updateColVisibility();
}

function renderMechView(rows, eraYear, chassisName) {
  const container = document.getElementById('view-container');
  container.innerHTML = '';
  container.classList.remove('hidden');
  
  if (rows.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim)">No chassis found matching your query.</p>';
    return;
  }

  for (const row of rows) {
    const meta = row.meta;
    
    const section = document.createElement('div');
    section.style.marginBottom = '2rem';
    
    section.innerHTML = `
      <div class="mech-view-title">${escHtml(row.name)}</div>
      <div class="mech-view-meta">${formatTonnage(meta)} ${formatClass(meta)} — Intro: ${meta.intro || 'Unknown'} — ${meta.tech || ''}</div>
    `;
    
    // Get all factions sorted by sig (most distinctive first), fallback to weight
    const hasSig = row.sig && Object.values(row.sig).some(v => typeof v === 'number' && v > 0);
    const factionWeights = Object.entries(row.weights)
      .filter(([f, w]) => w > 0)
      .sort((a, b) => {
        if (hasSig) return (row.sig?.[b[0]] || 0) - (row.sig?.[a[0]] || 0);
        return b[1] - a[1];
      });
    
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = `<thead><tr><th>Faction</th>${hasSig ? '<th>DR</th>' : ''}<th>Prob</th><th>Weight</th></tr></thead>`;
    
    const tbody = document.createElement('tbody');
    for (const [f, w] of factionWeights) {
      const fName = getFactionFullName(f);
      
      // DR cell
      let drCell = '';
      if (hasSig) {
        const sigVal = row.sig?.[f] || 0;
        const sigTier = row.sig?.[f + '_tier'] || 0;
        if (sigVal > 0) {
          const sigHeat = sigTierToHeat(sigTier);
          drCell = `<td class="faction-cell ${sigHeat}" data-chassis="${escAttr(row.name)}" data-faction="${f}"><span class="pref-value">DR${sigTier}</span><span class="sig-raw">${sigVal.toFixed(1)}</span></td>`;
        } else {
          drCell = `<td class="faction-cell heat-1" data-chassis="${escAttr(row.name)}" data-faction="${f}"><span class="pref-value">DR5</span></td>`;
        }
      }

      // Prob cell
      const bw = row.biasedWeights?.[f] || 0;
      let probCell;
      if (bw > 0) {
        const bwCls = bwHeatClass(bw);
        probCell = `<td class="faction-cell ${bwCls}" data-chassis="${escAttr(row.name)}" data-faction="${f}"><span class="pref-value">${bw.toFixed(2)}</span></td>`;
      } else {
        probCell = `<td class="faction-cell no-data">—</td>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="cursor:pointer" data-chassis="${escAttr(row.name)}" data-faction="${f}"><strong>${escHtml(f)}</strong> <span style="color:var(--text-dim)">${escHtml(fName)}</span></td>
        ${drCell}
        ${probCell}
        <td class="stat-col">${w.toFixed(1)}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    container.appendChild(section);
    
    table.addEventListener('click', handleCellClick);
  }

  updateColVisibility();
}

// ── Variant Drill-down ──

function showVariants(chassisName, faction, eraYear) {
  const overlay = document.getElementById('variant-overlay');
  const title = document.getElementById('variant-title');
  const content = document.getElementById('variant-content');
  
  // Find the chassis data
  const eraData = DATA.eraData[String(eraYear)];
  if (!eraData) return;
  
  // Respect global family mode from current query
  const bar = document.getElementById('query-bar');
  const currentQuery = parseQuery(bar?.value || '');
  const familiesGloballyOff = currentQuery.family === 'off';
  
  // Check if this is a family display name — if so, collect variants from ALL members
  let variants = null;
  let isFamily = false;
  
  for (const fam of DATA.families) {
    if (!familiesGloballyOff && fam.enabled &&
        (fam.groupName.replace(/ Family$/, '') === chassisName ||
        fam.groupName === chassisName)) {
      isFamily = true;
      for (const member of fam.chassis) {
        if (eraData[member]?.v) {
          variants = { ...(variants || {}), ...eraData[member].v };
        }
      }
      break;
    }
  }
  
  // If not a family, check direct chassis name
  if (!isFamily) {
    if (eraData[chassisName]?.v) {
      variants = eraData[chassisName].v;
    } else {
      // Check if it's a member of a family (fam field match)
      for (const [cn, data] of Object.entries(eraData)) {
        if (data.fam && data.fam.replace(/ Family$/, '') === chassisName) {
          if (data.v) {
            variants = { ...(variants || {}), ...data.v };
          }
        }
      }
    }
  }
  
  // Calculate variant percentages for this faction
  // Variants can be either new format { w: {...}, bv, intro } or legacy { faction: weight }
  const variantWeights = {};
  const variantBV = {};
  const variantIntro = {};
  // Use exact year if specified, otherwise fall back to the era bucket year
  // (eraYear param comes from currentEraYear, resolved from year= or era= in runQuery)
  const targetYear = currentQuery.year || eraYear;
  let total = 0;
  for (const [varName, varData] of Object.entries(variants || {})) {
    // Handle both new { w: {...}, bv, intro } and legacy { faction: weight } format
    // Variant weights may be [base, mod], {levels}, or plain numbers — resolve them
    const factionWeights = varData.w || varData;
    const rawW = factionWeights[faction];
    const w = rawW !== undefined && rawW !== null ? resolveWeight(rawW, null) : 0;
    if (w > 0) {
      // Filter out variants introduced after the target year
      if (targetYear && varData.intro && varData.intro > targetYear) continue;
      variantWeights[varName] = w;
      total += w;
      if (varData.bv != null) variantBV[varName] = varData.bv;
      if (varData.intro != null) variantIntro[varName] = varData.intro;
    }
  }
  
  // Sort by weight desc
  const sorted = Object.entries(variantWeights).sort((a, b) => b[1] - a[1]);
  
  title.textContent = `${chassisName} — ${getFactionFullName(faction)}`;
  
  let html = '';

  // ── Rating Tiers Section ──
  // Find the raw weight entry for this faction (before resolving)
  // For families, collect entries from all members; show combined if mixed
  const rawEntries = [];
  const chassisNames = [];
  if (isFamily) {
    for (const fam of DATA.families) {
      if (fam.groupName.replace(/ Family$/, '') === chassisName || fam.groupName === chassisName) {
        for (const member of fam.chassis) {
          const memberData = eraData[member];
          if (memberData?.w?.[faction] !== undefined) {
            rawEntries.push({ name: member, entry: memberData.w[faction] });
            chassisNames.push(member);
          }
        }
        break;
      }
    }
  } else {
    const chData = eraData[chassisName];
    if (chData?.w?.[faction] !== undefined) {
      rawEntries.push({ name: chassisName, entry: chData.w[faction] });
      chassisNames.push(chassisName);
    }
  }

  const isClan = DATA.factions[faction]?.clan;
  const tierLabels = isClan
    ? ['PGC', 'Solahma', 'Second Line', 'Front Line', 'Keshik']
    : ['F (Garrison)', 'D', 'C', 'B', 'A (Elite)'];

  if (rawEntries.length === 0 && sorted.length === 0) {
    // Faction has no weight entry for this chassis at all
    html += `<div class="drilldown-section"><p class="drilldown-empty">${escHtml(getFactionFullName(faction))} does not field the ${escHtml(chassisName)} in this era.</p></div>`;
  }

  if (rawEntries.length > 0) {
    html += '<div class="drilldown-section"><h4 class="drilldown-section-title">Rating Tiers</h4>';

    for (const { name: entryName, entry } of rawEntries) {
      const showLabel = rawEntries.length > 1 ? `<span class="rating-chassis-label">${escHtml(entryName)}</span>` : '';

      if (Array.isArray(entry) && (entry[1] === 0 || entry[1] === '0' || !entry[1])) {
        // Flat — single line
        html += `<div class="rating-tier-row">${showLabel}
          <span class="rating-tier-label">All tiers</span>
          <div class="rating-tier-bar-container"><div class="rating-tier-bar" style="width:${entry[0] * 10}%"></div></div>
          <span class="rating-tier-value">${entry[0]}</span>
          <span class="rating-tier-mod">(flat)</span>
        </div>`;
      } else if (Array.isArray(entry)) {
        // + or - modifier — show all tiers top to bottom (A/Keshik first)
        const modLabel = entry[1] === '+' ? `${entry[0]}+` : `${entry[0]}−`;
        if (showLabel) html += `<div class="rating-chassis-header">${showLabel} <span class="rating-tier-mod">${modLabel}</span></div>`;
        else html += `<div class="rating-chassis-header"><span class="rating-tier-mod">${modLabel}</span></div>`;
        for (let i = NUM_LEVELS - 1; i >= 0; i--) {
          const val = resolveWeight(entry, i);
          html += `<div class="rating-tier-row">
            <span class="rating-tier-label">${tierLabels[i]}</span>
            <div class="rating-tier-bar-container"><div class="rating-tier-bar" style="width:${val * 10}%"></div></div>
            <span class="rating-tier-value">${val}</span>
          </div>`;
        }
        const avg = resolveWeight(entry, null);
        html += `<div class="rating-tier-row rating-tier-avg">
          <span class="rating-tier-label">Avg (default)</span>
          <div class="rating-tier-bar-container"></div>
          <span class="rating-tier-value">${avg.toFixed(1)}</span>
        </div>`;
      } else if (typeof entry === 'object' && entry !== null) {
        // Explicit per-level (Clan format)
        if (showLabel) html += `<div class="rating-chassis-header">${showLabel}</div>`;
        // Show levels from highest to lowest tier
        const levelEntries = Object.entries(entry);
        // Sort by tier index desc
        levelEntries.sort((a, b) => {
          const idxA = CLAN_LEVEL_INDEX[a[0]] ?? RATING_INDEX[a[0]] ?? -1;
          const idxB = CLAN_LEVEL_INDEX[b[0]] ?? RATING_INDEX[b[0]] ?? -1;
          return idxB - idxA;
        });
        for (const [levelName, val] of levelEntries) {
          html += `<div class="rating-tier-row">
            <span class="rating-tier-label">${escHtml(levelName)}</span>
            <div class="rating-tier-bar-container"><div class="rating-tier-bar" style="width:${val * 10}%"></div></div>
            <span class="rating-tier-value">${val}</span>
          </div>`;
        }
        const avg = resolveWeight(entry, null);
        html += `<div class="rating-tier-row rating-tier-avg">
          <span class="rating-tier-label">Avg (default)</span>
          <div class="rating-tier-bar-container"></div>
          <span class="rating-tier-value">${avg.toFixed(1)}</span>
        </div>`;
      } else if (typeof entry === 'number') {
        // Legacy plain number — flat
        html += `<div class="rating-tier-row">${showLabel}
          <span class="rating-tier-label">All tiers</span>
          <div class="rating-tier-bar-container"><div class="rating-tier-bar" style="width:${entry * 10}%"></div></div>
          <span class="rating-tier-value">${entry}</span>
          <span class="rating-tier-mod">(flat)</span>
        </div>`;
      }
    }
    html += '</div>';
  }

  // ── Weight Class Distribution Section ──
  const factionData = DATA.factions[faction];
  const wcdRaw = factionData?.wcd?.[String(eraYear)] || factionData?.wcd;
  // wcd can be keyed by era year or be a flat array (find closest era)
  let wcd = null;
  if (Array.isArray(wcdRaw)) {
    wcd = wcdRaw;
  } else if (wcdRaw && typeof wcdRaw === 'object') {
    // Find the closest era year <= current
    const years = Object.keys(wcdRaw).map(Number).sort((a, b) => a - b);
    for (const y of years) {
      if (y <= eraYear) wcd = wcdRaw[y];
    }
    if (!wcd && years.length > 0) wcd = wcdRaw[years[0]];
  }

  if (wcd && wcd.length === 4) {
    const wcdTotal = wcd.reduce((a, b) => a + b, 0);
    const classLabels = ['Light', 'Medium', 'Heavy', 'Assault'];
    // Determine which class this chassis belongs to
    let chassisClass = null;
    // Check all chassis names involved (family or single)
    for (const cn of chassisNames) {
      const meta = DATA.chassis[cn];
      if (meta?.class) { chassisClass = meta.class; break; }
    }

    html += `<div class="drilldown-section"><h4 class="drilldown-section-title">${escHtml(getFactionFullName(faction))} Force Composition</h4>`;
    for (let i = 0; i < 4; i++) {
      const pct = wcdTotal > 0 ? (wcd[i] / wcdTotal * 100) : 0;
      const isActive = chassisClass === classLabels[i];
      html += `<div class="wcd-row${isActive ? ' wcd-active' : ''}">
        <span class="wcd-label">${classLabels[i]}${isActive ? ' ◂' : ''}</span>
        <div class="wcd-bar-container"><div class="wcd-bar" style="width:${pct}%"></div></div>
        <span class="wcd-pct">${pct.toFixed(0)}%</span>
      </div>`;
    }
    html += '</div>';
  }

  // ── Variant Breakdown Section ──
  if (sorted.length > 0) {
    html += '<div class="drilldown-section"><h4 class="drilldown-section-title">Variants</h4>';
    for (const [varName, w] of sorted) {
      const pct = (w / total * 100).toFixed(1);
      const bvStr = variantBV[varName] != null ? `<span class="variant-bv">BV ${variantBV[varName]}</span>` : '';
      const introStr = variantIntro[varName] != null ? `<span class="variant-intro">${variantIntro[varName]}</span>` : '';
      const metaStr = (bvStr || introStr) ? `<span class="variant-meta">${bvStr}${introStr}</span>` : '';
      html += `
        <div class="variant-row">
          <span class="variant-name">${escHtml(varName)}</span>
          ${metaStr}
          <div class="variant-bar-container">
            <div class="variant-bar" style="width:${pct}%"></div>
          </div>
          <span class="variant-pct">${pct}%</span>
        </div>
      `;
    }
    html += '</div>';
  }
  
  content.innerHTML = html;
  overlay.classList.remove('hidden');
}

function handleCellClick(e) {
  const cell = e.target.closest('[data-chassis][data-faction]');
  if (!cell) return;
  const chassis = cell.dataset.chassis;
  const faction = cell.dataset.faction;
  const eraYear = currentEraYear;
  showVariants(chassis, faction, eraYear);
}

function handleHeaderSort(th, rows, scopedFactions, eraYear, query) {
  // Toggle sort direction
  const field = th.dataset.sort;
  const wasDesc = th.classList.contains('sorted-desc');
  
  // Clear all sort indicators
  th.closest('thead').querySelectorAll('th').forEach(h => {
    h.classList.remove('sorted-asc', 'sorted-desc');
  });
  
  const dir = wasDesc ? 'asc' : 'desc';
  th.classList.add(dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
  
  // Update query sort
  const newQuery = { ...query, sort: [{ field, dir }] };
  
  // Re-sort and re-render
  const sorted = [...rows];
  sortRowsInPlace(sorted, [{ field, dir }]);
  renderFactionComparison(sorted, scopedFactions, eraYear, newQuery);
}

// ── Auto-Suggest ──

const FIELD_NAMES = ['faction', 'chassis', 'class', 'type', 'tech', 'spread', 'sig', 'signature', 'dr', 'distinctiveness', 'weight', 'tons', 'tonnage', 'bv', 'year', 'era', 'rating', 'family', 'industrial', 'mode', 'sort'];

function getSuggestions(text, cursorPos) {
  if (!DATA) return [];
  
  const beforeCursor = text.slice(0, cursorPos);
  const suggestions = [];
  
  // Check what we're completing
  const lastToken = beforeCursor.split(/\s+/).pop() || '';
  
  // Check for "field value" pattern (space-separated, no operator)
  // e.g. "chassis atl" → suggest chassis values matching "atl"
  const spaceMatch = beforeCursor.match(/^(\w[\w-]*)\s+(.+)$/);
  if (spaceMatch) {
    const field = spaceMatch[1].toLowerCase();
    const partial = spaceMatch[2].trim().toLowerCase();
    const VALUE_FIELD_SET = new Set(['faction', 'chassis', 'class', 'type', 'tech', 'year', 'era', 'rating', 'family', 'industrial', 'mode']);
    if (VALUE_FIELD_SET.has(field) && partial) {
      // Fake an eq match and fall through to value completion
      return getValueSuggestions(field, partial);
    }
  }

  // Sort context: "sort by <partial>" → suggest sortable fields without operators
  const sortByMatch = beforeCursor.match(/\bsort\s+by\s+(\S*)$/i);
  if (sortByMatch) {
    const partial = sortByMatch[1].toLowerCase();
    const sortableFields = ['spread', 'sig', 'dr', 'weight', 'tons', 'bv', 'name'];
    // Add faction-prefixed sort fields
    if (DATA) {
      for (const code of Object.keys(DATA.factions)) {
        sortableFields.push(code + '-sig');
        sortableFields.push(code + '-weight');
        sortableFields.push(code + '-bw');
      }
    }
    return sortableFields
      .filter(f => f.toLowerCase().startsWith(partial) && f.toLowerCase() !== partial)
      .slice(0, 10)
      .map(f => ({ text: f + ' desc', hint: 'sort' }));
  }

  // Field name completion
  const VALUE_FIELD_SET = new Set(['faction', 'chassis', 'class', 'type', 'tech', 'year', 'era', 'rating', 'family', 'industrial', 'mode']);
  const OPERATOR_FIELD_SET = new Set(['spread', 'sig', 'signature', 'dr', 'distinctiveness', 'weight', 'tons', 'tonnage', 'bv', 'battlevalue']);

  if (!lastToken.includes('=') && !lastToken.includes('>') && !lastToken.includes('<')) {
    const lower = lastToken.toLowerCase();
    for (const field of FIELD_NAMES) {
      if (field.startsWith(lower) && field !== lower) {
        // Choose appropriate operator suffix
        if (VALUE_FIELD_SET.has(field)) {
          suggestions.push({ text: field + '=', hint: 'field' });
        } else if (OPERATOR_FIELD_SET.has(field)) {
          suggestions.push({ text: field + '>', hint: 'filter' });
        } else {
          suggestions.push({ text: field + '=', hint: 'field' });
        }
      }
    }
    // Faction-prefixed fields: dc-sig, fs-weight, etc.
    const fpMatch = lower.match(/^([a-z]+)-(s|si|sig|w|we|wei|weig|weigh|weight)?$/);
    if (fpMatch && DATA) {
      const fCode = resolveFaction(fpMatch[1]);
      if (fCode && DATA.factions[fCode]) {
        const partial2 = fpMatch[2] || '';
        if ('dr'.startsWith(partial2) || 'sig'.startsWith(partial2)) suggestions.push({ text: fCode + '-dr>', hint: fCode + ' distinctiveness' });
        if ('weight'.startsWith(partial2)) suggestions.push({ text: fCode + '-weight>', hint: fCode + ' weight' });
      }
    }
    // Also suggest "sort by"
    if ('sort'.startsWith(lower)) {
      suggestions.push({ text: 'sort by ', hint: 'sorting' });
    }
    return suggestions.slice(0, 10);
  }
  
  // Value completion after =
  const eqMatch = lastToken.match(/^(\w[\w-]*)([=!<>]+)(.*)$/);
  if (eqMatch) {
    const [, field, op, partial] = eqMatch;
    const lower = (partial || '').toLowerCase().replace(/^\(/, '');
    return getValueSuggestions(field.toLowerCase(), lower);
  }
  
  return suggestions;
}

function getValueSuggestions(field, lower) {
  if (!DATA) return [];
  switch (field) {
    case 'faction': {
      const items = [
        { text: 'GreatHouses', hint: 'DC, FS, FWL, LC, CC' },
        { text: 'InnerSphere', hint: 'All IS factions (non-Clan, non-Periphery)' },
        { text: 'Clans', hint: 'All Clan factions' },
        { text: 'InvasionClans', hint: 'CW, CJF, CGB, CSJ' },
        { text: 'ISClans', hint: 'Clans in the IS (CW, CJF, CGB, CSJ, CHH, CNC, CDS, CSR, RD, RA)' },
        { text: 'HomeClans', hint: 'Homeworld Clans (CBS, CCO, CFM, CGS, CIH, CSA, CSV)' },
        { text: 'Periphery', hint: 'TC, MH, OA, MC' },
      ];
      for (const [code, info] of Object.entries(DATA.factions)) {
        items.push({ text: code, hint: info.name });
      }
      return items.filter(i => i.text.toLowerCase().startsWith(lower) || i.hint.toLowerCase().includes(lower)).slice(0, 12);
    }
    case 'chassis': {
      const latestEra = DATA.eras[DATA.eras.length - 1]?.year || 3160;
      const chassisData = getChassisForEra(String(latestEra), 'on');
      const names = Object.keys(chassisData).sort();
      const results = names.filter(n => n.toLowerCase().includes(lower))
        .slice(0, 10)
        .map(n => {
          const members = chassisData[n]?._members;
          const hint = members ? members.join(', ') : (DATA.chassis[n]?.class || '');
          return { text: n, hint };
        });
      // Also suggest from aliases (Clan names, IS reporting names)
      if (results.length < 10) {
        const aliases = getChassisAliases();
        const seen = new Set(results.map(r => r.text));
        for (const [alias, target] of Object.entries(aliases)) {
          if (alias.includes(lower) && !seen.has(target)) {
            seen.add(target);
            results.push({ text: target, hint: `(${alias})` });
            if (results.length >= 12) break;
          }
        }
      }
      return results;
    }
    case 'class':
      return ['Light', 'Medium', 'Heavy', 'Assault']
        .filter(c => c.toLowerCase().startsWith(lower))
        .map(c => ({ text: c, hint: '' }));
    case 'era':
      return DATA.eras
        .filter((e, i, arr) => arr.findIndex(x => x.mulEra === e.mulEra) === i)
        .filter(e => e.mulEra.toLowerCase().includes(lower) || e.label.toLowerCase().includes(lower))
        .slice(0, 10)
        .map(e => ({ text: e.mulEra, hint: e.label }));
    case 'rating':
      return [
        { text: 'A', hint: 'Elite / Keshik' },
        { text: 'B', hint: 'Veteran / Front Line' },
        { text: 'C', hint: 'Regular / Second Line' },
        { text: 'D', hint: 'Green / Solahma' },
        { text: 'F', hint: 'Garrison / PGC' }
      ].filter(i => i.text.toLowerCase().startsWith(lower));
    case 'mode':
      return [{ text: 'A', hint: 'MegaMek Only' }, { text: 'B', hint: 'MegaMek × MUL' }];
    case 'family':
      return [{ text: 'on', hint: 'Merge families' }, { text: 'off', hint: 'Individual chassis' }];
    case 'type':
      return [{ text: 'omni', hint: 'OmniMechs only' }, { text: 'battlemech', hint: 'BattleMechs only' }]
        .filter(i => i.text.startsWith(lower));
    case 'tech':
      return [{ text: 'clan', hint: 'Clan tech' }, { text: 'is', hint: 'Inner Sphere' }, { text: 'mixed', hint: 'Mixed tech' }]
        .filter(i => i.text.startsWith(lower));
    case 'industrial':
      return [{ text: 'show', hint: '' }, { text: 'hide', hint: '' }];
  }
  return [];
}

// ── Filter Chips ──

function renderChips(parsed) {
  const container = document.getElementById('filter-chips');
  container.innerHTML = '';
  
  const chips = [];
  
  if (parsed.factions.length > 0) {
    chips.push({ label: 'faction=' + parsed.factions.join(' OR '), field: 'faction' });
  }
  if (parsed.chassis.length > 0) {
    chips.push({ label: 'chassis=' + parsed.chassis.join(' OR '), field: 'chassis' });
  }
  if (parsed.class) chips.push({ label: 'class' + parsed.class.op + parsed.class.values.join(' OR '), field: 'class' });
  if (parsed.type) chips.push({ label: 'type=' + parsed.type, field: 'type' });
  if (parsed.tech) chips.push({ label: 'tech=' + parsed.tech, field: 'tech' });
  if (parsed.spread) chips.push({ label: `spread${parsed.spread.op}${parsed.spread.val}`, field: 'spread' });
  if (parsed.span) chips.push({ label: `span${parsed.span.op}${parsed.span.val}`, field: 'span' });
  // avg-weight and span still parseable but no chip/column
  if (parsed.weight) chips.push({ label: `weight${parsed.weight.op}${parsed.weight.val}`, field: 'weight' });
  if (parsed.sig) chips.push({ label: `sig${parsed.sig.op}${parsed.sig.val}`, field: 'sig' });
  if (parsed.tons) chips.push({ label: `tons${parsed.tons.op}${parsed.tons.val}`, field: 'tons' });
  for (const bvCond of parsed.bv) {
    chips.push({ label: `bv${bvCond.op}${bvCond.val}`, field: 'bv' });
  }
  for (const fw of parsed.factionWeight) {
    chips.push({ label: `${fw.faction}-weight${fw.op}${fw.val}`, field: `${fw.faction}-weight` });
  }
  for (const fs of parsed.factionSig) {
    chips.push({ label: `${fs.faction}-sig${fs.op}${fs.val}`, field: `${fs.faction}-sig` });
  }
  if (parsed.year) chips.push({ label: 'year=' + parsed.year, field: 'year' });
  if (parsed.era) chips.push({ label: 'era=' + parsed.era, field: 'era' });
  if (parsed.rating) {
    const rLabel = Array.isArray(parsed.rating) ? parsed.rating.join('+') : parsed.rating;
    chips.push({ label: 'rating=' + rLabel, field: 'rating' });
  }
  if (parsed.mode !== 'B') chips.push({ label: 'mode=' + parsed.mode, field: 'mode' });
  if (parsed.sort.length > 0) {
    chips.push({ label: 'sort by ' + parsed.sort.map(s => s.field + ' ' + s.dir).join(', '), field: 'sort' });
  }
  
  for (const chip of chips) {
    const el = document.createElement('span');
    el.className = 'chip';
    el.innerHTML = `${escHtml(chip.label)} <span class="chip-remove" data-field="${chip.field}">×</span>`;
    container.appendChild(el);
  }
  
  // Chip removal
  container.addEventListener('click', (e) => {
    const remove = e.target.closest('.chip-remove');
    if (!remove) return;
    const field = remove.dataset.field;
    removeFieldFromQuery(field);
  });
}

function removeFieldFromQuery(field) {
  const bar = document.getElementById('query-bar');
  let q = bar.value;
  
  // Unified field removal using two generic patterns:
  // 1. "sort by ..." — special case, always at end
  // 2. Everything else: [NOT] <fieldName> <operator> <value>
  //    where value can be: (parenthesized group), "quoted string", or bare word/number
  //
  // Field aliases map to canonical names for matching.
  
  if (field === 'sort') {
    q = q.replace(/\bsort\s+by\s+.+$/gi, '').trim();
    bar.value = q;
    runQuery();
    return;
  }
  
  // Map field name to all recognized aliases for that field
  const fieldAliases = {
    'faction': ['faction'],
    'chassis': ['chassis'],
    'class': ['class'],
    'type': ['type'],
    'tech': ['tech'],
    'spread': ['spread'],
    'span': ['span'],
    'avg-weight': ['avg-weight', 'avg-pref'],
    'weight': ['weight'],
    'sig': ['sig', 'signature', 'dr', 'distinctiveness'],
    'tons': ['tons', 'tonnage'],
    'bv': ['bv', 'battlevalue'],
    'year': ['year'],
    'era': ['era'],
    'rating': ['rating'],
    'mode': ['mode'],
    'family': ['family'],
    'industrial': ['industrial'],
  };
  
  // Handle faction-specific filters (e.g. DC-weight>5, FS-sig>3, DC-dr>2)
  const factionFieldMatch = field.match(/^([A-Z]+)-(weight|sig|dr)$/i);
  if (factionFieldMatch) {
    const fCode = factionFieldMatch[1];
    const metric = factionFieldMatch[2];
    const aliases = metric === 'weight' ? 'weight|pref|preference' : 'sig|signature|dr|distinctiveness';
    const pat = new RegExp(`\\b${fCode}[-\\s](?:${aliases})\\s*[><=!]+\\s*[\\d.]+`, 'gi');
    q = q.replace(pat, '').replace(/\s+/g, ' ').trim();
    bar.value = q;
    runQuery();
    return;
  }
  
  // Build regex from aliases
  // Generic value pattern: parenthesized group, quoted string, or bare token (word/number/dot)
  const aliases = fieldAliases[field] || [field];
  const namePattern = aliases.map(a => a.replace(/[-]/g, '[-]')).join('|');
  const pat = new RegExp(
    `\\b(?:NOT\\s+)?(?:${namePattern})\\s*[><=!]+\\s*(?:\\([^)]+\\)|"[^"]+"|[^\\s]+)`,
    'gi'
  );
  q = q.replace(pat, '').replace(/\s+/g, ' ').trim();
  bar.value = q;
  runQuery();
}

// ── HTML Helpers ──

function formatTonnage(meta) {
  const t = meta.tons;
  const tMax = meta.tonsMax;
  const cls = meta.class || '';
  if (t == null) return '?t';
  if (tMax != null && tMax !== t) {
    return `${t}-${tMax}t`;
  }
  return `${t}t`;
}

function formatClass(meta) {
  return meta.class || '';
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) {
  return escHtml(s);
}

// ── Main Execution ──

let currentEraYear = 3049;
let currentPage = 0;
const PAGE_SIZES = [25, 50, 100, 0]; // 0 = all
const PAGE_SIZE_KEY = 'bt-sig-page-size';

function getPageSize() {
  const saved = localStorage.getItem(PAGE_SIZE_KEY);
  return saved ? parseInt(saved) : 50;
}

function setPageSize(size) {
  localStorage.setItem(PAGE_SIZE_KEY, String(size));
}

function paginateRows(rows, page, pageSize) {
  if (!pageSize || pageSize <= 0) return { pageRows: rows, totalPages: 1, page: 0 };
  const totalPages = Math.ceil(rows.length / pageSize);
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  return { pageRows: rows.slice(start, start + pageSize), totalPages, page: safePage };
}

function renderPagination(container, totalRows, currentPg, totalPages, onPageChange) {
  const pageSize = getPageSize();
  
  // Remove existing pagination bar if present
  const existing = container.querySelector('.pagination-bar');
  if (existing) existing.remove();
  
  if (totalRows <= 25) return; // No pagination needed for small results
  
  const bar = document.createElement('div');
  bar.className = 'pagination-bar';
  
  // Page size selector
  let html = '<span class="page-size-select">Show: ';
  for (const size of PAGE_SIZES) {
    const label = size === 0 ? 'All' : String(size);
    const active = (size === pageSize) || (size === 0 && pageSize === 0);
    html += `<button class="page-size-btn${active ? ' active' : ''}" data-size="${size}">${label}</button>`;
  }
  html += '</span>';
  
  // Page info + nav
  if (pageSize > 0 && totalPages > 1) {
    const start = currentPg * pageSize + 1;
    const end = Math.min((currentPg + 1) * pageSize, totalRows);
    html += `<span class="page-info">${start}–${end} of ${totalRows}</span>`;
    html += `<span class="page-nav">`;
    html += `<button class="page-btn" data-page="0" ${currentPg === 0 ? 'disabled' : ''}>«</button>`;
    html += `<button class="page-btn" data-page="${currentPg - 1}" ${currentPg === 0 ? 'disabled' : ''}>‹</button>`;
    html += `<button class="page-btn" data-page="${currentPg + 1}" ${currentPg >= totalPages - 1 ? 'disabled' : ''}>›</button>`;
    html += `<button class="page-btn" data-page="${totalPages - 1}" ${currentPg >= totalPages - 1 ? 'disabled' : ''}>»</button>`;
    html += `</span>`;
  } else {
    html += `<span class="page-info">${totalRows} results</span>`;
  }
  
  bar.innerHTML = html;
  container.appendChild(bar);
  
  // Event handlers
  bar.addEventListener('click', (e) => {
    const sizeBtn = e.target.closest('.page-size-btn');
    if (sizeBtn) {
      const newSize = parseInt(sizeBtn.dataset.size);
      setPageSize(newSize);
      currentPage = 0;
      onPageChange(0);
      return;
    }
    const pageBtn = e.target.closest('.page-btn');
    if (pageBtn && !pageBtn.disabled) {
      const newPage = parseInt(pageBtn.dataset.page);
      currentPage = newPage;
      onPageChange(newPage);
    }
  });
}

function runQuery() {
  currentPage = 0; // Reset pagination on new query
  const bar = document.getElementById('query-bar');
  const queryStr = bar.value.trim();
  
  const landing = document.getElementById('landing');
  const viewContainer = document.getElementById('view-container');
  const statusText = document.getElementById('status-text');
  const modeIndicator = document.getElementById('mode-indicator');
  
  const columnLegend = document.getElementById('column-legend');
  
  if (!queryStr) {
    landing.style.display = '';
    viewContainer.classList.add('hidden');
    document.getElementById('col-vis-bar').classList.add('hidden');
    if (columnLegend) columnLegend.classList.add('hidden');
    document.getElementById('filter-chips').innerHTML = '';
    statusText.textContent = '';
    return;
  }
  
  landing.style.display = 'none';
  if (columnLegend) columnLegend.classList.remove('hidden');
  
  const parsed = parseQuery(queryStr);
  renderChips(parsed);
  
  // Update mode indicator
  modeIndicator.textContent = parsed.mode === 'A' ? 'Mode A (MegaMek Only)' : 'Mode B (MegaMek × MUL)';
  
  // Determine era
  let eraYear = null;
  if (parsed.year) {
    eraYear = getEraYear(parsed.year);
  } else if (parsed.era) {
    const eraEntry = DATA.eras.find(e => 
      e.mulEra?.toLowerCase() === parsed.era.toLowerCase() ||
      e.label.toLowerCase().includes(parsed.era.toLowerCase())
    );
    if (eraEntry) eraYear = eraEntry.year;
  }
  if (!eraYear) eraYear = 3049;
  currentEraYear = eraYear;
  
  const familyMode = parsed.family || 'off';
  const modeB = parsed.mode !== 'A';
  const hideIndustrial = parsed.industrial !== 'show'; // hidden by default
  
  const chassisData = getChassisForEra(String(eraYear), familyMode);
  const scopedFactions = parsed.factions;
  const chassisFilter = parsed.chassis.map(c => resolveChassis(c));
  
  // Resolve unit quality rating indices (same for all chassis)
  let ratingIdx = null;
  let multiRatingIdxs = null;
  let probRatingIdx = null; // for entryToProb: null=all tiers, number=single, array=multi
  if (Array.isArray(parsed.rating)) {
    multiRatingIdxs = parsed.rating.map(r => RATING_INDEX[r]);
    probRatingIdx = multiRatingIdxs;
  } else if (parsed.rating) {
    ratingIdx = RATING_INDEX[parsed.rating];
    probRatingIdx = ratingIdx;
  }

  // Build rows
  const rows = [];
  for (const [chassisName, data] of Object.entries(chassisData)) {
    // Chassis filter
    if (chassisFilter.length > 0) {
      const matches = chassisFilter.some(cf => {
        const lower = cf.toLowerCase();
        return chassisName.toLowerCase() === lower || chassisName.toLowerCase().includes(lower);
      });
      if (parsed.chassisOp === '!=') {
        if (matches) continue;  // Exclude matching chassis
      } else {
        if (!matches) continue; // Include only matching chassis
      }
    }
    
    const meta = data._meta || DATA.chassis[chassisName] || {};
    
    if (parsed.class) {
      const metaClasses = meta.class ? meta.class.toLowerCase().split('/').map(c => c.trim()) : [];
      const matchesClass = metaClasses.some(c => parsed.class.values.includes(c));
      if (parsed.class.op === '!=') {
        if (matchesClass) continue;  // Exclude matching classes
      } else {
        if (!matchesClass) continue; // Include only matching classes
        if (metaClasses.length === 0) continue;
      }
    }
    
    // Hide incomplete chassis (no tonnage data) unless user opted in
    if (!getShowIncomplete() && meta.tons == null) continue;
    if (hideIndustrial && meta.industrial) continue;
    if (/\bLAM\b/.test(chassisName)) continue; // LAMs always hidden for now
    if (parsed.type === 'omni' && !meta.omni) continue;
    if (parsed.type === 'battlemech' && (meta.omni || meta.industrial)) continue;
    if (parsed.tech) {
      const t = (meta.tech || '').toLowerCase();
      if (parsed.tech === 'clan' && !t.includes('clan')) continue;
      if (parsed.tech === 'is' && t !== 'inner sphere') continue;
      if (parsed.tech === 'mixed' && t !== 'mixed') continue;
    }
    if (parsed.year && meta.intro && meta.intro > parsed.year) continue;
    if (parsed.tons) {
      // For families with a tonnage range, use the range for filtering
      const tMin = meta.tons;
      const tMax = meta.tonsMax || meta.tons;
      if (tMin != null) {
        // Range-aware: match if any tonnage in [min,max] could satisfy the filter
        const op = parsed.tons.op;
        const val = parsed.tons.val;
        let passes;
        if (op === '=' || op === '==') {
          // tons=60 matches if 60 is within [min, max]
          passes = val >= tMin && val <= tMax;
        } else if (op === '!=') {
          // tons!=60 matches if the range isn't exactly [60, 60]
          passes = tMin !== val || tMax !== val;
        } else {
          // For >, >=, <, <=: match if either endpoint satisfies
          passes = compareOp(tMin, op, val) || compareOp(tMax, op, val);
        }
        if (!passes) continue;
      }
    }
    
    // Resolve unit quality rating (no WCD adjustment — that's applied at display level)
    // Support single rating (string → index), multi-rating (array → average those tiers), or null (all-tier average)
    let ratingIdx = null;
    let multiRatingIdxs = null;
    let probRatingIdx = null; // for entryToProb: null=all tiers, number=single, array=multi
    if (Array.isArray(parsed.rating)) {
      multiRatingIdxs = parsed.rating.map(r => RATING_INDEX[r]);
      probRatingIdx = multiRatingIdxs;
    } else if (parsed.rating) {
      ratingIdx = RATING_INDEX[parsed.rating];
      probRatingIdx = ratingIdx;
    }
    let weights;
    if (multiRatingIdxs) {
      // Average across specified tiers
      const perTier = multiRatingIdxs.map(idx => computeResolvedWeights(data.w, idx));
      weights = {};
      const allKeys = new Set(perTier.flatMap(t => Object.keys(t)));
      for (const f of allKeys) {
        weights[f] = perTier.reduce((sum, t) => sum + (t[f] || 0), 0) / multiRatingIdxs.length;
      }
    } else {
      weights = computeResolvedWeights(data.w, ratingIdx);
    }
    if (modeB) {
      for (const f of Object.keys(weights)) {
        if (data.mul && !data.mul[f]) {
          weights[f] = 0;
        } else if (!data.mul) {
          // No MUL data at all for this chassis — in Mode B, keep MegaMek data as-is
          // (permissive: no MUL data = no filter)
        }
      }
    }
    
    const activeFactions = scopedFactions.length > 0 ? scopedFactions : Object.keys(weights).filter(f => weights[f] > 0);
    const spread = scopedFactions.length > 1 ? computeSpread(weights, scopedFactions) : 0;
    const span = computeSpan(weights, activeFactions);
    const avgWeight = computeAvgWeight(weights, activeFactions);
    
    // Filters
    if (parsed.spread && !compareOp(spread, parsed.spread.op, parsed.spread.val)) continue;
    if (parsed.span && !compareOp(span, parsed.span.op, parsed.span.val)) continue;
    if (parsed.avgWeight && !compareOp(avgWeight, parsed.avgWeight.op, parsed.avgWeight.val)) continue;
    if (parsed.weight) {
      const checkFactions = scopedFactions.length > 0 ? scopedFactions : Object.keys(weights);
      const anyPass = checkFactions.some(f => compareOp(weights[f] || 0, parsed.weight.op, parsed.weight.val));
      if (!anyPass) continue;
    }
    
    // Faction-specific weight filter
    if (parsed.factionWeight.length > 0) {
      if (!parsed.factionWeight.every(fw => compareOp(weights[fw.faction] || 0, fw.op, fw.val))) continue;
    }
    
    const hasAnyWeight = (scopedFactions.length > 0 ? scopedFactions : Object.keys(weights)).some(f => (weights[f] || 0) > 0);
    if (!hasAnyWeight) continue;
    
    // Compute BV range from in-scope variants
    const bvRange = computeBVRange(data.v, scopedFactions, data.mul, modeB, parsed.year);
    
    // BV filter: chassis passes if any single in-scope variant satisfies ALL bv conditions
    if (parsed.bv.length > 0 && bvRange) {
      // Check if any individual BV value in the range satisfies all conditions
      const bvPass = bvRange.bvList.some(bv =>
        parsed.bv.every(cond => compareOp(bv, cond.op, cond.val))
      );
      if (!bvPass) continue;
    } else if (parsed.bv.length > 0 && !bvRange) {
      continue; // No BV data, can't pass a BV filter
    }
    
    rows.push({
      name: chassisName,
      meta,
      weights,
      rawW: data.w,  // raw entries with modifiers, for prob-space computation
      spread,
      span,
      avgWeight,
      sig: null,
      bvRange,
      variants: data.v,
      mul: data.mul,
      family: data.fam,
      members: data._members
    });
  }
  
  // Compute global signature scores (weight × z-score)
  // Signature ALWAYS uses WCD mixing — even in single-class view — because sig
  // answers "how much does this mech belong to this faction?" which includes
  // weight class preferences (e.g. Lyran heavy bias boosts their heavy sigs).
  const allFactionCodes = Object.keys(DATA.factions);
  // Compute sig for scoped factions, or ALL fielding factions if none scoped
  const sigFactions = scopedFactions.length > 0 ? scopedFactions : null;
  {
    for (const row of rows) {
      const wcdParams = { chassisClass: row.meta?.class, eraYear };
      const factions = sigFactions || Object.keys(row.weights).filter(f => (row.weights[f] || 0) > 0);
      if (factions.length === 0) continue;
      row.sig = computeSignature(row.weights, row.mul || {}, factions, allFactionCodes, wcdParams, row.meta?.tech, row.rawW, probRatingIdx);
    }
    
    // Compute tiers using GLOBAL Jenks Natural Breaks across all displayed factions.
    // This ensures a sig score of 8.0 is the same tier regardless of faction,
    // making cross-faction tier comparison meaningful.
    {
      const allSigValues = [];
      // Collect all sig values — from scoped factions, or all factions with sig data
      for (const row of rows) {
        if (!row.sig) continue;
        const factions = sigFactions || Object.keys(row.sig).filter(k => !k.includes('_') && row.sig[k] > 0);
        for (const f of factions) {
          const v = row.sig[f] || 0;
          if (v > 0) allSigValues.push(v);
        }
      }
      allSigValues.sort((a, b) => a - b);
      // Log-transform before Jenks to handle exponential sig distribution.
      // Finds natural breaks in log space, then maps breaks back to raw space.
      const logValues = allSigValues.map(v => Math.log2(v));
      const logBreaks = logValues.length > 0 ? jenksBreaks(logValues, 5) : [];
      const breaks = logBreaks.map(b => Math.pow(2, b));
      for (const row of rows) {
        if (!row.sig) continue;
        const factions = sigFactions || Object.keys(row.sig).filter(k => !k.includes('_') && row.sig[k] > 0);
        for (const f of factions) {
          const v = row.sig[f] || 0;
          if (v > 0) {
            row.sig[f + '_tier'] = assignTierFromBreaks(v, breaks);
          }
        }
      }
    }
  }
  
  // Compute biased weights (probability-space weight × WCD mixing factor)
  // Uses entryToProb for correct cross-tier averaging in probability space
  for (const row of rows) {
    row.biasedWeights = {};
    for (const f of Object.keys(row.weights)) {
      const w = row.weights[f];
      if (w <= 0) { row.biasedWeights[f] = 0; continue; }
      const rawEntry = row.rawW?.[f];
      const prob = rawEntry ? entryToProb(rawEntry, probRatingIdx) : toProb(w);
      const mixFactor = getWcdMixingFactor(f, row.meta?.class, eraYear);
      row.biasedWeights[f] = prob * mixFactor;
    }
  }
  
  // Apply post-computation filters (sig)
  if (parsed.sig || parsed.factionSig.length > 0) {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (parsed.sig) {
        if (!row.sig) { rows.splice(i, 1); continue; }
        const sf = scopedFactions.length > 0 ? scopedFactions : Object.keys(row.sig);
        if (!sf.some(f => compareOp(row.sig[f] || 0, parsed.sig.op, parsed.sig.val))) {
          rows.splice(i, 1); continue;
        }
      }
      if (parsed.factionSig.length > 0) {
        if (!row.sig) { rows.splice(i, 1); continue; }
        if (!parsed.factionSig.every(fs => compareOp(row.sig[fs.faction] || 0, fs.op, fs.val))) {
          rows.splice(i, 1); continue;
        }
      }
    }
  }
  
  // Sort
  if (parsed.sort.length > 0) {
    sortRowsInPlace(rows, parsed.sort);
  } else if (scopedFactions.length === 1) {
    const f = scopedFactions[0];
    rows.sort((a, b) => (b.weights[f] || 0) - (a.weights[f] || 0));
  } else if (scopedFactions.length > 1) {
    rows.sort((a, b) => b.spread - a.spread);
  } else {
    rows.sort((a, b) => {
      const maxA = Math.max(0, ...Object.values(a.weights));
      const maxB = Math.max(0, ...Object.values(b.weights));
      return maxB - maxA;
    });
  }
  
  statusText.textContent = `${rows.length} chassis | Era: ${eraYear}`;
  
  // View routing
  const view = determineView(parsed);
  
  switch (view) {
    case 'single-faction':
      // If explicit sort or sig filter is set, use comparison view (which handles sort + shows sig)
      if (parsed.sort.length > 0 || parsed.sig || parsed.factionSig.length > 0) {
        renderFactionComparison(rows, scopedFactions, eraYear, parsed);
      } else {
        renderSingleFaction(rows, scopedFactions[0], eraYear);
      }
      break;
    case 'faction-comparison':
    case 'mech-detail':
      renderFactionComparison(rows, scopedFactions, eraYear, parsed);
      break;
    case 'mech':
      renderMechView(rows, eraYear);
      break;
    default:
      renderFactionComparison(rows, scopedFactions.length > 0 ? scopedFactions : getAllFactionsFromRows(rows).slice(0, 8), eraYear, parsed);
  }
}

function sortRowsInPlace(rows, sortSpec) {
  rows.sort((a, b) => {
    for (const { field, dir } of sortSpec) {
      let va, vb;
      if (field === 'spread') {
        va = a.spread; vb = b.spread;
      } else if (field === 'span') {
        va = a.span; vb = b.span;
      } else if (field === 'avgpref' || field === 'avg-pref' || field === 'avgweight' || field === 'avg-weight') {
        va = a.avgWeight; vb = b.avgWeight;
      } else if (field === 'weight') {
        va = Math.max(0, ...Object.values(a.weights));
        vb = Math.max(0, ...Object.values(b.weights));
      } else if (field === 'name' || field === 'chassis') {
        const cmp = dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        if (cmp !== 0) return cmp;
        continue;
      } else if (field === 'tonnage' || field === 'tons') {
        va = a.meta.tons || 0; vb = b.meta.tons || 0;
      } else if (field === 'bv' || field === 'battlevalue') {
        // asc sorts by bvMin (cheapest first), desc sorts by bvMax (biggest first)
        if (dir === 'asc') {
          va = a.bvRange?.bvMin || 0; vb = b.bvRange?.bvMin || 0;
        } else {
          va = a.bvRange?.bvMax || 0; vb = b.bvRange?.bvMax || 0;
        }
      } else if (field.endsWith('-bw')) {
        const fCode = field.replace('-bw', '').toUpperCase();
        va = a.biasedWeights?.[fCode] || 0;
        vb = b.biasedWeights?.[fCode] || 0;
      } else if (field === 'bw') {
        va = a.biasedWeights ? Math.max(0, ...Object.values(a.biasedWeights)) : 0;
        vb = b.biasedWeights ? Math.max(0, ...Object.values(b.biasedWeights)) : 0;
      } else if (field.endsWith('-weight')) {
        const fCode = field.replace('-weight', '').toUpperCase();
        va = a.weights?.[fCode] || 0;
        vb = b.weights?.[fCode] || 0;
      } else if (field.endsWith('-sig') || field.endsWith('-signature') || field.endsWith('-dr') || field.endsWith('-distinctiveness')) {
        const fCode = field.replace(/-(sig(nature)?|dr|distinctiveness)$/, '').toUpperCase();
        // Fielded but sig=0 gets a tiny positive value to sort above not-fielded
        va = a.sig?.[fCode] || ((a.weights?.[fCode] || 0) > 0 ? 1e-9 : 0);
        vb = b.sig?.[fCode] || ((b.weights?.[fCode] || 0) > 0 ? 1e-9 : 0);
      } else if (field === 'sig' || field === 'signature' || field === 'dr' || field === 'distinctiveness') {
        va = a.sig ? Math.max(0, ...Object.values(a.sig)) : 0;
        vb = b.sig ? Math.max(0, ...Object.values(b.sig)) : 0;
      } else {
        continue;
      }
      const diff = dir === 'asc' ? (va - vb) : (vb - va);
      if (diff !== 0) return diff;
    }
    return 0;
  });
}

// ── Initialization ──

async function init() {
  try {
    const resp = await fetch('app-data.json?v=' + APP_VERSION);
    DATA = await resp.json();
    // alias cache resets automatically (stored on DATA object)
    applyFamilyOverridesToData(); // apply user's saved family preferences
    
    // Show version + data info
    {
      const parts = ['v' + APP_VERSION + (DEPLOY_TIME !== 'dev' ? ' · ' + DEPLOY_TIME : '')];
      if (DATA._meta?.generated) {
        const d = new Date(DATA._meta.generated);
        parts.push('Data: ' + d.toISOString().slice(0, 10).replace(/-/g, ''));
      }
      if (DATA._meta?.description) {
        parts.push(DATA._meta.description);
      }
      document.getElementById('deploy-stamp').textContent = parts.join(' • ');
    }
    // Hide loading overlay
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  } catch (err) {
    console.error('Failed to load app-data.json:', err);
    document.getElementById('status-text').textContent = 'Error loading data!';
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
    return;
  }
  
  const bar = document.getElementById('query-bar');
  const suggestBox = document.getElementById('suggest-box');
  const resetBtn = document.getElementById('reset-btn');
  let suggestIndex = -1;
  
  // Reset button — clear query and return to landing
  function updateResetBtn() {
    resetBtn.classList.toggle('hidden', !bar.value.trim());
  }
  resetBtn.addEventListener('click', () => {
    bar.value = '';
    updateResetBtn();
    runQuery(); // triggers landing page display
    history.replaceState(null, '', location.pathname);
    bar.focus();
  });
  
  // Debounced query execution
  let queryTimeout = null;
  bar.addEventListener('input', () => {
    updateResetBtn();
    clearTimeout(queryTimeout);
    queryTimeout = setTimeout(() => {
      // Show suggestions
      const suggestions = getSuggestions(bar.value, bar.selectionStart);
      renderSuggestions(suggestions);
    }, 150);
  });
  
  bar.addEventListener('keydown', (e) => {
    const items = suggestBox.querySelectorAll('.suggest-item');
    
    if (e.key === 'Enter') {
      if (suggestIndex >= 0 && items[suggestIndex]) {
        e.preventDefault();
        applySuggestion(items[suggestIndex].dataset.text);
      } else {
        e.preventDefault();
        suggestBox.classList.add('hidden');
        runQuery();
      }
      return;
    }
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
      updateSuggestHighlight(items);
      return;
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      suggestIndex = Math.max(suggestIndex - 1, -1);
      updateSuggestHighlight(items);
      return;
    }
    
    if (e.key === 'Tab' && items.length > 0) {
      e.preventDefault();
      const idx = suggestIndex >= 0 ? suggestIndex : 0;
      if (items[idx]) applySuggestion(items[idx].dataset.text);
      return;
    }
    
    if (e.key === 'Escape') {
      suggestBox.classList.add('hidden');
      suggestIndex = -1;
    }
  });
  
  function renderSuggestions(suggestions) {
    suggestIndex = -1;
    if (suggestions.length === 0) {
      suggestBox.classList.add('hidden');
      return;
    }
    
    suggestBox.innerHTML = '';
    for (const s of suggestions) {
      const div = document.createElement('div');
      div.className = 'suggest-item';
      div.dataset.text = s.text;
      div.innerHTML = `${escHtml(s.text)}${s.hint ? `<span class="hint">${escHtml(s.hint)}</span>` : ''}`;
      div.addEventListener('click', () => applySuggestion(s.text));
      suggestBox.appendChild(div);
    }
    suggestBox.classList.remove('hidden');
  }
  
  function applySuggestion(text) {
    const value = bar.value;
    const cursor = bar.selectionStart;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    
    // Find the last token before cursor
    const lastSpace = before.lastIndexOf(' ');
    const lastEq = Math.max(before.lastIndexOf('='), before.lastIndexOf('('));
    const replaceFrom = Math.max(lastSpace, lastEq) + 1;
    
    bar.value = before.slice(0, replaceFrom) + text + (after.startsWith(' ') ? after : ' ' + after);
    bar.selectionStart = bar.selectionEnd = replaceFrom + text.length + (text.endsWith('=') || text.endsWith(' ') ? 0 : 1);
    bar.focus();
    suggestBox.classList.add('hidden');
    suggestIndex = -1;
  }
  
  function updateSuggestHighlight(items) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === suggestIndex);
    });
  }
  
  // Example query buttons
  document.querySelectorAll('.example-query').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.value = btn.dataset.query;
      updateResetBtn();
      runQuery();
    });
  });
  
  // Close variant overlay
  document.getElementById('variant-close').addEventListener('click', () => {
    document.getElementById('variant-overlay').classList.add('hidden');
  });
  document.getElementById('variant-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden');
    }
  });
  
  // Title click = reset to home
  document.querySelector('header h1').addEventListener('click', () => {
    bar.value = '';
    updateResetBtn();
    runQuery();
    history.replaceState(null, '', location.pathname);
    bar.focus();
  });

  // ── Settings Panel ──
  initSettings();

  // ── Help Panel ──
  initHelp();

  // ── Column Visibility ──
  initColVisibility();

  // ── Quick Filter Insert ──
  initQuickFilter();

  // Check URL hash for initial query
  if (location.hash) {
    bar.value = decodeURIComponent(location.hash.slice(1));
    updateResetBtn();
    runQuery();
  }
}

// ── Family overrides (persisted in localStorage) ──
// Structure: { "Dragon Family": { enabled: true, chassis: ["Dragon", "Grand Dragon"] }, ... }
// Only stores overrides — missing entries use DATA.families defaults.

const INCOMPLETE_STORAGE_KEY = 'bt-sig-show-incomplete';

function getShowIncomplete() {
  try { return localStorage.getItem(INCOMPLETE_STORAGE_KEY) === 'true'; }
  catch { return false; }
}

const FAMILY_STORAGE_KEY = 'bt-sig-family-overrides';

function loadFamilyOverrides() {
  try {
    return JSON.parse(localStorage.getItem(FAMILY_STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveFamilyOverrides(overrides) {
  localStorage.setItem(FAMILY_STORAGE_KEY, JSON.stringify(overrides));
}

function getEffectiveFamilies() {
  if (!DATA || !DATA.families) return [];
  const overrides = loadFamilyOverrides();
  return DATA.families.map(fam => {
    const ov = overrides[fam.groupName];
    return {
      groupName: fam.groupName,
      chassis: ov?.chassis || fam.chassis,
      enabled: ov?.hasOwnProperty('enabled') ? ov.enabled : fam.enabled,
      isOverridden: !!ov
    };
  }).concat(
    // User-created families (not in DATA.families)
    Object.entries(overrides)
      .filter(([name]) => !DATA.families.some(f => f.groupName === name))
      .map(([name, ov]) => ({
        groupName: name,
        chassis: ov.chassis || [],
        enabled: ov.enabled !== false,
        isOverridden: true,
        isCustom: true
      }))
  );
}

function initSettings() {
  const overlay = document.getElementById('settings-overlay');

  // Open/close
  document.getElementById('settings-btn').addEventListener('click', () => {
    overlay.classList.remove('hidden');
    renderFamiliesList();
  });
  document.getElementById('settings-close').addEventListener('click', () => {
    overlay.classList.add('hidden');
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });

  // Global family toggle
  const globalToggle = document.getElementById('families-global-toggle');
  globalToggle.addEventListener('change', () => {
    const bar = document.getElementById('query-bar');
    const current = bar.value.replace(/\bfamily=(on|off)\b/g, '').replace(/\s+/g, ' ').trim();
    if (!globalToggle.checked) {
      // Insert before sort clause so it doesn't get swallowed
      const sortMatch = current.match(/^(.*?)(\s+sort\s+by\s+.+)$/i);
      if (sortMatch) {
        bar.value = (sortMatch[1].trim() + ' family=off' + sortMatch[2]).trim();
      } else {
        bar.value = (current + ' family=off').trim();
      }
    } else {
      bar.value = current;
    }
    runQuery();
    renderFamiliesList();
  });

  // Incomplete chassis toggle
  const incompleteToggle = document.getElementById('show-incomplete-toggle');
  incompleteToggle.checked = getShowIncomplete();
  incompleteToggle.addEventListener('change', () => {
    try { localStorage.setItem(INCOMPLETE_STORAGE_KEY, incompleteToggle.checked); }
    catch {}
    runQuery();
  });

  // Data mode radio
  document.querySelectorAll('input[name="data-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const bar = document.getElementById('query-bar');
      const current = bar.value.replace(/\bmode=[AB]\b/g, '').replace(/\s+/g, ' ').trim();
      if (radio.value === 'A') {
        const sortMatch = current.match(/^(.*?)(\s+sort\s+by\s+.+)$/i);
        if (sortMatch) {
          bar.value = (sortMatch[1].trim() + ' mode=A' + sortMatch[2]).trim();
        } else {
          bar.value = (current + ' mode=A').trim();
        }
      } else {
        bar.value = current;
      }
      runQuery();
    });
  });

  // Reset to defaults
  document.getElementById('reset-defaults-btn').addEventListener('click', () => {
    if (!confirm('Reset all preferences to defaults? This clears column visibility, family overrides, and other saved settings.')) return;
    try {
      localStorage.removeItem(COL_VIS_KEY);
      localStorage.removeItem(FAMILY_STORAGE_KEY);
      localStorage.removeItem(INCOMPLETE_STORAGE_KEY);
      localStorage.removeItem(PAGE_SIZE_KEY);
    } catch {}
    location.reload();
  });
}

function initHelp() {
  const overlay = document.getElementById('help-overlay');
  if (!overlay) return;

  // Column legend expand/collapse
  const legendHeader = document.getElementById('legend-header');
  const legendToggle = document.getElementById('legend-toggle');
  const legendBody = document.getElementById('legend-body');
  if (legendHeader && legendToggle && legendBody) {
    const savedState = localStorage.getItem('bt-sig-legend-expanded');
    // Default to expanded
    if (savedState === '0') {
      legendBody.classList.add('hidden');
      legendToggle.classList.remove('expanded');
    }
    legendHeader.addEventListener('click', () => {
      const isHidden = legendBody.classList.toggle('hidden');
      legendToggle.classList.toggle('expanded', !isHidden);
      localStorage.setItem('bt-sig-legend-expanded', isHidden ? '0' : '1');
    });
  }

  document.getElementById('help-btn').addEventListener('click', () => {
    overlay.classList.remove('hidden');
  });
  document.getElementById('help-close').addEventListener('click', () => {
    overlay.classList.add('hidden');
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });

  // Help example queries — run query and close help
  overlay.querySelectorAll('.help-example-query').forEach(btn => {
    btn.addEventListener('click', () => {
      const bar = document.getElementById('query-bar');
      bar.value = btn.dataset.query;
      overlay.classList.add('hidden');
      runQuery();
    });
  });
}

function renderFamiliesList() {
  const container = document.getElementById('families-list');
  if (!DATA || !DATA.families) {
    container.innerHTML = '<p style="color:var(--text-dim)">Loading...</p>';
    return;
  }

  const globalOn = document.getElementById('families-global-toggle').checked;
  const families = getEffectiveFamilies();

  let html = '';
  for (const fam of families) {
    const displayName = fam.groupName.replace(/ Family$/, '');
    const membersStr = fam.chassis.join(', ');
    html += `<div class="family-item" style="opacity:${globalOn ? 1 : 0.4}">
      <label class="family-toggle">
        <input type="checkbox" class="family-enable-cb" data-family="${fam.groupName}" ${fam.enabled ? 'checked' : ''} ${globalOn ? '' : 'disabled'}>
      </label>
      <div class="family-info">
        <span class="family-name">${fam.isCustom ? '<span class="family-badge family-badge-user" title="User-created">USER</span>' : '<span class="family-badge family-badge-system" title="System-defined">SYS</span>'} ${displayName}${fam.isOverridden ? ' ✎' : ''}</span>
        <span class="family-members">${membersStr}</span>
      </div>
      <button class="family-edit-btn" data-family="${fam.groupName}" title="Edit family" ${globalOn ? '' : 'disabled'}>✎</button>
    </div>`;
  }
  html += `<button id="add-family-btn" class="add-family-btn" ${globalOn ? '' : 'disabled'}>+ Add Family</button>`;
  container.innerHTML = html;

  // Wire up per-family toggle
  container.querySelectorAll('.family-enable-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const overrides = loadFamilyOverrides();
      const name = cb.dataset.family;
      if (!overrides[name]) overrides[name] = {};
      overrides[name].enabled = cb.checked;
      saveFamilyOverrides(overrides);
      applyFamilyOverridesToData();
      runQuery();
    });
  });

  // Wire up edit buttons
  container.querySelectorAll('.family-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openFamilyEditor(btn.dataset.family));
  });

  // Wire up add button
  const addBtn = container.querySelector('#add-family-btn');
  if (addBtn) addBtn.addEventListener('click', () => openFamilyEditor(null));
}

function openFamilyEditor(familyName) {
  const families = getEffectiveFamilies();
  const fam = familyName ? families.find(f => f.groupName === familyName) : null;

  const name = fam ? fam.groupName.replace(/ Family$/, '') : '';
  const members = fam ? fam.chassis.join(', ') : '';

  const dialog = document.createElement('div');
  dialog.className = 'family-editor-overlay';
  dialog.innerHTML = `
    <div class="family-editor">
      <h4>${fam ? 'Edit' : 'New'} Family</h4>
      <label>Name:<input type="text" id="fed-name" value="${name}" placeholder="e.g. Dragon"></label>
      <label>Chassis (comma-separated):<input type="text" id="fed-members" value="${members}" placeholder="e.g. Dragon, Grand Dragon, Dragon II"></label>
      <div class="fed-actions">
        ${fam ? '<button id="fed-delete" class="fed-delete">Delete</button>' : '<span></span>'}
        ${fam?.isOverridden ? '<button id="fed-reset" class="fed-reset">Reset to Default</button>' : '<span></span>'}
        <button id="fed-cancel">Cancel</button>
        <button id="fed-save" class="fed-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  dialog.querySelector('#fed-cancel').addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  // Autocomplete for chassis members field
  const fedMembers = dialog.querySelector('#fed-members');
  const suggestDiv = document.createElement('div');
  suggestDiv.className = 'fed-suggest hidden';
  fedMembers.parentNode.style.position = 'relative';
  fedMembers.parentNode.appendChild(suggestDiv);
  let fedSuggestIdx = -1;

  function getFedSuggestions() {
    if (!DATA) return [];
    const val = fedMembers.value;
    const cursor = fedMembers.selectionStart;
    const before = val.slice(0, cursor);
    const lastComma = before.lastIndexOf(',');
    const partial = before.slice(lastComma + 1).trim().toLowerCase();
    if (!partial) return [];

    const allChassis = Object.keys(DATA.chassis).sort();
    const already = val.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return allChassis
      .filter(c => c.toLowerCase().includes(partial) && !already.includes(c.toLowerCase()))
      .slice(0, 8);
  }

  function renderFedSuggestions(items) {
    fedSuggestIdx = -1;
    if (items.length === 0) { suggestDiv.classList.add('hidden'); return; }
    suggestDiv.innerHTML = '';
    for (const name of items) {
      const div = document.createElement('div');
      div.className = 'suggest-item';
      div.textContent = name;
      div.addEventListener('click', () => applyFedSuggestion(name));
      suggestDiv.appendChild(div);
    }
    suggestDiv.classList.remove('hidden');
  }

  function applyFedSuggestion(name) {
    const val = fedMembers.value;
    const cursor = fedMembers.selectionStart;
    const before = val.slice(0, cursor);
    const after = val.slice(cursor);
    const lastComma = before.lastIndexOf(',');
    const prefix = lastComma >= 0 ? before.slice(0, lastComma + 1) + ' ' : '';
    const afterTrimmed = after.replace(/^[^,]*/, '');
    fedMembers.value = prefix + name + (afterTrimmed.startsWith(',') ? afterTrimmed : ', ' + afterTrimmed.replace(/^,?\s*/, ''));
    // Clean trailing comma/space
    fedMembers.value = fedMembers.value.replace(/,\s*$/, '');
    suggestDiv.classList.add('hidden');
    fedSuggestIdx = -1;
    fedMembers.focus();
  }

  fedMembers.addEventListener('input', () => {
    renderFedSuggestions(getFedSuggestions());
  });

  fedMembers.addEventListener('keydown', (e) => {
    const items = suggestDiv.querySelectorAll('.suggest-item');
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      fedSuggestIdx = Math.min(fedSuggestIdx + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('active', i === fedSuggestIdx));
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      fedSuggestIdx = Math.max(fedSuggestIdx - 1, -1);
      items.forEach((it, i) => it.classList.toggle('active', i === fedSuggestIdx));
    } else if (e.key === 'Tab' && items.length > 0) {
      e.preventDefault();
      const idx = fedSuggestIdx >= 0 ? fedSuggestIdx : 0;
      if (items[idx]) applyFedSuggestion(items[idx].textContent);
    } else if (e.key === 'Enter' && fedSuggestIdx >= 0 && items[fedSuggestIdx]) {
      e.preventDefault();
      applyFedSuggestion(items[fedSuggestIdx].textContent);
    } else if (e.key === 'Escape') {
      suggestDiv.classList.add('hidden');
      fedSuggestIdx = -1;
    }
  });

  dialog.querySelector('#fed-save').addEventListener('click', () => {
    const newName = dialog.querySelector('#fed-name').value.trim();
    const newMembers = dialog.querySelector('#fed-members').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!newName || newMembers.length === 0) return;

    const fullName = newName.endsWith(' Family') ? newName : newName + ' Family';
    const overrides = loadFamilyOverrides();

    // If renaming, remove old entry
    if (fam && fam.groupName !== fullName) {
      delete overrides[fam.groupName];
    }

    overrides[fullName] = {
      enabled: fam ? (overrides[fam.groupName]?.enabled ?? fam.enabled) : true,
      chassis: newMembers
    };
    saveFamilyOverrides(overrides);
    applyFamilyOverridesToData();
    dialog.remove();
    renderFamiliesList();
    runQuery();
  });

  const deleteBtn = dialog.querySelector('#fed-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const overrides = loadFamilyOverrides();
      if (fam.isCustom) {
        delete overrides[fam.groupName];
      } else {
        // Can't delete a built-in — disable it instead
        overrides[fam.groupName] = { enabled: false, chassis: fam.chassis };
      }
      saveFamilyOverrides(overrides);
      applyFamilyOverridesToData();
      dialog.remove();
      renderFamiliesList();
      runQuery();
    });
  }

  const resetBtn = dialog.querySelector('#fed-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const overrides = loadFamilyOverrides();
      delete overrides[fam.groupName];
      saveFamilyOverrides(overrides);
      applyFamilyOverridesToData();
      dialog.remove();
      renderFamiliesList();
      runQuery();
    });
  }
}

// ── Column Visibility ──

const COL_VIS_KEY = 'bt-sig-col-visibility';

function loadColVisibility() {
  try { return JSON.parse(localStorage.getItem(COL_VIS_KEY) || '{}'); } catch { return {}; }
}

function saveColVisibility(state) {
  localStorage.setItem(COL_VIS_KEY, JSON.stringify(state));
}

function initColVisibility() {
  const toggle = document.getElementById('col-vis-toggle');
  const menu = document.getElementById('col-vis-menu');

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  // Close on click-outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#col-vis-bar')) {
      menu.classList.add('hidden');
    }
  });
}

/**
 * Called after any table render. Reads headers from the rendered table,
 * builds the checkbox menu, and applies stored visibility.
 */
function updateColVisibility() {
  const bar = document.getElementById('col-vis-bar');
  const menu = document.getElementById('col-vis-menu');
  const table = document.querySelector('#view-container .data-table');

  if (!table) {
    bar.classList.add('hidden');
    return;
  }

  const headers = table.querySelectorAll('thead th');
  if (headers.length === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  const state = loadColVisibility();

  menu.innerHTML = '';
  headers.forEach((th, idx) => {
    const name = th.textContent.trim();
    if (!name) return;

    // Chassis column (index 0) is always visible
    const isLocked = idx === 0;
    const isVisible = isLocked || (state[name] !== undefined ? state[name] !== false : !isDefaultHidden(name));

    const label = document.createElement('label');
    label.className = 'col-vis-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isVisible;
    cb.disabled = isLocked;
    cb.dataset.colIdx = idx;
    cb.dataset.colName = name;

    cb.addEventListener('change', () => {
      const s = loadColVisibility();
      s[name] = cb.checked;
      saveColVisibility(s);
      applyColVisibility();
    });

    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + name));
    menu.appendChild(label);
  });

  applyColVisibility();
}

function isDefaultHidden(name) {
  const isSigCol = name.endsWith(' Sig');
  const isWeightCol = !isSigCol && DATA?.factions?.[name];
  const isSpread = name === 'Spread';
  return isWeightCol || isSpread;
}

function applyColVisibility() {
  const table = document.querySelector('#view-container .data-table');
  if (!table) return;

  const state = loadColVisibility();
  const headers = table.querySelectorAll('thead th');

  // Pre-compute visibility array for all columns
  const colVisible = [];
  headers.forEach((th, idx) => {
    const name = th.textContent.trim();
    const isLocked = idx === 0;
    const visible = isLocked || (state[name] !== undefined ? state[name] !== false : !isDefaultHidden(name));
    colVisible.push(visible);
    th.style.display = visible ? '' : 'none';
  });

  // Single pass over rows (instead of one querySelectorAll per column)
  const rows = table.querySelectorAll('tbody tr');
  for (const tr of rows) {
    const cells = tr.children;
    for (let idx = 0; idx < cells.length && idx < colVisible.length; idx++) {
      cells[idx].style.display = colVisible[idx] ? '' : 'none';
    }
  }
}

// ── Quick Filter Insert ──

function initQuickFilter() {
  const qfInput = document.getElementById('quick-filter-input');
  const qfClear = document.getElementById('qf-clear');
  const qfInsert = document.getElementById('qf-insert');
  const qfSuggestBox = document.getElementById('qf-suggest-box');
  let qfSuggestIndex = -1;

  // Known field names that take = values (not sort, not numeric-operator fields used bare)
  const VALUE_FIELDS = new Set(['faction', 'chassis', 'class', 'type', 'tech', 'year', 'era', 'rating', 'family', 'industrial', 'mode']);
  const OPERATOR_FIELDS = new Set(['spread', 'sig', 'signature', 'dr', 'distinctiveness', 'weight', 'tons', 'tonnage']);

  function normalizeFilterText(raw) {
    // "sort by ..." → pass through
    if (/^\s*sort\s+by\s+/i.test(raw)) return raw;

    // "field value" with no operator → "field=value"
    // Match: known field name, whitespace, then a value (no =, >, <, ! present)
    const match = raw.match(/^(\w[\w-]*)\s+(.+)$/);
    if (match) {
      const field = match[1].toLowerCase();
      const value = match[2].trim();
      if (VALUE_FIELDS.has(field)) {
        return field + '=' + value;
      }
      if (OPERATOR_FIELDS.has(field)) {
        // If value starts with an operator, join directly: "spread >3" → "spread>3"
        if (/^[><=!]/.test(value)) return field + value;
        // If value is just a number, assume >: "spread 3" → "spread>3"
        if (/^\d/.test(value)) return field + '>' + value;
        return raw; // don't know what to do, pass through
      }
      // Check faction-prefixed fields: "dc-sig 3" → "dc-sig>3", "dc-weight 5" → "dc-weight>5"
      const prefixMatch = field.match(/^([a-z]+)-(sig|signature|pref|preference|weight)$/);
      if (prefixMatch) {
        if (/^[><=!]/.test(value)) return field + value;
        if (/^\d/.test(value)) return field + '>' + value;
      }
    }
    return raw;
  }

  function insertFilter() {
    const text = normalizeFilterText(qfInput.value.trim());
    if (!text) return;
    const bar = document.getElementById('query-bar');
    const current = bar.value.trim();
    // Insert before any trailing sort clause so "sort by ..." stays last
    const sortMatch = current.match(/^(.*?)(\s+sort\s+by\s+.+)$/i);
    if (sortMatch) {
      bar.value = sortMatch[1].trim() + ' ' + text + sortMatch[2];
    } else {
      bar.value = current ? current + ' ' + text : text;
    }
    qfInput.value = '';
    qfSuggestBox.classList.add('hidden');
    qfSuggestIndex = -1;
    document.getElementById('reset-btn').classList.toggle('hidden', !bar.value.trim());
    runQuery();
    qfInput.focus();
  }

  qfInsert.addEventListener('click', insertFilter);

  qfClear.addEventListener('click', () => {
    qfInput.value = '';
    qfSuggestBox.classList.add('hidden');
    qfSuggestIndex = -1;
    qfInput.focus();
  });

  // Autocomplete — reuse getSuggestions
  let qfTimeout = null;
  qfInput.addEventListener('input', () => {
    clearTimeout(qfTimeout);
    qfTimeout = setTimeout(() => {
      const suggestions = getSuggestions(qfInput.value, qfInput.selectionStart);
      renderQfSuggestions(suggestions);
    }, 150);
  });

  qfInput.addEventListener('keydown', (e) => {
    const items = qfSuggestBox.querySelectorAll('.suggest-item');

    if (e.key === 'Enter') {
      if (qfSuggestIndex >= 0 && items[qfSuggestIndex]) {
        e.preventDefault();
        applyQfSuggestion(items[qfSuggestIndex].dataset.text);
      } else {
        e.preventDefault();
        insertFilter();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      qfSuggestIndex = Math.min(qfSuggestIndex + 1, items.length - 1);
      updateQfHighlight(items);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      qfSuggestIndex = Math.max(qfSuggestIndex - 1, -1);
      updateQfHighlight(items);
      return;
    }

    if (e.key === 'Tab' && items.length > 0) {
      e.preventDefault();
      const idx = qfSuggestIndex >= 0 ? qfSuggestIndex : 0;
      if (items[idx]) applyQfSuggestion(items[idx].dataset.text);
      return;
    }

    if (e.key === 'Escape') {
      qfSuggestBox.classList.add('hidden');
      qfSuggestIndex = -1;
    }
  });

  function renderQfSuggestions(suggestions) {
    qfSuggestIndex = -1;
    if (suggestions.length === 0) {
      qfSuggestBox.classList.add('hidden');
      return;
    }
    qfSuggestBox.innerHTML = '';
    for (const s of suggestions) {
      const div = document.createElement('div');
      div.className = 'suggest-item';
      div.dataset.text = s.text;
      div.innerHTML = `${escHtml(s.text)}${s.hint ? `<span class="hint">${escHtml(s.hint)}</span>` : ''}`;
      div.addEventListener('click', () => applyQfSuggestion(s.text));
      qfSuggestBox.appendChild(div);
    }
    qfSuggestBox.classList.remove('hidden');
  }

  function applyQfSuggestion(text) {
    const value = qfInput.value;
    const cursor = qfInput.selectionStart;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);

    const lastSpace = before.lastIndexOf(' ');
    const lastEq = Math.max(before.lastIndexOf('='), before.lastIndexOf('('));
    const replaceFrom = Math.max(lastSpace, lastEq) + 1;

    qfInput.value = before.slice(0, replaceFrom) + text + (after.startsWith(' ') ? after : ' ' + after);
    qfInput.selectionStart = qfInput.selectionEnd = replaceFrom + text.length + (text.endsWith('=') || text.endsWith(' ') ? 0 : 1);
    qfInput.focus();
    qfSuggestBox.classList.add('hidden');
    qfSuggestIndex = -1;
  }

  function updateQfHighlight(items) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === qfSuggestIndex);
    });
  }
}

let _builtInFamilyNames = null; // set once at init

function applyFamilyOverridesToData() {
  if (!DATA) return;
  const overrides = loadFamilyOverrides();

  // Snapshot built-in family names on first call
  if (!_builtInFamilyNames) {
    _builtInFamilyNames = new Set(DATA.families.map(f => f.groupName));
  }

  // Remove custom families no longer in overrides (built-ins always kept)
  DATA.families = DATA.families.filter(fam =>
    _builtInFamilyNames.has(fam.groupName) || overrides[fam.groupName]
  );

  // Update DATA.families in place from defaults + overrides
  for (const fam of DATA.families) {
    const ov = overrides[fam.groupName];
    if (ov) {
      if (ov.hasOwnProperty('enabled')) fam.enabled = ov.enabled;
      if (ov.chassis) fam.chassis = ov.chassis;
    }
  }

  // Add custom families
  for (const [name, ov] of Object.entries(overrides)) {
    if (!DATA.families.some(f => f.groupName === name)) {
      DATA.families.push({
        groupName: name,
        chassis: ov.chassis || [],
        enabled: ov.enabled !== false
      });
    }
  }
}

// Update hash on query
const originalRunQuery = runQuery;
runQuery = function() {
  originalRunQuery();
  const bar = document.getElementById('query-bar');
  if (bar.value.trim()) {
    history.replaceState(null, '', '#' + encodeURIComponent(bar.value.trim()));
  } else {
    history.replaceState(null, '', location.pathname);
  }
};

document.addEventListener('DOMContentLoaded', init);
