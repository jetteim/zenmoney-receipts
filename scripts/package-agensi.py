#!/usr/bin/env python3
"""Build text-only skill ZIPs from an explicit public-source allowlist."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts' / 'agensi'
out.mkdir(parents=True, exist_ok=True)
names = ['categorize-zenmoney-receipts', 'review-zenmoney-categories', 'find-zenmoney-savings']
manifest = []
for name in names:
    source = root / 'skills' / name
    files = {'SKILL.md': (source / 'SKILL.md').read_bytes(),
             'LICENSE': (root / 'LICENSE').read_bytes(),
             'references/setup.md': (root / 'marketplace/agensi/setup.md').read_bytes()}
    refs = source / 'references'
    if refs.exists():
        for p in sorted(refs.glob('*.md')):
            assert not p.is_symlink()
            files['references/' + p.name] = p.read_bytes()
    # The receipt skill's automatic review must also work when installed alone.
    if name == 'categorize-zenmoney-receipts':
        files['references/category-review.md'] = (root / 'skills/review-zenmoney-categories/SKILL.md').read_text().replace('(references/storage-policy.md)', '(storage-policy.md)').encode()
        body = files['SKILL.md'].decode()
        body = body.replace('immediately follow the `$review-zenmoney-categories` read-only workflow',
                            'immediately follow the [category-review reference](references/category-review.md) read-only workflow')
        files['SKILL.md'] = body.encode()
    body = files['SKILL.md'].decode()
    body += '\n## Marketplace installation\n\nRead [setup requirements](references/setup.md) before first use. Skill delivery does not install or authenticate the required ZenMoney MCP server.\n'
    files['SKILL.md'] = body.encode()
    files['README.md'] = (f'# {name}\n\nMIT-licensed companion skill for zenmoney-receipts.\n\n'
        'Start with [setup requirements](references/setup.md), then use the prompts in [synthetic examples](references/examples.md). '
        'Requires a separately installed MCP connector; no personal data or executable installer is bundled.\n').encode()
    examples = {
      names[0]: 'Synthetic receipt: fruit 8.00 before a 2.00 discount; paid 6.00. Expected: financial preview 6.00, full-price evidence 8.00 with discountTotal 2.00. No write before approval. An existing matching expense must not be duplicated.',
      names[1]: 'Synthetic history: six receipts have a Fresh fruit purpose under a broad Food category. Expected: explain recurrence and coverage, propose an optional clearer category; do not change taxonomy during review.',
      names[2]: 'Synthetic history: three monthly charges of 9.00 in one currency. Expected: identify a recurring charge to review, state the sample period, and avoid promising cancellation or automatic savings.'}
    files['references/examples.md'] = ('# Synthetic acceptance examples\n\n' + examples[name] + '\n\nIf tools are unavailable, report that limitation; never invent successful tool results.\n').encode()
    path = out / f'{name}.zip'
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for rel, content in sorted(files.items()):
            content.decode('utf-8')
            assert '/Users/' not in content.decode()
            info = zipfile.ZipInfo(f'{name}/{rel}', (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, content)
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        assert all(n.startswith(name + '/') and '..' not in n.split('/') for n in z.namelist())
        assert name + '/SKILL.md' in z.namelist()
        # Validate local markdown references inside every packed document.
        import re, posixpath
        for n in z.namelist():
            if not n.endswith('.md'): continue
            text = z.read(n).decode()
            for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
                if '://' in link or link.startswith('#'): continue
                target = posixpath.normpath(posixpath.join(posixpath.dirname(n), link.split('#')[0]))
                assert target in z.namelist(), (n, link)
    manifest.append({'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'files': len(files)})
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'ok': True, 'packages': manifest}, indent=2))
