#!/usr/bin/env python3
"""
Parse Xotl RAT PDF rarity tables (pages 77-99) and build a complete xotl-rarity.json
with all faction availability data.

The rarity tables are organized as multi-column layouts:
- Page header: "Mechs – <Faction>: <Era>"
- Columns: "Mech Name CODE-TON Av Av Av..." where availability numbers follow
- Sometimes split across 2 pages (overflow)

We need to extract: chassis name, variant code, tonnage, and per-faction availability.
"""

import pdfplumber
import json
import re
import sys

PDF_PATH = 'data/xotl-source/xotl-rat-10.64.pdf'

# Map page numbers to faction+era labels
# Based on our scan of the PDF
FACTION_PAGES = {
    # Page 0-indexed
    76: {'faction': 'Star League 2750', 'era': '2750', 'type': 'Regular+Royal'},
    77: {'faction': 'Capellan Confederation (House Liao)', 'era': '3028-3039', 'type': 'rarity'},
    78: {'faction': 'Capellan Confederation (House Liao)', 'era': '3050-3057', 'type': 'rarity'},
    79: {'faction': 'Capellan Confederation (House Liao)', 'era': '3050-3057', 'type': 'rarity_overflow'},
    80: {'faction': 'Draconis Combine (House Kurita)', 'era': '3028-3039', 'type': 'rarity'},
    81: {'faction': 'Draconis Combine (House Kurita)', 'era': '3050-3057', 'type': 'rarity'},
    82: {'faction': 'Draconis Combine (House Kurita)', 'era': '3050-3057', 'type': 'rarity_overflow'},
    83: {'faction': 'Federated Suns (House Davion)', 'era': '3028-3039', 'type': 'rarity'},
    84: {'faction': 'Federated Suns (House Davion)', 'era': '3050-3057', 'type': 'rarity'},
    85: {'faction': 'Federated Suns (House Davion)', 'era': '3050-3057', 'type': 'rarity_overflow'},
    86: {'faction': 'Free Rasalhague Republic', 'era': '3039-3050', 'type': 'rarity'},
    87: {'faction': 'Free Worlds League (House Marik)', 'era': '3028-3039', 'type': 'rarity'},
    88: {'faction': 'Free Worlds League (House Marik)', 'era': '3050-3057', 'type': 'rarity'},
    89: {'faction': 'Free Worlds League (House Marik)', 'era': '3050-3057', 'type': 'rarity_overflow'},
    90: {'faction': 'Lyran Commonwealth (House Steiner)', 'era': '3028-3039', 'type': 'rarity'},
    91: {'faction': 'Lyran Commonwealth (House Steiner)', 'era': '3050', 'type': 'rarity'},
    92: {'faction': 'Lyran Commonwealth (House Steiner)', 'era': '3057', 'type': 'rarity'},
    93: {'faction': 'Lyran Commonwealth (House Steiner)', 'era': '3057', 'type': 'rarity_overflow'},
    94: {'faction': 'St. Ives Compact', 'era': '3039-3050', 'type': 'rarity'},
    95: {'faction': 'Mercenary / Periphery General', 'era': '3028-3050', 'type': 'rarity'},
    96: {'faction': 'Magistracy Of Canopus', 'era': '3028-3050', 'type': 'rarity'},
    97: {'faction': 'Outworlds Alliance', 'era': '3028-3050', 'type': 'rarity'},
    98: {'faction': 'Taurian Concordat', 'era': '3028-3050', 'type': 'rarity'},
}

