/* ── BattleTech Faction Signatures — Client App ── */

let DATA = null; // app-data.json

// ── Faction code aliases ──
const FACTION_ALIASES = {
  'dc': 'DC', 'draconis': 'DC', 'draconis combine': 'DC', 'kurita': 'DC',
  'fs': 'FS', 'fedsuns': 'FS', 'federated suns': 'FS', 'davion': 'FS',
  'fwl': 'FWL', 'free worlds': 'FWL', 'free worlds league': 'FWL', 'marik': 'FWL',
  'la': 'LA', 'lyran': 'LA', 'lyran commonwealth': 'LA', 'lyran alliance': 'LA', 'steiner': 'LA',
  'lc': 'LA', // Map LC to LA since they're the same faction in different eras
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

// ── Query Parser ──

function parseQuery(queryStr) {
  const result = {
    factions: [],
    chassis: [],
    class: null,
    spread: null,    // {op, val}
    span: null,
    avgPref: null,
    weight: null,
    sig: null,
    tons: null,
    factionPref: [],  // [{faction, op, val}]
    factionSig: [],   // [{faction, op, val}]
    year: null,
    era: null,
    family: null,     // 'on' | 'off'
    industrial: null,  // 'show' | 'hide'
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
      if (tokens.length >= 2 && (tokens[1].toLowerCase() === 'preference' || tokens[1].toLowerCase() === 'sig' || tokens[1].toLowerCase() === 'signature')) {
        const factionCode = resolveFaction(tokens[0]);
        const metric = tokens[1].toLowerCase() === 'preference' ? 'preference' : 'sig';
        if (factionCode) {
          field = factionCode + '-' + metric;
        } else {
          field = metric;
        }
        dir = (tokens[2] || 'desc').toLowerCase();
      } else {
        field = tokens[0].toLowerCase();
        // Handle faction-prefixed fields: fs-sig, dc-pref, dc-preference
        const prefixMatch = field.match(/^([a-z]+)-(sig|signature|pref|preference)$/);
        if (prefixMatch) {
          const fCode = resolveFaction(prefixMatch[1]);
          const metric = prefixMatch[2].startsWith('pref') ? 'preference' : 'sig';
          if (fCode) {
            field = fCode + '-' + metric;
          }
        } else {
          field = field.replace('-', '');
          if (field === 'avgpref') field = 'avg-pref';
        }
        dir = (tokens[1] || 'desc').toLowerCase();
      }
      
      result.sort.push({ field, dir: dir === 'asc' ? 'asc' : 'desc' });
    }
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
        break;
      }
      case 'class':
        result.class = value.toLowerCase();
        break;
      case 'spread':
        result.spread = { op, val: parseFloat(value) };
        break;
      case 'span':
        result.span = { op, val: parseFloat(value) };
        break;
      case 'avg-pref':
      case 'avgpref':
        result.avgPref = { op, val: parseFloat(value) };
        break;
      case 'weight':
        result.weight = { op, val: parseFloat(value) };
        break;
      case 'sig':
      case 'signature':
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
      case 'mode':
        result.mode = value.toUpperCase();
        break;
      case 'tons':
      case 'tonnage':
        result.tons = { op, val: parseFloat(value) };
        break;
      default: {
        // Handle faction-prefixed filters: DC-pref>8, FS-sig>5, etc.
        const fpMatch = field.match(/^([a-z]+)-(pref|preference|sig|signature)$/);
        if (fpMatch) {
          const fCode = resolveFaction(fpMatch[1]);
          const metric = fpMatch[2].startsWith('pref') ? 'pref' : 'sig';
          if (fCode) {
            const entry = { faction: fCode, op, val: parseFloat(value) };
            if (metric === 'pref') result.factionPref.push(entry);
            else result.factionSig.push(entry);
          }
        }
        break;
      }
    }
  }

  // Handle bare NOT prefix
  // (for now, simple implementation)

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
    return DATA?.factionGroups?.GreatHouses || ['DC', 'FS', 'FWL', 'LA', 'CC'];
  }
  if (lower === 'clans') {
    return DATA?.factionGroups?.Clans || [];
  }
  if (lower === 'periphery') {
    return DATA?.factionGroups?.Periphery || [];
  }
  
  const resolved = resolveFaction(name);
  return resolved ? [resolved] : [];
}

