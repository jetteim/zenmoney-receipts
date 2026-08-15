# Value stream

## Trigger to verified ledger outcome

User trigger: a receipt arrives, spending needs review, or the user has time for the next improvement.

```text
Resume durable context
        ↓
Connect/authenticate privately
        ↓
Extract bounded receipt facts or analysis scope
        ↓
Synchronize and match
        ↓
Preview exact plan ── ambiguity/unsupported evidence → clarify, no write
        ↓ explicit confirmation
Apply receipt-scoped mutation
        ↓
Re-sync, verify, report evidence
        ↓
Record learning/roadmap status
```

The primary value moment is a verified ledger result that matches receipt evidence without exposing credentials or creating an unintended duplicate. Flow time, ambiguity rate, verified-write rate, rollback/manual-review rate, and duplicate-prevention failures are the core measures.

Project-development work uses the same discipline: resume from repository truth, select a bounded item, implement, verify, and persist handoff state so a new session loses no essential context.
