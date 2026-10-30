#!/usr/bin/env python3
"""Back up and consolidate identical local notes through revision-checked storage.
Default is a dry run; pass --apply to move redundant copies to recoverable trash.
No GitHub uploads. Different titles, privacy scopes, or substantive text stay separate.
"""
import argparse, collections, datetime, json, re, urllib.request
from pathlib import Path

def normalized(content):
    # Preserve code and mathematical block whitespace exactly.
    result = []; fence = None
    for line in content.splitlines():
        marker = re.match(r'^\s*(`{3,}|~{3,}|\$\$)', line)
        if marker:
            token = marker[1][0]
            fence = None if fence == token else token
            result.append(line.rstrip())
        elif fence:
            result.append(line)
        elif line.strip():
            result.append(line.rstrip())
    return '\n'.join(result)

def consolidate(workspace, now):
    groups = collections.defaultdict(list)
    for note in workspace['notes']:
        if not note.get('deletedAt'):
            title = re.sub(r'（导入）$', '', note['title']).strip()
            groups[(title, note.get('visibility') or 'public', normalized(note['content']))].append(note)
    changes = []
    for group in groups.values():
        if len(group) < 2: continue
        # Keep the personal notes repository association over legacy system imports.
        group.sort(key=lambda n: (n.get('github', {}).get('url', '').endswith('/notes-public') or n.get('github', {}).get('url', '').endswith('/notes-private'), not n['title'].endswith('（导入）'), n['updatedAt']), reverse=True)
        keep = group[0]
        for duplicate in group[1:]:
            keep['tags'] = list(dict.fromkeys(keep['tags'] + duplicate['tags']))[:30]
            keep['pinned'] = keep['pinned'] or duplicate['pinned']
            duplicate['deletedAt'] = now
            duplicate['updatedAt'] = now
            changes.append({'kept': keep['id'], 'archived': duplicate['id'], 'title': keep['title']})
        keep['updatedAt'] = now
    detach_archived(workspace, changes)
    return changes

def binding_key(binding):
    return json.dumps([binding['url'].lower(), binding['branch'], binding['path']], separators=(',', ':'), ensure_ascii=False)

def detach_archived(workspace, changes):
    # A duplicate must never upload a deletion to the retained copy's remote path.
    live_keys = {binding_key(n[k]) for n in workspace['notes'] if not n.get('deletedAt') for k in ['github', 'source'] if n.get(k)}
    ignored = set(workspace.get('ignoredSources', []))
    archived = {c['archived'] for c in changes}
    for note in workspace['notes']:
        if note['id'] not in archived: continue
        for field in ['github', 'source']:
            binding = note.pop(field, None)
            if binding and binding_key(binding) not in live_keys:
                ignored.add(binding_key(binding))
        note.pop('publications', None)
    workspace['ignoredSources'] = sorted(ignored)

def request(body=None):
    req = urllib.request.Request('http://127.0.0.1:5174/workspace', data=None if body is None else json.dumps(body).encode(), headers={'x-zhiye-local': '1', 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--apply', action='store_true'); args = parser.parse_args()
    data = request(); original = json.dumps(data, ensure_ascii=False)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    changes = consolidate(data['workspace'], now)
    print(f'{len(changes)} redundant copies; different content is retained.')
    if args.apply and changes:
        folder = Path.home() / '.zhiye-notes' / 'backups' / ('deduplicate-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
        folder.mkdir(mode=0o700)
        for name, text in [('before.json', original), ('changes.json', json.dumps(changes, ensure_ascii=False, indent=2))]:
            file = folder / name; file.write_text(text); file.chmod(0o600)
        data['workspace']['updatedAt'] = now
        print(request({'expectedRevision': data['revision'], 'workspace': data['workspace']}))
        current = request()['workspace']
        assert all(next(n for n in current['notes'] if n['id'] == c['archived'])['deletedAt'] for c in changes)
        print('Verified. Backup:', folder)