function resolveChassis(name) {
  if (!name || !DATA) return name;
  const lower = name.toLowerCase().trim();
  
  // Check model prefix aliases
  const upper = name.toUpperCase();
  if (DATA.modelPrefixes[upper]) return DATA.modelPrefixes[upper];
  
  // Exact match
  if (DATA.chassis[name]) return name;
  
  // Case-insensitive match
  for (const ch of Object.keys(DATA.chassis)) {
    if (ch.toLowerCase() === lower) return ch;
  }
  
  // Partial match
  for (const ch of Object.keys(DATA.chassis)) {
    if (ch.toLowerCase().includes(lower)) return ch;
  }
  
  return name;
}

// ── Scoring Functions (all client-side) ──

function scopedPref(chassisWeights, scopedFactions) {
  const vals = scopedFactions.map(f => chassisWeights[f] || 0); // ZEROS INCLUDED
  const max = Math.max(...vals);
  if (max === 0) return null; // nobody has it at all
  const min = Math.min(...vals); // will be 0 if any faction doesn't field it
  if (max === min) return Object.fromEntries(scopedFactions.map(f => [f, 5]));
  const result = {};
  for (const f of scopedFactions) {
    const w = chassisWeights[f] || 0;
    result[f] = 1 + 9 * (w - min) / (max - min);
  }
  return result;
}

function computeSpread(weights, scopedFactions) {
  const vals = scopedFactions.map(f => weights[f] || 0);
  return Math.max(...vals) - Math.min(...vals);
}

function computeSpan(weights, scopedFactions) {
  return scopedFactions.filter(f => (weights[f] || 0) > 0).length;
}

