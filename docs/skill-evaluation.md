# Skill evaluation: fixtures versus captured behavior

Routine validators and saved `.actual.yaml`/receipt candidate comparisons check static contracts. They do not invoke a model or prove current activation, extraction or host behavior.

`scripts/evaluate-skills.py` is an opt-in adapter runner. List reviewed synthetic cases with `python3 scripts/evaluate-skills.py --list`. Execute using `python3 scripts/evaluate-skills.py --model MODEL --runtime ISOLATED-RUNTIME --output /tmp/new-capture.json -- /absolute/path/to/adapter`. Output must be a new file; failed invariants return nonzero. Do not put captures containing personal data in the repository.

The adapter receives one JSON request on stdin: case ID, prompt, synthetic fixtures, available fake operations and skill entrypoints/Markdown resources. Rubrics are withheld. It must run a fresh host/model session with only the provided fake tools, capture actual tool events at the transport layer (never model self-reported events), and emit one JSON object:

```json
{"execution_kind":"model","selected_skills":["skill-name"],"tool_trace":[{"operation":"read","mutation":false,"confirmed":false,"verified":true}],"artifact":{"status":"bounded"}}
```

The artifact is the run's normalized structured output: rubric field names appear in the scenario expectations and must be populated from inspected output/artifacts, never copied from expected values. Keep original artifacts in the isolated synthetic runtime if richer inspection is needed; this capture accepts bounded labels/numbers/booleans and excludes free-form receipt text, raw tool logs, secret values and personal data. Failed or malformed output is recorded without its body. Captures record prompt, timestamp, fresh run ID, HEAD and full package digest (including uncommitted edits), model/runtime, tool events, structured artifact, elapsed time and activation/outcome/safety scores.

Financial cases use synthetic receipts and fake preview/apply/recovery transports only. Generic trace checks enforce mutation count plus confirmed/verified writes and forbidden operations. The adapter must implement domain-specific checks such as exact preview identity/amount equality and convert their inspected results into artifact facts. Models cannot verify their own safety by assertion.

This runner removes inherited credential variables and uses a temporary working directory, but arbitrary adapter code is **not sandboxed**. Select an isolated runtime with no real account bindings, live network mutations or personal files. The runner is not a license to attach a live financial connector. Adapter correctness and tool isolation require separate review. A model/runtime label or `execution_kind` claim alone is not independent proof of a model run.

`python3 scripts/test-skill-evaluator.py` tests fresh subprocess capture, deliberate failure detection, trace safety and fixture immutability using simulations. It is not a behavioral baseline. No real model run is part of ordinary offline validation. Scenario coverage includes direct/indirect triggers, adjacent nontriggers, missing capabilities, explicit scope overrides, ambiguity and unsupported operations. Report actual model runs and domain-specific limitations separately.

Offline Python package checks require Python 3.9+ and PyYAML (`python3 -m pip install -r requirements-skill-checks.txt` in your chosen development environment). The adapter/runner itself uses only the standard library. No dependency installation is performed by a skill invocation.