def parse_rarity_page(text, faction, era):
    """Parse a rarity table page and extract mech entries with availability values."""
    entries = []
    lines = text.split('\n')

    for line in lines:
        if not line.strip():
            continue
        if line.startswith('FACTION LISTS'):
            continue
        if line.startswith('Mechs –') or line.startswith('Mechs -'):
            continue
        if line.startswith('Av '):
            continue
        if line.startswith('Mech '):
            continue
        if line.startswith('('):
            continue
        if line.strip().isdigit():
            continue  # Page number

        # Try to find all mechs on this line using two patterns:
        # Pattern 1: Name CODE [TON] AvNumbers (Great House tables)
        # Pattern 2: Name CODE AvNumbers (Merc/Periphery tables - no tonnage)

        # First try with tonnage brackets
        ton_matches = list(re.finditer(r'\[(\d+)\]', line))
        if ton_matches:
            for i, ton_match in enumerate(ton_matches):
                ton = int(ton_match.group(1))
                ton_pos = ton_match.start()

                before_ton = line[:ton_pos].rstrip()
                code_match = re.search(r'([A-Z]{2,}[\-\d][A-Z0-9\-]*)\s*$', before_ton)
                if not code_match:
                    continue
                code = code_match.group(1)
                code_pos = code_match.start()

                before_code = line[:code_pos].rstrip()
                if i > 0:
                    prev_ton_end = ton_matches[i-1].end()
                    after_prev = line[prev_ton_end:code_pos].strip()
                    name_match = re.search(r'([\d\s]+)\s+(.+)', after_prev)
                    if name_match:
                        name = name_match.group(2).strip()
                    else:
                        name = after_prev.strip()
                else:
                    name = before_code.strip()

                name = name.strip()
                if not name or name[0].islower():
                    continue

                after_ton = line[ton_match.end():]
                if i + 1 < len(ton_matches):
                    next_ton_start = ton_matches[i+1].start() - ton_match.end() - 1
                    after_ton = after_ton[:next_ton_start]

                av_numbers = re.findall(r'\d+', after_ton)
                av_numbers = [int(n) for n in av_numbers]

                if not av_numbers:
                    continue

                entries.append({
                    'name': name,
                    'variant': code,
                    'tonnage': ton,
                    'faction': faction,
                    'era': era,
                    'availability': av_numbers,
                })
        else:
            # No tonnage brackets — Merc/Periphery format
            # Lines look like: "Archer ARC-2R 8 8 Hunchback HBK-4J 1 1 Valkyrie VLK-QA 3 3"
            # Each mech: Name CODE AvNumbers (no brackets)
            # Split by variant code pattern

            # Find all variant code positions
            code_matches = list(re.finditer(r'\s([A-Z]{3,}[\-\d][A-Z0-9\-]*)\s', ' ' + line + ' '))
            if not code_matches:
                continue

            for i, cm in enumerate(code_matches):
                code = cm.group(1)
                code_start = cm.start(1) - 1  # adjust for leading space we added
                code_end = cm.end(1) - 1

                # Get name before code
                if i > 0:
                    prev_end = code_matches[i-1].end(1) - 1
                    between = line[prev_end:code_start].strip()
                    # Name is after the last group of numbers from previous mech
                    # The between text is: "AvNumbers Name"
                    name_match = re.search(r'[\d\s]+\s+(.+)', between)
                    if name_match:
                        name = name_match.group(1).strip()
                    else:
                        name = between.strip()
                else:
                    name = line[:code_start].strip()

                # Get availability numbers after code
                if i + 1 < len(code_matches):
                    next_start = code_matches[i+1].start(1) - 1
                    after = line[code_end:next_start].strip()
                    # Remove the name part at the end
                    # after = "8 8 Hunchback" -> we want just "8 8"
                    name_in_after = re.search(r'[\d\s]+\s+([A-Z].*)', after)
                    if name_in_after:
                        av_str = after[:name_in_after.start(1)].strip()
                    else:
                        av_str = after
                else:
                    av_str = line[code_end:].strip()

                av_numbers = re.findall(r'\d+', av_str)
                av_numbers = [int(n) for n in av_numbers]

                if not av_numbers:
                    continue

                name = name.strip()
                if not name or name[0].islower():
                    continue

                entries.append({
                    'name': name,
                    'variant': code,
                    'tonnage': None,
                    'faction': faction,
                    'era': era,
                    'availability': av_numbers,
                })

    return entries

def get_era_columns(faction, era):
    """Return the era column keys for a given faction+era section."""
    if era == '2750':
        return ['Regular', 'Royal']
    elif era == '3028-3039':
        return ['3028', '3039']
    elif era == '3050-3057':
        # Great Houses have A/B and C/D/F columns for 3057
        # Periphery factions only have 3028/3039 columns
        if 'Mercenary' in faction or 'Magistracy' in faction or 'Outworlds' in faction or 'Taurian' in faction:
            return ['3028', '3039']
        return ['3050', 'A/B (3057)', 'C/D/F (3057)']
    elif era == '3050':
        # Steiner 3050 has A/B and C/D/F
        return ['A/B (3050)', 'C/D/F (3050)']
    elif era == '3057':
        # Steiner 3057 has A/B and C/D/F
        return ['A/B (3057)', 'C/D/F (3057)']
    elif era == '3039-3050':
        return ['3039', '3050']
    elif era == '3028-3050':
        # Merc/Periphery tables span 3028-3050 with two columns: 3028 and 3039
        return ['3028', '3039']
    else:
        return [era]