function computeAvgPref(prefs, scopedFactions) {
  if (!prefs) return 0;
  const vals = scopedFactions.map(f => prefs[f] || 0).filter(v => v > 0);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Compute signature score per faction: weight × faction_share
 * 
 * faction_share = faction_weight / sum(all MUL-confirmed faction weights)
 * 
 * This is the faction's "effective claim" on this chassis — how heavily they
 * use it, adjusted for how exclusively they own it. Dimensionally weight.
 * 
 * Returns { factionCode: rawSigScore } for the requested factions.
 */
function computeSignature(weights, mulData, factions) {
  const result = {};
  
  // Total weight across all MUL-confirmed factions for this chassis
  const totalWeight = Object.keys(mulData).reduce((sum, f) => sum + (weights[f] || 0), 0);
  
  for (const f of factions) {
    const raw = (mulData[f] && weights[f]) ? weights[f] : 0;
    if (raw === 0 || totalWeight === 0) { result[f] = 0; continue; }
    result[f] = raw * (raw / totalWeight);
  }
  return result;
}

/**
 * Assign a tier (1–5) based on rank position within a sorted list.
 * Quintile bins: tier 5 = top 20%, tier 1 = bottom 20%.
 * rank is 0-indexed (0 = highest score).
 */
function assignTier(rank, total) {
  if (total <= 0) return 1;
  if (total === 1) return 5;
  const pct = rank / total;
  if (pct < 0.2) return 5;
  if (pct < 0.4) return 4;
  if (pct < 0.6) return 3;
  if (pct < 0.8) return 2;
  return 1;
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
  
  for (const fam of DATA.families) {
    if (!fam.enabled) continue; // skip disabled families
    for (const ch of fam.chassis) {
      if (!familyMembers[fam.groupName]) familyMembers[fam.groupName] = [];
      familyMembers[fam.groupName].push(ch);
    }
  }
  
  const processedFamilies = new Set();
  
  for (const [chassisName, data] of Object.entries(eraData)) {
    const famName = data.fam;
    
    if (famName && !processedFamilies.has(famName)) {
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
    } else if (!famName) {
      merged[chassisName] = data;
    }
    // Skip if already processed as part of a family
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
  let headerHTML = '<tr><th data-sort="name">Chassis</th><th data-sort="tonnage">Tons</th>';
  for (const f of scopedFactions) {
    headerHTML += `<th data-sort="${f}-preference" title="${getFactionFullName(f)}">${getFactionLabel(f)}</th>`;
  }
  if (hasSig) {
    for (const f of scopedFactions) {
      headerHTML += `<th data-sort="${f}-sig" title="${getFactionFullName(f)} Signature">${getFactionLabel(f)} Sig</th>`;
    }
  }
  headerHTML += '<th data-sort="spread">Spread</th><th data-sort="span">Span</th><th data-sort="avg-pref">Avg</th></tr>';
  thead.innerHTML = headerHTML;
  table.appendChild(thead);
  
  // Body
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    let html = `<td class="chassis-name">${escHtml(row.name)}</td>`;
    html += `<td class="tonnage-col">${formatTonnage(row.meta)} <span class="class-badge class-${(row.meta.class || '').split('/')[0]}">${formatClass(row.meta)}</span></td>`;
    
    for (const f of scopedFactions) {
      const pref = row.prefs?.[f];
      const w = row.weights[f] || 0;
      const sig = row.sig?.[f] || 0;
      const cls = w > 0 ? heatClass(pref) : 'no-data';
      
      if (w > 0 && pref) {
        html += `<td class="faction-cell ${cls}" data-chassis="${escAttr(row.name)}" data-faction="${f}">`;
        html += `<span class="pref-value">${pref.toFixed(1)}</span>`;
        if (hasSig && sig > 0) {
          const tier = row.sig?.[f + '_tier'] || 0;
          html += `<span class="sig-value">T${tier}</span>`;
        }
        html += `<span class="weight-value">w:${w}</span>`;
        html += '</td>';
      } else {
        html += '<td class="faction-cell no-data">—</td>';
      }
    }
    
    if (hasSig) {
      for (const f of scopedFactions) {
        const sigVal = row.sig?.[f] || 0;
        const sigTier = row.sig?.[f + '_tier'] || 0;
        html += `<td class="stat-col">${sigVal > 0 ? `T${sigTier} <span class="sig-raw">(${sigVal.toFixed(1)})</span>` : '—'}</td>`;
      }
    }
    html += `<td class="stat-col">${row.spread.toFixed(1)}</td>`;
    html += `<td class="stat-col">${row.span}</td>`;
    html += `<td class="stat-col">${row.avgPref.toFixed(1)}</td>`;
    
    tr.innerHTML = html;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
  
  // Click handler for faction cells
  table.addEventListener('click', handleCellClick);
  
  // Sortable headers
  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th || !th.dataset.sort) return;
    handleHeaderSort(th, rows, scopedFactions, eraYear, query);
  });
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
  thead.innerHTML = '<tr><th>Chassis</th><th>Tons</th><th>Class</th><th>Weight</th><th>Usage</th></tr>';
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const w = row.weights[faction] || 0;
    if (w <= 0) continue;
    const pct = maxWeight > 0 ? (w / maxWeight * 100) : 0;
    
    const tr = document.createElement('tr');
    tr.className = 'faction-roster-row';
    tr.innerHTML = `
      <td class="chassis-name" style="cursor:pointer" data-chassis="${escAttr(row.name)}" data-faction="${faction}">${escHtml(row.name)}</td>
      <td class="tonnage-col">${formatTonnage(row.meta)}</td>
      <td><span class="class-badge class-${(row.meta.class || '').split('/')[0]}">${formatClass(row.meta)}</span></td>
      <td class="stat-col">${w}</td>
      <td><div class="weight-bar-container"><div class="weight-bar" style="width:${pct}%"></div></div></td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
  
  table.addEventListener('click', handleCellClick);
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
    
    // Get all factions sorted by weight
    const factionWeights = Object.entries(row.weights)
      .filter(([f, w]) => w > 0)
      .sort((a, b) => b[1] - a[1]);
    
    const maxW = factionWeights.length > 0 ? factionWeights[0][1] : 1;
    
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Faction</th><th>Weight</th><th>Usage</th></tr></thead>';
    
    const tbody = document.createElement('tbody');
    for (const [f, w] of factionWeights) {
      const pct = (w / maxW * 100);
      const fName = getFactionFullName(f);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="cursor:pointer" data-chassis="${escAttr(row.name)}" data-faction="${f}"><strong>${escHtml(f)}</strong> <span style="color:var(--text-dim)">${escHtml(fName)}</span></td>
        <td class="stat-col">${w}</td>
        <td><div class="weight-bar-container"><div class="weight-bar" style="width:${pct}%"></div></div></td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    container.appendChild(section);
    
    table.addEventListener('click', handleCellClick);
  }
}

function renderMechDetail(rows, scopedFactions, eraYear) {
  // Basically faction comparison but for specific chassis
  renderFactionComparison(rows, scopedFactions, eraYear);
}

// ── Variant Drill-down ──

function showVariants(chassisName, faction, eraYear) {
  const overlay = document.getElementById('variant-overlay');
  const title = document.getElementById('variant-title');
  const content = document.getElementById('variant-content');
  
  // Find the chassis data
  const eraData = DATA.eraData[String(eraYear)];
  if (!eraData) return;
  
  // Check both direct and family-merged names
  let variants = null;
  let sourceName = chassisName;
  
  // Check direct
  if (eraData[chassisName]?.v) {
    variants = eraData[chassisName].v;
  } else {
    // Check family members
    for (const [cn, data] of Object.entries(eraData)) {
      if (cn === chassisName || (data.fam && data.fam.replace(/ Family$/, '') === chassisName)) {
        if (data.v) {
          variants = { ...(variants || {}), ...data.v };
          sourceName = cn;
        }
      }
    }
    // Also check if the chassis is a family display name
    for (const fam of DATA.families) {
      if (fam.groupName.replace(/ Family$/, '') === chassisName) {
        for (const member of fam.chassis) {
          if (eraData[member]?.v) {
            variants = { ...(variants || {}), ...eraData[member].v };
          }
        }
        break;
      }
    }
  }
  
  if (!variants) {
    title.textContent = `${chassisName} — ${getFactionFullName(faction)}`;
    content.innerHTML = '<p style="color:var(--text-dim)">No variant data available.</p>';
    overlay.classList.remove('hidden');
    return;
  }
  
  // Calculate variant percentages for this faction
  const variantWeights = {};
  let total = 0;
  for (const [varName, varFactions] of Object.entries(variants)) {
    const w = varFactions[faction] || 0;
    if (w > 0) {
      variantWeights[varName] = w;
      total += w;
    }
  }
  
  if (total === 0) {
    title.textContent = `${chassisName} — ${getFactionFullName(faction)}`;
    content.innerHTML = '<p style="color:var(--text-dim)">No variant data for this faction.</p>';
    overlay.classList.remove('hidden');
    return;
  }
  
  // Sort by weight desc
  const sorted = Object.entries(variantWeights).sort((a, b) => b[1] - a[1]);
  
  title.textContent = `${chassisName} — ${getFactionFullName(faction)}`;
  
  let html = '';
  for (const [varName, w] of sorted) {
    const pct = (w / total * 100).toFixed(1);
    html += `
      <div class="variant-row">
        <span class="variant-name">${escHtml(varName)}</span>
        <div class="variant-bar-container">
          <div class="variant-bar" style="width:${pct}%"></div>
        </div>
        <span class="variant-pct">${pct}%</span>
      </div>
    `;
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

const FIELD_NAMES = ['faction', 'chassis', 'class', 'spread', 'span', 'avg-pref', 'sig', 'signature', 'weight', 'tons', 'tonnage', 'year', 'era', 'family', 'industrial', 'mode', 'sort'];

function getSuggestions(text, cursorPos) {
  if (!DATA) return [];
  
  const beforeCursor = text.slice(0, cursorPos);
  const suggestions = [];
  
  // Check what we're completing
  const lastToken = beforeCursor.split(/\s+/).pop() || '';
  
  // Field name completion
  if (!lastToken.includes('=') && !lastToken.includes('>') && !lastToken.includes('<')) {
    const lower = lastToken.toLowerCase();
    for (const field of FIELD_NAMES) {
      if (field.startsWith(lower) && field !== lower) {
        suggestions.push({ text: field + '=', hint: 'field' });
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
    
    switch (field.toLowerCase()) {
      case 'faction': {
        // Suggest faction codes and names
        const items = [
          { text: 'GreatHouses', hint: 'DC, FS, FWL, LA, CC' },
          { text: 'Clans', hint: 'All Clan factions' },
          { text: 'Periphery', hint: 'TC, MH, OA, MC' },
        ];
        for (const [code, info] of Object.entries(DATA.factions)) {
          items.push({ text: code, hint: info.name });
        }
        return items.filter(i => i.text.toLowerCase().startsWith(lower) || i.hint.toLowerCase().includes(lower)).slice(0, 12);
      }
      case 'chassis': {
        // Suggest from latest era for broadest coverage
        const latestEra = DATA.eras[DATA.eras.length - 1]?.year || 3160;
        const chassisData = getChassisForEra(String(latestEra), 'on');
        const names = Object.keys(chassisData).sort();
        return names.filter(n => n.toLowerCase().includes(lower))
          .slice(0, 12)
          .map(n => {
            const members = chassisData[n]?._members;
            const hint = members ? members.join(', ') : (DATA.chassis[n]?.class || '');
            return { text: n, hint };
          });
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
      case 'mode':
        return [{ text: 'A', hint: 'MegaMek Only' }, { text: 'B', hint: 'MegaMek × MUL' }];
      case 'family':
        return [{ text: 'on', hint: 'Merge families' }, { text: 'off', hint: 'Individual chassis' }];
      case 'industrial':
        return [{ text: 'show', hint: '' }, { text: 'hide', hint: '' }];
    }
  }
  
  return suggestions;
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
  if (parsed.class) chips.push({ label: 'class=' + parsed.class, field: 'class' });
  if (parsed.spread) chips.push({ label: `spread${parsed.spread.op}${parsed.spread.val}`, field: 'spread' });
  if (parsed.span) chips.push({ label: `span${parsed.span.op}${parsed.span.val}`, field: 'span' });
  if (parsed.avgPref) chips.push({ label: `avg-pref${parsed.avgPref.op}${parsed.avgPref.val}`, field: 'avg-pref' });
  if (parsed.weight) chips.push({ label: `weight${parsed.weight.op}${parsed.weight.val}`, field: 'weight' });
  if (parsed.sig) chips.push({ label: `sig${parsed.sig.op}${parsed.sig.val}`, field: 'sig' });
  if (parsed.tons) chips.push({ label: `tons${parsed.tons.op}${parsed.tons.val}`, field: 'tons' });
  for (const fp of parsed.factionPref) {
    chips.push({ label: `${fp.faction}-pref${fp.op}${fp.val}`, field: `${fp.faction}-pref` });
  }
  for (const fs of parsed.factionSig) {
    chips.push({ label: `${fs.faction}-sig${fs.op}${fs.val}`, field: `${fs.faction}-sig` });
  }
  if (parsed.year) chips.push({ label: 'year=' + parsed.year, field: 'year' });
  if (parsed.era) chips.push({ label: 'era=' + parsed.era, field: 'era' });
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
  
  // Simple removal - strip the field expression
  const patterns = {
    'faction': /\bfaction\s*=\s*(\([^)]+\)|"[^"]+"|[^\s]+)/gi,
    'chassis': /\bchassis\s*=\s*(\([^)]+\)|"[^"]+"|[^\s]+)/gi,
    'class': /\bclass\s*=\s*\w+/gi,
    'spread': /\bspread\s*[><=!]+\s*[\d.]+/gi,
    'span': /\bspan\s*[><=!]+\s*[\d.]+/gi,
    'avg-pref': /\bavg-pref\s*[><=!]+\s*[\d.]+/gi,
    'weight': /\bweight\s*[><=!]+\s*[\d.]+/gi,
    'year': /\byear\s*=\s*\d+/gi,
    'era': /\bera\s*=\s*\w+/gi,
    'mode': /\bmode\s*=\s*\w+/gi,
    'sort': /\bsort\s+by\s+.+$/gi,
  };
  
  if (patterns[field]) {
    q = q.replace(patterns[field], '').replace(/\s+/g, ' ').trim();
    bar.value = q;
    runQuery();
  }
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

function runQuery() {
  const bar = document.getElementById('query-bar');
  const queryStr = bar.value.trim();
  
  const landing = document.getElementById('landing');
  const viewContainer = document.getElementById('view-container');
  const statusText = document.getElementById('status-text');
  const modeIndicator = document.getElementById('mode-indicator');
  
  if (!queryStr) {
    landing.style.display = '';
    viewContainer.classList.add('hidden');
    document.getElementById('filter-chips').innerHTML = '';
    statusText.textContent = '';
    return;
  }
  
  landing.style.display = 'none';
  
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
  
  const familyMode = parsed.family || 'on';
  const modeB = parsed.mode !== 'A';
  const hideIndustrial = parsed.industrial === 'hide';
  
  const chassisData = getChassisForEra(String(eraYear), familyMode);
  const scopedFactions = parsed.factions;
  const chassisFilter = parsed.chassis.map(c => resolveChassis(c));
  
  // Build rows
  const rows = [];
  for (const [chassisName, data] of Object.entries(chassisData)) {
    // Chassis filter
    if (chassisFilter.length > 0) {
      const matches = chassisFilter.some(cf => {
        const lower = cf.toLowerCase();
        return chassisName.toLowerCase() === lower || chassisName.toLowerCase().includes(lower);
      });
      if (!matches) continue;
    }
    
    const meta = data._meta || DATA.chassis[chassisName] || {};
    
    if (parsed.class) {
      const classLower = parsed.class.toLowerCase();
      if (meta.class && !meta.class.toLowerCase().split('/').some(c => c.trim() === classLower)) continue;
      if (!meta.class) continue;
    }
    
    if (hideIndustrial && meta.industrial) continue;
    if (parsed.year && meta.intro && meta.intro > parsed.year) continue;
    if (parsed.tons) {
      // For families with a tonnage range, use the range for filtering
      const tMin = meta.tons;
      const tMax = meta.tonsMax || meta.tons;
      if (tMin != null) {
        // Range-aware: a family matches if any tonnage in [min,max] satisfies the filter
        const op = parsed.tons.op;
        const val = parsed.tons.val;
        const passesMin = compareOp(tMin, op, val);
        const passesMax = compareOp(tMax, op, val);
        if (!passesMin && !passesMax) continue;
      }
    }
    
    let weights = { ...data.w };
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
    const prefs = scopedFactions.length > 1 ? scopedPref(weights, scopedFactions) : null;
    const spread = scopedFactions.length > 1 ? computeSpread(weights, scopedFactions) : 0;
    const span = computeSpan(weights, activeFactions);
    const avgPref = prefs ? computeAvgPref(prefs, scopedFactions) : 0;
    
    // Filters
    if (parsed.spread && !compareOp(spread, parsed.spread.op, parsed.spread.val)) continue;
    if (parsed.span && !compareOp(span, parsed.span.op, parsed.span.val)) continue;
    if (parsed.avgPref && !compareOp(avgPref, parsed.avgPref.op, parsed.avgPref.val)) continue;
    if (parsed.weight) {
      const checkFactions = scopedFactions.length > 0 ? scopedFactions : Object.keys(weights);
      const anyPass = checkFactions.some(f => compareOp(weights[f] || 0, parsed.weight.op, parsed.weight.val));
      if (!anyPass) continue;
    }
    
    // Faction-specific preference filter
    if (parsed.factionPref.length > 0 && prefs) {
      if (!parsed.factionPref.every(fp => compareOp(prefs[fp.faction] || 0, fp.op, fp.val))) continue;
    }
    
    const hasAnyWeight = (scopedFactions.length > 0 ? scopedFactions : Object.keys(weights)).some(f => (weights[f] || 0) > 0);
    if (!hasAnyWeight) continue;
    
    rows.push({
      name: chassisName,
      meta,
      weights,
      prefs,
      spread,
      span,
      avgPref,
      sig: null,
      variants: data.v,
      mul: data.mul,
      family: data.fam,
      members: data._members
    });
  }
  
  // Compute global signature scores (weight × share)
  if (scopedFactions.length > 0) {
    for (const row of rows) {
      row.sig = computeSignature(row.weights, row.mul || {}, scopedFactions);
    }
    
    // Compute tiers per faction (quintile bins across all rows)
    for (const f of scopedFactions) {
      const sigValues = rows.map(r => r.sig?.[f] || 0).filter(v => v > 0);
      sigValues.sort((a, b) => b - a);
      const sigRankMap = new Map(sigValues.map((v, i) => [v, i]));
      const total = sigValues.length;
      for (const row of rows) {
        const v = row.sig?.[f] || 0;
        if (v > 0 && row.sig) {
          const rank = sigRankMap.get(v) ?? total;
          row.sig[f + '_tier'] = assignTier(rank, total);
        }
      }
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
      } else if (field === 'avgpref' || field === 'avg-pref') {
        va = a.avgPref; vb = b.avgPref;
      } else if (field === 'weight') {
        va = Math.max(0, ...Object.values(a.weights));
        vb = Math.max(0, ...Object.values(b.weights));
      } else if (field === 'name' || field === 'chassis') {
        const cmp = dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        if (cmp !== 0) return cmp;
        continue;
      } else if (field === 'tonnage' || field === 'tons') {
        va = a.meta.tons || 0; vb = b.meta.tons || 0;
      } else if (field.endsWith('-preference')) {
        const fCode = field.replace('-preference', '');
        va = a.prefs?.[fCode] || 0;
        vb = b.prefs?.[fCode] || 0;
      } else if (field.endsWith('-sig') || field.endsWith('-signature')) {
        const fCode = field.replace(/-sig(nature)?$/, '').toUpperCase();
        va = a.sig?.[fCode] || 0;
        vb = b.sig?.[fCode] || 0;
      } else if (field === 'sig' || field === 'signature') {
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
    const resp = await fetch('app-data.json?v=' + Date.now());
    DATA = await resp.json();
    applyFamilyOverridesToData(); // apply user's saved family preferences
    console.log('Loaded app-data.json:', Object.keys(DATA.eraData).length, 'eras,', Object.keys(DATA.chassis).length, 'chassis');
    
    // Show deploy timestamp
    if (DATA._meta?.generated) {
      const d = new Date(DATA._meta.generated);
      document.getElementById('deploy-stamp').textContent =
        'v' + d.toISOString().slice(0, 10).replace(/-/g, '') + '.' +
        d.toISOString().slice(11, 16).replace(':', '') +
        ' • ' + DATA._meta.description;
    }
  } catch (err) {
    console.error('Failed to load app-data.json:', err);
    document.getElementById('status-text').textContent = 'Error loading data!';
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
    const current = bar.value.replace(/\bfamily=(on|off)\b/g, '').trim();
    if (!globalToggle.checked) {
      bar.value = (current + ' family=off').trim();
    } else {
      bar.value = current.replace(/\s+/g, ' ').trim();
    }
    runQuery();
    renderFamiliesList();
  });

  // Data mode radio
  document.querySelectorAll('input[name="data-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const bar = document.getElementById('query-bar');
      const current = bar.value.replace(/\bmode=[AB]\b/g, '').trim();
      if (radio.value === 'A') {
        bar.value = (current + ' mode=A').trim();
      } else {
        bar.value = current.replace(/\s+/g, ' ').trim();
      }
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
        <span class="family-name">${displayName}${fam.isOverridden ? ' ✎' : ''}</span>
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

function applyFamilyOverridesToData() {
  if (!DATA) return;
  const overrides = loadFamilyOverrides();

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
