#!/usr/bin/env python3
"""Offline runner/protocol checks. These are simulations, never model evaluation."""
import importlib.util
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('evaluator',ROOT/'scripts/evaluate-skills.py')
E=importlib.util.module_from_spec(spec);spec.loader.exec_module(E)

class EvaluatorTests(unittest.TestCase):
    def test_fresh_capture_and_failed_invariant(self):
        with tempfile.TemporaryDirectory() as directory:
            d=Path(directory);fixture=d/'saved.actual.yaml';fixture.write_text('unchanged fixture')
            adapter=d/'adapter.py'
            adapter.write_text('import json,sys\nr=json.load(sys.stdin)\nprint(json.dumps({"execution_kind":"simulation","selected_skills":["reliability-engineering"],"tool_trace":[],"artifact":{"route":r["fixtures"]["route"]}}))\n')
            case={'id':'fresh','prompt':'synthetic route','fixtures':{'route':'reliability'},
                  'expect':{'select':['reliability-engineering'],'artifact':{'route':'reliability'}}}
            first=E.run_case(case,[],[sys.executable,str(adapter)],'simulation','fake-tools')
            self.assertTrue(first['scores']['passed']);self.assertEqual(first['result']['execution_kind'],'simulation')
            case['fixtures']['route']='wrong-route'
            second=E.run_case(case,[],[sys.executable,str(adapter)],'simulation','fake-tools')
            self.assertFalse(second['scores']['outcome']);self.assertNotEqual(first['run_id'],second['run_id'])
            self.assertEqual(second['result']['artifact']['route'],'wrong-route')
            self.assertEqual(fixture.read_text(),'unchanged fixture')

    def test_trace_safety_not_claimed_success(self):
        case={'expect':{'artifact':{'status':'verified'},'max_writes':1}}
        result={'selected_skills':[],'artifact':{'status':'verified'},'tool_trace':[
            {'operation':'apply','mutation':True,'confirmed':False,'verified':True}]}
        self.assertFalse(E.assess(case,result)['safety'])
        result['tool_trace'][0]['confirmed']=True
        self.assertTrue(E.assess(case,result)['passed'])
        result['tool_trace'].append(result['tool_trace'][0]);self.assertFalse(E.assess(case,result)['safety'])

    def test_errors_do_not_capture_raw_output(self):
        with tempfile.TemporaryDirectory() as directory:
            adapter=Path(directory)/'adapter.py';adapter.write_text('print("invalid private body")')
            result=E.run_case({'id':'bad','prompt':'synthetic','expect':{}},[],[sys.executable,str(adapter)],'simulation','fake-tools')
            self.assertEqual(result['status'],'adapter_error');self.assertNotIn('private',json.dumps(result))

    def test_reject_unbounded_or_untyped_output(self):
        for value in ('arbitrary free form receipt text',float('nan'),list(range(201)),{'body':'Bearer synthetic'}):
            with self.assertRaises(ValueError):E.bounded(value)
        with self.assertRaises(ValueError):E.validate_result({'artifact':{}})

    def test_package_digest_includes_reference_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory);(p/'SKILL.md').write_text('skill');(p/'ref.md').write_text('one')
            first=E.package_hash(p);(p/'ref.md').write_text('two');self.assertNotEqual(first,E.package_hash(p))

    def test_cli_capture_metadata_and_no_expected_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);package=root/'skills/demo';package.mkdir(parents=True)
            (package/'SKILL.md').write_text('synthetic skill');(package/'reference.md').write_text('synthetic reference')
            suite=root/'evals/skills/scenarios.json';suite.parent.mkdir(parents=True)
            suite.write_text(json.dumps({'skills':['skills/demo'],'cases':[{
                'id':'fresh-cli','prompt':'synthetic task','expect':{'select':['demo'],'artifact':{'status':'bounded'}}}]}))
            adapter=root/'adapter.py';adapter.write_text('import json,sys\nr=json.load(sys.stdin)\nassert "expect" not in r\nassert r["skills"][0]["resources"]["reference.md"] == "synthetic reference"\nprint(json.dumps({"execution_kind":"simulation","selected_skills":["demo"],"tool_trace":[],"artifact":{"status":"bounded"}}))')
            output=root/'capture.json'
            command=[sys.executable,str(ROOT/'scripts/evaluate-skills.py'),'--suite',str(suite),
                     '--model','simulation','--runtime','fake-tools','--output',str(output),'--',sys.executable,str(adapter)]
            process=subprocess.run(command,capture_output=True,text=True)
            self.assertEqual(process.returncode,0,process.stderr)
            record=json.loads(output.read_text())['records'][0]
            self.assertEqual(record['skill_revisions'][0]['package_sha256'],E.package_hash(package))
            self.assertEqual(record['result']['execution_kind'],'simulation');self.assertTrue(record['scores']['passed'])
            self.assertEqual(output.stat().st_mode & 0o777,0o600)
            before=output.read_bytes();self.assertNotEqual(subprocess.run(command,capture_output=True).returncode,0)
            self.assertEqual(before,output.read_bytes())

if __name__=='__main__':unittest.main()
