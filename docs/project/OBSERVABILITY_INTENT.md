# Observability intent

This document defines what the connector needs to learn operationally without turning telemetry into a financial-data export. It is an intent and instrumentation-gap record, not a claim that a production telemetry backend exists.

## User outcomes to protect

1. An authorized user can reach the connector and complete a read-only ZenMoney sync.
2. A confirmed receipt or taxonomy operation either verifies, safely compensates, or produces a clear manual-review record; it is never blindly replayed.
3. Hosted authentication and tenant isolation reject unauthorized, expired, wrongly scoped, or cross-tenant requests.
4. Private local state survives the supported single-instance restart/deploy model and fails closed when corrupt or unsafe.

## Current signals

The local allowlisted event store records only event name, outcome, component, phase, operation kind, one-way operation reference, bounded duration, and a closed-format code. It excludes credentials, tenant IDs, target IDs, financial values, category/merchant labels, receipt text, paths, and raw errors. The support bundle adds runtime/version, credential configured/source status, memory counts, recovery classifications without targets, and recent bounded events.

These signals currently cover backend call starts/results and supported receipt/consolidation operation phases. The doctor validates the journal and event stores. Unit tests exercise hostile codes and redaction boundaries.

## Candidate SLIs

These are metric definitions for a future operator-owned OpenTelemetry pipeline; no production measurements or targets are claimed.

| SLI | Event/measurement intent | User impact |
| --- | --- | --- |
| MCP availability | successful authenticated `/mcp` requests ÷ valid authenticated requests | Client cannot use any tool. |
| Read success | successful bounded ZenMoney reads ÷ attempted reads | Categories/history cannot be reviewed. |
| Verified mutation ratio | verified operations ÷ confirmed operations that started | Confirmed receipt/taxonomy intent did not reach a proven result. |
| Uncertain/manual-review ratio | manual-review classifications ÷ started operations | User needs exact human inspection and must not retry automatically. |
| Auth rejection by reason | inactive/issuer/audience/scope/expiry/session-owner failures | Detect configuration or abuse without identifying a tenant. |
| Storage validation | valid journal/event/receipt-memory checks ÷ checks | Recovery or evidence continuity is unsafe. |
| End-to-end operation latency | preview-to-verified phase duration distribution, correlated only by one-way operation reference | Slow or timed-out financial workflow. |

## Missing instrumentation before operated hosting

- HTTP request count/latency/status class and MCP session lifecycle are not exported to OpenTelemetry.
- OAuth link/callback/refresh/revoke results are not yet emitted to an operator backend.
- No exporter, collector, sampling policy, dashboard, trace backend, or metrics backend has been selected.
- No service owner, availability objective, paging policy, support hours, or incident system has been named.
- No restore-drill or hosted persistence measurement exists.

## Alert-design gate

Do not create production alerts from the current local event file. Every future alert must name the user impact, SLI or symptom, threshold and evaluation window, owner, routing destination, and tested playbook. Start with externally observable availability/auth failures and confirmed-operation manual-review rate. Instrumentation health must be monitored separately so missing telemetry is not mistaken for health.

## Privacy and cardinality rules

- Use OpenTelemetry semantic conventions where an applicable stable convention exists; put connector-specific low-cardinality fields under a project namespace.
- Never attach receipt facts, ZenMoney payloads, account/category/transaction identifiers, OAuth subjects, bearer credentials, filenames, or arbitrary errors to logs, spans, events, or metrics.
- Operation references remain one-way and bounded; do not use them as metric labels.
- Keep `operationKind`, phase, outcome, HTTP method/route template, and allowlisted failure code bounded.
- Any future exporter is disabled until its destination, retention, access control, region, deletion, and incident handling are recorded.
