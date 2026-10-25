# Complete full-price evidence verification

Scope: F-030 additive pricing validation and local append-only completion; F-031 standalone marketplace packaging. Personal receipt facts and identifiers are deliberately excluded.

- Startup setup plan passed. Initial sandbox doctor could not access the private credential; authorized read-only `npm run doctor:live` outside the sandbox subsequently passed runtime, storage, authentication and live-read checks.
- `npm run check` passed: 94 tests passed, one opt-in hosted test skipped; build, correction CLI, 39-tool MCP smoke, backend process smoke, receipt fixtures, repository validation, six evaluator tests and three skill package checks passed.
- Synthetic tests cover gross/discount reconciliation, precision, legacy paid cap, complete/partial coverage, signed apply behavior, unchanged paid expense totals, no-write evidence attachment, stale category no-op rejection and append-only correction constraints.
- Authorized live-local completion was previewed and applied with exact digest/revision; an intervening revision invalidated the first apply safely. A fresh preview succeeded. Independent CLI reads confirmed complete before-discount annotations and every expected group on both affected records.
- Evidence-only reconciliation verified existing expenses with unchanged upstream change markers. The local completion command reported no financial writes. No new expense or category was created by these repairs.
- Managed evidence remains outside the repository. No source receipt, transaction payload, private credential or personal spending summary is included here.
- Marketplace ZIPs use an explicit source allowlist; archives pass integrity and relative-reference checks and include MIT notices. Demo uses fictional data and is labeled illustrative; it is not a live session or OCR benchmark. The rendered synthetic preview was visually inspected.

Limits: original long-running MCP processes require restart. No public hosted deployment, marketplace approval, or cross-agent model baseline is claimed. Marketplace submission outcome is recorded in `marketplace/agensi/submit.md`.
