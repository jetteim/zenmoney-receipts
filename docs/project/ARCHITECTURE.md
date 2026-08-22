# C4 architecture views

## System context

The user owns the receipt and ZenMoney account. A local agent host or private ChatGPT connection extracts receipt facts and invokes this connector. The connector makes bounded calls to ZenMoney. Receipt bytes never cross the connector boundary.

## Containers

```text
Local:
[Receipt + user] → [Codex / Claude] → stdio → [MCP wrapper]
                                              ├→ [private pinned backend] → [ZenMoney API]
                                              └→ [private local state]

Hosted (separate deployment; no tunnel):
[Receipt + user] → [ChatGPT / MCP client] → HTTPS /mcp → [Hosted MCP resource server]
                                                      ├→ [external OAuth AS]
                                                      ├→ [tenant MCP wrapper/backend] → [ZenMoney API]
                                                      └→ [encrypted credential store + private durable state]
```

The local token comes from macOS Keychain or the process environment. Hosted ZenMoney credentials are AES-256-GCM envelopes keyed by an operator secret and separated by an HMAC of the authenticated tenant subject. A configured PostgreSQL store can hold encrypted credential/state envelopes; receipt memory, journals, and events still require the persistent disk in the initial single-instance profile.

## Components

- `server.ts`: bounded MCP schemas, safety annotations, hosted-only authorization lifecycle tools.
- `service.ts`: matching, validation, exact preview/apply orchestration, post-write verification, and recovery classification.
- `receipt-operations.ts`: reconciliation/create plans and concurrency-safe compensation.
- `category-consolidation.ts`: complete reference discovery, fingerprinting, migration, verification, and compensation.
- `operation-journal.ts`: private, bounded, minimal crash-state records.
- `observability.ts` and `support-bundle.ts`: allowlisted local support signals.
- `receipt-defaults.ts`: host-local date and bounded account recommendation.
- `receipt-memory-store.ts` / `receipt-memory.ts`: opt-in bounded narrow-purpose evidence and exact local controls.
- `taxonomy-operations.ts`: allowlisted taxonomy plan and retirement logic.
- `backend.ts`: private child lifecycle, credential boundary, sanitized full-reference snapshot, and upstream calls.
- `hosted-server.ts`, `hosted-auth.ts`, `hosted-oauth-tools.ts`, `zenmoney-oauth.ts`: direct HTTP transport, resource-server validation, tenant/session isolation, and ZenMoney linking.
- `hosted-credential-store.ts`, `postgres-credential-store.ts`: encrypted per-tenant credential/state persistence.
- `cli.ts` and `scripts/`: local installation, schema, doctor, support bundle, evaluation, and validation.

## Receipt write sequence

```text
Host → service: sync + select exact source/account/categories
Host → preview: structured receipt plan
service → host: before/after + marked suggestions + operationId + short-lived token
User → host: explicit confirmation
Host → apply: exact token + confirmed=true
service → journal: applying / write attempt
service → ZenMoney: bounded write(s)
service → ZenMoney: re-sync and verify
service → journal: completed, compensated, or manual-review
service → receipt memory: retain approved evidence only after verification
service → host: verified result + recovery/readiness state
```

If a process disappears after a write starts, a new session lists the minimal journal record and uses read-only recovery inspection before any retry. Unapplied preview tokens remain process-local and expire.

## Consolidation sequence

The service reads a complete bounded reference snapshot, blocks if source budgets exist or reference bounds are exceeded, and previews exact counts. After confirmation it rechecks taxonomy versions and reference fingerprints, updates transactions/reminders/markers, retires the empty source last, then re-reads and proves that no source reference remains. Scoped reverse operations use acknowledged concurrency versions; an incomplete reverse becomes manual review.

## Hosted authentication sequence

The external authorization server authenticates the MCP client. The hosted resource server introspects the bearer token and verifies issuer, audience, subject, scope, and expiration before creating or reusing a subject-bound MCP session. ZenMoney authorization is initiated separately through a one-time state/PKCE URL; the callback exchanges the code and stores only the encrypted tenant credential. See `docs/explanation/hosted-architecture.md` for the threat model and deployment view.
