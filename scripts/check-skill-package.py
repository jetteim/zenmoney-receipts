#!/usr/bin/env python3
"""Offline package, reference, frontmatter and metadata checks."""
from pathlib import Path
import re
import json
import yaml
root=Path(__file__).resolve().parents[1]
skills=root/('skills' if (root/'skills').is_dir() else 'skill')
count=0
for p in skills.glob('*/SKILL.md'):
    text=p.read_text();front=yaml.safe_load(text.split('---',2)[1])
    assert front['name']==p.parent.name and 0<len(front['description'])<=1024,p
    assert set(front).issubset({'name','description','license','allowed-tools','metadata','compatibility'}),p
    clean=re.sub(r'```.*?```','',text,flags=re.S)
    for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)',clean):
        if '://' not in link and not link.startswith('#'):
            assert (p.parent/link.split('#')[0]).is_file(),(p,link)
    meta=p.parent/'agents/openai.yaml'
    if meta.exists():
        data=yaml.safe_load(meta.read_text());assert '$'+p.parent.name in data['interface']['default_prompt'],meta
    count+=1
print(f'Package structure and entrypoint references: {count} passed; no model invoked')

suite=json.loads((root/'evals/skills/scenarios.json').read_text())
assert suite['synthetic_only'] is True
assert len({case['id'] for case in suite['cases']})==len(suite['cases'])
for path in suite['skills']:assert (root/path/'SKILL.md').is_file(),path
for case in suite['cases']:
    assert case['prompt'] and isinstance(case['expect']['max_writes'],int) and case['expect']['max_writes']>=0
print(f"Synthetic scenario definitions: {len(suite['cases'])} checked; no model invoked")
