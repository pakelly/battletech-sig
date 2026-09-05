#!/usr/bin/env python3
"""
Merge old xotl-rarity.json with newly parsed data.
New data takes priority for faction sections (has complete Great House data).
Old data fills in any mechs the new parser missed (Star League Royal variants, etc).
"""
import json

with open('app/xotl-rarity.json') as f:
    old = json.load(f)
with open('data/xotl-source/xotl-rarity-parsed.json') as f:
    new = json.load(f)

# Build lookup by variant code
def get_code(m):
    """Extract the variant code (e.g., 'RFL-3N') from a mech entry."""
    name = m.get('name', '')
    variant = m.get('variant', '')
    # The code is whichever field has a dash+number pattern
    if '-' in name and any(c.isdigit() for c in name):
        return name
    if '-' in variant and any(c.isdigit() for c in variant):
        return variant
    # Fallback
    return name if name else variant

old_by_code = {}
for m in old['mechs']:
    code = get_code(m)
    if code not in old_by_code:
        old_by_code[code] = m

new_by_code = {}
for m in new['mechs']:
    code = get_code(m)
    if code not in new_by_code:
        new_by_code[code] = m

# Merge
merged = {}
all_codes = set(old_by_code.keys()) | set(new_by_code.keys())

for code in all_codes:
    old_m = old_by_code.get(code)
    new_m = new_by_code.get(code)
    
    if new_m and old_m:
        # Merge: use new data as base, fill missing from old
        result = {
            'variant': new_m['variant'],
            'name': new_m['name'],
            'tonnage': new_m['tonnage'] or (old_m['tonnage'] if old_m else None),
            'sections': {}
        }
        # Add all new sections (priority)
        for k, v in new_m['sections'].items():
            result['sections'][k] = v
        # Add old sections not in new
        if old_m:
            for k, v in old_m['sections'].items():
                if k not in result['sections']:
                    result['sections'][k] = v
        merged[code] = result
    elif new_m:
        merged[code] = new_m
    elif old_m:
        merged[code] = old_m

result_mechs = list(merged.values())
result_mechs.sort(key=lambda m: (m.get('variant', ''), m.get('name', '')))

# Use new sections array (it's the correct format)
result = {
    'sections': new['sections'],
    'mechs': result_mechs
}

# Stats
old_gh = ['Capellan Confederation', 'Draconis Combine', 'Federated Suns', 'Free Worlds League', 'Lyran Commonwealth']
with_gh = sum(1 for m in result_mechs if any(any(gh in k for gh in old_gh) for k in m['sections']))
without_gh = len(result_mechs) - with_gh

print(f"Merged mechs: {len(result_mechs)}")
print(f"With Great House data: {with_gh}")
print(f"Without: {without_gh}")

# Verify RFL-3N
rfl = next((m for m in result_mechs if get_code(m) == 'RFL-3N'), None)
if rfl:
    print(f"\nRFL-3N: variant={rfl['variant']}, name={rfl['name']}, ton={rfl['tonnage']}")
    print(f"Factions ({len(rfl['sections'])}): {list(rfl['sections'].keys())}")

# Write
output = 'app/xotl-rarity.json'
with open(output, 'w') as f:
    json.dump(result, f, indent=2)
print(f"\nWrote {output}")
