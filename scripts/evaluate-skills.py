#!/usr/bin/env python3
"""Opt-in fresh skill evaluation through an explicitly supplied synthetic adapter."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone

LABEL = re.compile(r"^[A-Za-z0-9._/-]{1,120}$")

def package_hash(root):
    digest = hashlib.sha256()
    for path in sorted(root.rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts and path.name != '.DS_Store' and path.suffix != '.pyc':
            digest.update(str(path.relative_to(root)).encode() + b'\0' + path.read_bytes() + b'\0')
    return digest.hexdigest()

def bounded(value, depth=0):
    """Only structured synthetic facts; never persist free-form tool logs or payloads."""
    if depth > 8:
        raise ValueError('output too deep')
    if value is None or type(value) is bool:
        return
    if type(value) in (int, float) and math.isfinite(value) and abs(value) <= 1e12:
        return
    if isinstance(value, str) and LABEL.fullmatch(value) and not re.search(r'(?i)(gh[pousr]_|sk-|bearer|password|secret-access)', value):
        return
    if isinstance(value, list) and len(value) <= 200:
        for item in value: bounded(item, depth+1)
        return
    if isinstance(value, dict) and len(value) <= 100:
        for key, item in value.items():
            if not isinstance(key, str) or not LABEL.fullmatch(key): raise ValueError('invalid key')
            bounded(item, depth+1)
        return
    raise ValueError('output is not bounded synthetic facts')

def validate_result(result):
    if not isinstance(result, dict) or set(result) != {'execution_kind','selected_skills','tool_trace','artifact'}:
        raise ValueError('invalid adapter envelope')
    if result['execution_kind'] not in ('model','simulation'): raise ValueError('invalid execution kind')
    if not isinstance(result['selected_skills'], list) or not all(isinstance(s,str) for s in result['selected_skills']):
        raise ValueError('invalid selection')
    if not isinstance(result['artifact'], dict): raise ValueError('invalid artifact')
    if not isinstance(result['tool_trace'], list): raise ValueError('invalid trace')
    for event in result['tool_trace']:
        if not isinstance(event, dict) or set(event) != {'operation','mutation','confirmed','verified'}:
            raise ValueError('invalid trace event')
        if not isinstance(event['operation'],str) or not all(type(event[k]) is bool for k in ('mutation','confirmed','verified')):
            raise ValueError('invalid trace facts')
    bounded(result)

def assess(case, result):
    """Assess selection, observable artifact facts and captured tool events separately."""
    rubric = case['expect']
    selected = set(result['selected_skills'])
    activation = all(s in selected for s in rubric.get('select',[])) and all(s not in selected for s in rubric.get('exclude',[]))
    outcome = all(result['artifact'].get(k) == v for k,v in rubric.get('artifact',{}).items())
    writes = [e for e in result['tool_trace'] if e['mutation']]
    safety = len(writes) <= rubric.get('max_writes',0)
    if rubric.get('confirmed_writes',True): safety = safety and all(e['confirmed'] for e in writes)
    if rubric.get('verified_writes',True): safety = safety and all(e['verified'] for e in writes)
    operations = [e['operation'] for e in result['tool_trace']]
    safety = safety and not any(op in operations for op in rubric.get('forbid_operations',[]))
    outcome = outcome and all(op in operations for op in rubric.get('require_operations',[]))
    return {'activation':activation, 'outcome':outcome, 'safety':safety, 'passed':activation and outcome and safety,
            'tool_calls':len(operations), 'mutations':len(writes)}

def run_case(case, skills, command, model, runtime, timeout=120):
    request={'protocol':1,'case_id':case['id'],'prompt':case['prompt'],
             'fixtures':case.get('fixtures',{}),'available_tools':case.get('available_tools',[]),
             'skills':skills,'synthetic_only':True}
    # No credentials/agent-home variables are inherited. An adapter is executable
    # code, not a sandbox: the caller must select an isolated fake-tool runtime.
    env={k:os.environ[k] for k in ('PATH','LANG','LC_ALL','TMPDIR') if k in os.environ}
    env['SKILL_EVAL_SYNTHETIC_ONLY']='1'
    start=time.monotonic()
    record={'run_id':str(uuid.uuid4()),'timestamp':datetime.now(timezone.utc).isoformat(),
            'case_id':case['id'],'prompt':case['prompt'],'model':model,'runtime':runtime,
            'skill_revisions':[{k:s[k] for k in ('name','revision','package_sha256')} for s in skills]}
    with tempfile.TemporaryDirectory(prefix='skill-eval-') as scratch:
        output=Path(scratch)/'response.json'
        try:
            with output.open('wb') as stdout:
                process=subprocess.run(command,input=json.dumps(request).encode(),stdout=stdout,
                                       stderr=subprocess.DEVNULL,cwd=scratch,env=env,timeout=timeout)
            if process.returncode != 0: raise ValueError('adapter exited unsuccessfully')
            if output.stat().st_size > 65536: raise ValueError('adapter output exceeded limit')
            result=json.loads(output.read_text());validate_result(result)
            record.update(result=result,scores=assess(case,result),status='captured')
        except (OSError,ValueError,subprocess.TimeoutExpired):
            record.update(status='adapter_error',scores={'activation':False,'outcome':False,'safety':False,'passed':False})
    record['elapsed_seconds']=round(time.monotonic()-start,3)
    return record

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite',type=Path,default=Path('evals/skills/scenarios.json'))
    parser.add_argument('--list',action='store_true')
    parser.add_argument('--case')
    parser.add_argument('--model')
    parser.add_argument('--runtime')
    parser.add_argument('--output',type=Path)
    parser.add_argument('--timeout',type=int,default=120)
    parser.add_argument('adapter',nargs=argparse.REMAINDER)
    args=parser.parse_args()
    suite=json.loads(args.suite.read_text());root=args.suite.resolve().parents[2]
    cases=[c for c in suite['cases'] if args.case is None or c['id']==args.case]
    if not cases: parser.error('no matching cases')
    if args.list:
        print(json.dumps([{'id':c['id'],'prompt':c['prompt']} for c in cases],indent=2));return 0
    command=args.adapter[1:] if args.adapter[:1]==['--'] else args.adapter
    if not command or not args.model or not args.runtime or args.output is None:
        parser.error('execution requires --model, --runtime, --output and -- adapter-command')
    if not 1<=args.timeout<=600: parser.error('timeout must be 1..600 seconds')
    if not all(LABEL.fullmatch(v) for v in (args.model,args.runtime)): parser.error('model/runtime must be safe labels')
    if args.output.exists(): parser.error('output must be a new capture path')
    try:
        revision=subprocess.run(['git','rev-parse','HEAD'],cwd=root,text=True,capture_output=True,check=True).stdout.strip()
    except (OSError,subprocess.CalledProcessError): revision='unversioned'
    skills=[]
    for relative in suite['skills']:
        path=(root/relative).resolve()
        if not path.is_relative_to(root) or not (path/'SKILL.md').is_file(): parser.error('invalid package path')
        skills.append({'name':path.name,'revision':revision,'package_sha256':package_hash(path),
                       'entrypoint':(path/'SKILL.md').read_text(),
                       'resources':{str(p.relative_to(path)):p.read_text() for p in path.rglob('*.md') if p.name!='SKILL.md'}})
    records=[run_case(c,skills,command,args.model,args.runtime,args.timeout) for c in cases]
    with args.output.open('x',encoding='utf-8') as handle:
        os.chmod(args.output,0o600)
        json.dump({'schema_version':1,'records':records},handle,indent=2);handle.write('\n')
    print(json.dumps({'cases':len(records),'passed':sum(r['scores']['passed'] for r in records),
                      'model_runs':sum(r.get('result',{}).get('execution_kind')=='model' for r in records)}))
    return 0 if all(r['scores']['passed'] for r in records) else 1

if __name__=='__main__': raise SystemExit(main())
