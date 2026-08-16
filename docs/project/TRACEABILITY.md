# Traceability

| Value/capability | Feature/story | Contract or architecture impact | Verification evidence | State |
| --- | --- | --- | --- | --- |
| VS-01 verified receipt-to-ledger flow / C-01 safe matching | F-010 receipt match/category | Bounded read projections; preview token | `tests/service.test.ts`, `tests/mcp-contract.test.ts` | Complete |
| VS-01 / C-02 exact allocation | F-011 reconciliation/split | Receipt operation plans; concurrency-safe compensation | `tests/receipt-operations-service.test.ts`, live E2E log | Complete |
| VS-01 / C-02 missing expense | F-012 new receipt creation | Complete ZenMoney create shape; duplicate-safe apply | `tests/direct-write.test.ts`, live E2E log, `docs/evidence/2026-08-16-live-receipt-operation.md` | Complete; live single-category receipt verified |
| VS-01 / C-18 fast receipt defaults | F-018 marked date/account suggestions | Optional preview inputs; deterministic bounded ranking; suggestion provenance bound into exact plan | `tests/receipt-defaults.test.ts`, `tests/receipt-operations-service.test.ts`, MCP contract | Complete offline; no new live write required |
| VS-02 resumable development / C-04 continuity | F-001 durable handoff | `AGENTS.md`, project artifact set | `scripts/verify-repo.mjs` | Complete |
| VS-03 private onboarding / C-05 install/auth | F-002 agent setup | JSON plan/doctor/schema; secure Keychain handoff | `tests/agent-install.test.ts`, live doctor | Complete |
| VS-03 / C-06 private ChatGPT | F-003 tunnel tooling | Outbound tunnel profile around local stdio | plan tests; external tunnel doctor/UI pending | Repo complete, external blocked |
| VS-04 dependable operations / C-07 release hygiene | F-004 CI/security/docs | CI, dependency policy, DoD, repo validation | `npm run check`, GitHub Actions after push | Complete locally |
| VS-04 / C-08 crash recovery | F-005 / S-005A operation journal | Persistent minimal operation state; recovery inspection | Planned crash/restart tests | Ready |
| VS-04 / C-09 diagnosis | F-006 support bundle | Allowlisted structured events only | Planned redaction/adversarial tests | Ready |
| VS-03 / C-10 token lifecycle | F-007 OAuth lifecycle | New authorization boundary and encrypted refresh state | Blocked on owned ZenMoney OAuth client | Next |
| VS-01 / C-11 extraction quality | F-008 evaluation pack | Host-neutral receipt-facts contract | Planned synthetic eval corpus | Next |
| VS-05 category clarity / C-12 analysis | F-009 regrouping plans | Read-only category summary and agent recommendation contract | summary unit tests; category-review skill | Complete |
| VS-06 savings / C-13 spending insight | F-013 saving suggestions | Per-instrument monthly/category/payee evidence; no writes | spending-insight unit test; savings skill validation | Complete |
| VS-07 laptop-independent ChatGPT / C-14 hosted connector | F-014 / S-014A hosted/public path | New Streamable HTTP, OAuth, tenant, deployment and policy boundaries | Planned threat model, auth tests, staging discovery, publication gates | Ready |
| VS-05 category clarity / C-15 taxonomy management | F-015 bounded taxonomy writes | Six explicit preview/apply tools; one-level hierarchy and concurrency checks; reversible retirement | `tests/taxonomy-service.test.ts`, MCP contract, v0.4.0 evidence, `docs/evidence/2026-08-15-live-taxonomy-operation.md` | Complete; live create/update verified, retirement/restore live-unverified |
| VS-05 / C-16 category consolidation | F-016 crash-safe merge | Durable all-reference migration; no generic delete surface | Planned restart/conflict/live cleanup tests | Blocked on F-005 |
| VS-05 / C-17 receipt-informed taxonomy memory | F-017 opt-in evidence store | New local privacy/storage boundary; bounded inspect and purge | Planned permissions, corruption, retention, and deletion tests | Next |

Value streams: VS-01 receipt-to-ledger; VS-02 development continuity; VS-03 private onboarding; VS-04 dependable operation; VS-05 category clarity; VS-06 savings; VS-07 laptop-independent ChatGPT. Architecture details are in `docs/project/ARCHITECTURE.md` and `docs/architecture-and-security.md`.