def main():
    pdf = pdfplumber.open(PDF_PATH)
    all_entries = []

    for page_idx, info in sorted(FACTION_PAGES.items()):
        if page_idx >= len(pdf.pages):
            continue
        text = pdf.pages[page_idx].extract_text()
        if not text:
            print(f"WARNING: No text on page {page_idx+1}", file=sys.stderr)
            continue

        entries = parse_rarity_page(text, info['faction'], info['era'])
        print(f"Page {page_idx+1} ({info['faction']} {info['era']}): {len(entries)} entries", file=sys.stderr)
        all_entries.extend(entries)

    pdf.close()

    # Now build the JSON structure matching the old format
    # Old format: variant=chassis name, name=variant code, sections with era column keys
    mechs = {}

    for e in all_entries:
        key = e['variant']  # variant code like 'RFL-3N'
        if key not in mechs:
            mechs[key] = {
                'variant': e['name'],    # chassis name (e.g., 'Rifleman')
                'name': e['variant'],    # variant code (e.g., 'RFL-3N')
                'tonnage': e['tonnage'],
                'sections': {}
            }

        mech = mechs[key]

        # Update tonnage if we have it
        if e['tonnage'] and not mech['tonnage']:
            mech['tonnage'] = e['tonnage']

        # Add faction section with proper era column keys
        faction_key = f"{e['faction']}: {e['era']}"
        if e['faction'] == 'Star League 2750':
            faction_key = 'Star League 2750'

        era_columns = get_era_columns(e['faction'], e['era'])
        av_numbers = e['availability']

        if faction_key not in mech['sections']:
            mech['sections'][faction_key] = {}

        # Map availability numbers to era columns
        for i, val in enumerate(av_numbers):
            if i < len(era_columns):
                col = era_columns[i]
                # Only set if not already set (first entry wins, avoids overflow overwrites)
                if col not in mech['sections'][faction_key]:
                    mech['sections'][faction_key][col] = val
                else:
                    # For overflow pages, we might have additional columns
                    # If the column already exists, skip (first page data takes priority)
                    pass

    # Build final JSON
    result_mechs = list(mechs.values())
    result_mechs.sort(key=lambda m: (m['variant'], m['name']))

    # Build sections array matching old format
    sections = [
        {'faction': 'Star League 2750', 'era_columns': ['Regular', 'Royal']},
        {'faction': 'Capellan Confederation (House Liao): 3028-3039', 'era_columns': ['3028', '3039']},
        {'faction': 'Capellan Confederation (House Liao): 3050-3057', 'era_columns': ['3050', 'A/B (3057)', 'C/D/F (3057)']},
        {'faction': 'Draconis Combine (House Kurita): 3028-3039', 'era_columns': ['3028', '3039']},
        {'faction': 'Draconis Combine (House Kurita): 3050-3057', 'era_columns': ['3050', 'A/B (3057)', 'C/D/F (3057)']},
        {'faction': 'Federated Suns (House Davion): 3028-3039', 'era_columns': ['3028', '3039']},
        {'faction': 'Federated Suns (House Davion): 3050-3057', 'era_columns': ['3050', 'A/B (3057)', 'C/D/F (3057)']},
        {'faction': 'Free Rasalhague Republic: 3039-3050', 'era_columns': ['3039', '3050']},
        {'faction': 'Free Worlds League (House Marik): 3028-3039', 'era_columns': ['3028', '3039']},
        {'faction': 'Free Worlds League (House Marik): 3050-3057', 'era_columns': ['3050', 'A/B (3057)', 'C/D/F (3057)']},
        {'faction': 'Lyran Commonwealth (House Steiner): 3028-3039', 'era_columns': ['3028', '3039']},
        {'faction': 'Lyran Commonwealth (House Steiner): 3050', 'era_columns': ['A/B (3050)', 'C/D/F (3050)']},
        {'faction': 'Lyran Commonwealth (House Steiner): 3057', 'era_columns': ['A/B (3057)', 'C/D/F (3057)']},
        {'faction': 'St. Ives Compact: 3039-3050', 'era_columns': ['3039', '3050']},
        {'faction': 'Mercenary / Periphery General: 3028-3050', 'era_columns': ['3028', '3039']},
        {'faction': 'Magistracy Of Canopus: 3028-3050', 'era_columns': ['3028', '3039']},
        {'faction': 'Outworlds Alliance: 3028-3050', 'era_columns': ['3028', '3039']},
        {'faction': 'Taurian Concordat: 3028-3050', 'era_columns': ['3028', '3039']},
    ]

    result = {
        'sections': sections,
        'mechs': result_mechs
    }

    print(f"\nTotal unique mechs: {len(result_mechs)}", file=sys.stderr)

    # Verify RFL-3N
    rfl = next((m for m in result_mechs if m['name'] == 'RFL-3N'), None)
    if rfl:
        print(f"\nRFL-3N Rifleman:", file=sys.stderr)
        print(f"  Name: {rfl['variant']}, Ton: {rfl['tonnage']}", file=sys.stderr)
        print(f"  Factions: {list(rfl['sections'].keys())}", file=sys.stderr)
    else:
        print("\nWARNING: RFL-3N not found!", file=sys.stderr)

    # Write output
    output_path = 'data/xotl-source/xotl-rarity-parsed.json'
    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"\nWrote {output_path}", file=sys.stderr)
    # Don't dump full JSON to stdout — too large
    print(f"Mechs: {len(result_mechs)}")
    print(f"Sections: {len(sections)}")
    # Show a sample
    sample = next((m for m in result_mechs if m['name'] == 'RFL-3N'), None)
    if sample:
        print(f"\nRFL-3N sample:")
        print(json.dumps(sample, indent=2))

if __name__ == '__main__':
    main()
