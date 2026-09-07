# Traceability

| Value/capability | Feature | Contract or architecture impact | Verification evidence | State |
| --- | --- | --- | --- | --- |
| VS-03 / C-05 onboarding; VS-05 / C-17 evidence clarity | F-021 | Structured caller/server/upstream decision provenance | Provenance service tests; full offline check | Complete |
| VS-01 verified receipt-to-ledger / C-01 safe matching | F-010 | Bounded projections and signed preview | service and MCP contract tests | Complete |
| VS-01 / C-02 exact allocation and creation | F-011, F-012 | Exact reconciliation/create plans, compensation, verification | receipt-operation/direct-write tests; historical live E2E | Complete |
| VS-01 / C-18 fast defaults | F-018 | Optional inputs; marked provenance; deterministic bounded ranking | receipt-default tests and MCP contract | Complete |
| VS-01 / C-11 extraction quality | F-008 | Host-neutral structured-facts contract; synthetic corpus | `npm run eval:receipts`; `evals/receipts/cases.json` | Complete contract pack; real-model accuracy unverified |
| VS-02 resumable development / C-04 continuity | F-001 | `AGENTS.md` and required project artifacts | repository verifier | Complete |
| VS-02 / C-04 continuity; VS-03 / C-05 onboarding | F-020 | Source-linked behavior architecture: guidance, interfaces, deterministic rules, runtime/storage, receipt sequence | Mermaid and link validation; source review; full offline check | Documentation complete; no runtime change |
| VS-03 private onboarding / C-05 local install/auth | F-002 | JSON plan/doctor/schema; secure Keychain handoff | agent-install tests; doctor | Complete |
| VS-03 / C-06 obsolete laptop transport | F-003 | Tunnel files and active instructions removed | repository search and verifier | Retired |
| VS-03 laptop-independent ChatGPT / C-10, C-14 | F-007, F-014 | HTTP MCP resource server; bearer/origin validation; tenant sessions; encrypted OAuth lifecycle; exact tenant-data deletion; deployment/policy boundaries | hosted auth/server/store/HTTP/tenant-deletion tests; Docker and deploy docs | Repository complete; external staging gated |
| VS-04 dependable operation / C-07 release hygiene | F-004 | CI, lockfile, policies, DoD | `npm run check`; GitHub Actions | Complete locally; CI per push |
| VS-04 / C-08 crash recovery | F-005 | Minimal persistent journal and recovery tools | operation-journal, service, MCP tests | Complete offline |
| VS-04 / C-09 diagnosis | F-006 | Allowlisted events, support bundle, doctor, troubleshooting | observability/adversarial tests; CLI smoke | Complete local support boundary; hosted telemetry gated |
| VS-05 category clarity / C-12 analysis | F-009 | Read-only summary plus agent recommendation contract | summary tests; review skill | Complete |
| VS-05 / C-15 taxonomy management | F-015 | Exact create/update/retire preview/apply | taxonomy/MCP tests; historical selected live evidence | Complete offline; retirement/restore live-unverified |
| VS-05 / C-16 consolidation | F-016 | Complete reference snapshot; journaled migration/retirement; fail-closed budgets | category-consolidation restart/conflict/compensation tests | Complete for transactions/reminders/markers; budgets gated |
| VS-05 / C-17 receipt-informed memory | F-017 | Atomic bounded evidence; review readiness; exact deletion/purge | receipt-memory/service/MCP tests | Complete offline; local enabled historically |
| VS-03 / C-05 private onboarding; VS-05 / C-17 receipt-informed memory | F-019 | Storage self-awareness in docs/skills/MCP; personal evidence outside checkout; optional remote comments through existing boundaries | Full offline check; skill metadata validation; source review of storage/comment contracts; diff check | Complete as guidance; host-model behavior/live comments unverified |
| VS-06 savings / C-13 spending insight | F-013 | Per-instrument monthly/category/payee evidence; no writes | spending-insight tests; savings skill | Complete |

Value streams: VS-01 receipt-to-ledger; VS-02 development continuity; VS-03 private onboarding/remote access; VS-04 dependable operation; VS-05 category clarity; VS-06 savings. Detailed views are in `ARCHITECTURE.md`, `docs/architecture-and-security.md`, and `docs/explanation/hosted-architecture.md`.
