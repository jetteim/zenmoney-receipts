# Decision log

## D-019 — Observable self-awareness, one capability per commit

Decision: implement F-021 through F-026 sequentially with additive structured contracts and a verified commit per capability. Attribute only server-observable decisions; caller inputs are not independently verified receipt facts. Keep human consent and host skill loading explicitly outside server observation.

Decision: preference memory will be a separate default-off local store with a finite allowlist of categorical preferences, exact preview/confirmation, and conflict-safe controls. It will advise future host decisions, never rewrite financial records or persist arbitrary chat/receipt text. Hosted mode will report local preferences unsupported rather than reading an operator's personal store.

Reason: self-description should expose verifiable state and uncertainty, not invent awareness or silently learn user behavior. User authorized all six capabilities and per-capability commits; live financial writes remain unauthorized.

## D-018 — Map behavior ownership separately from deployment

Decision: maintain a source-linked behavior architecture explanation alongside the existing C4/deployment and security views. Use a component diagram to separate host reasoning and advisory instructions from executable interfaces/domain rules, a receipt sequence to show handoffs, and a lookup table to locate each behavior's owner. Link stable source paths and function names rather than duplicating implementation listings.

Reason: “MCP behavior” may originate in initialization prose, tool descriptions, input schemas, service logic, returned guidance, or the upstream API. A deployment diagram alone cannot distinguish these causes. The requested diagrams safely assume an audience of users/maintainers diagnosing the existing connector; no runtime redesign is needed.

Consequences: document host-dependent instruction loading, confirmation as a caller assertion, code-calculated readiness followed by host-initiated review, and separate local/hosted storage. Keep this source map current when those boundaries change. Diagrams describe implementation, not evidence of live deployment or model adherence.

## D-017 — Explain evidence locality and offer separate remote candidate notes

Decision: add bounded storage self-awareness to the existing receipt/category skills, MCP instructions, and user documentation. At first relevant use in a session, report receipt-memory status, retention, and the actual returned location; repeat if settings/location change or the user asks to save elsewhere. Explain local MCP-machine storage versus hosted tenant-server storage. A clone does not carry personal evidence and receipt memory does not synchronize to ZenMoney.

Decision: keep personal evidence, category candidates, and spending summaries outside the checkout, including ignored files and project handoff artifacts. `docs/evidence/` means sanitized engineering verification only. When managed memory is unavailable/disabled, continue using current-context evidence without a fallback store. This is agent guidance, not a new filesystem restriction.

Decision: offer optional short ZenMoney transaction comments containing receipt-supported purpose labels when remote category-candidate tracking is useful. Explain remote storage and independence from local retention/deletion. Existing comments remain manual ZenMoney edits; only independently needed new-receipt creation can carry an optional note through its existing exact preview/confirmation flow. Show the comment verbatim alongside the financial preview; changed text requires a fresh preview and confirmation. Use receipt-level wording because one comment is repeated on each created part. Never duplicate an expense to save a note.

Reason: the repository is shareable development context, while receipt evidence is private user data. Remote notes can preserve an advisory candidate across devices without uploading local evidence or adding a generic comment-write tool. Comments neither create taxonomy nor count toward the managed memory's readiness threshold.

Consequences: no storage defaults, financial mutations, memory schema, or readiness calculations change. Hosts receive guidance; its delivery is covered by the existing MCP contract/smoke checks, but host-model adherence and live comment persistence require separate evaluation.

## D-001 — Private connection, public source

Decision: distribute source for cloning while every ZenMoney connection remains private to the installing user. Public discoverability is optional and is not needed for a private hosted ChatGPT connection.

Reason: this matches the intended personal setup and avoids central custody of financial credentials/data.

## D-002 — Local stdio plus OpenAI Secure MCP Tunnel (retired)

Decision: Codex/Claude use local stdio. ChatGPT uses an outbound-only private tunnel to the same stdio server.

Status: superseded by D-007 and D-011. All repository tunnel tooling and active instructions were removed. This entry is retained only as decision history.

## D-003 — Human-mediated credential handoff

Decision: macOS users enter the ZenMoney credential through a hidden Keychain helper; automation checks only configured/source status. Credentials are never accepted as CLI arguments or agent-chat content.

Consequences: setup intentionally pauses for one human action. Other platforms currently need process-environment injection.

## D-004 — Receipt-scoped mutations only

Decision: expose preview/apply pairs for category correction, reconciliation/split, and new receipt creation. Do not expose the upstream generic mutation/delete tools or category-structure writes.

Reason: a narrow semantic contract permits stronger validation, confirmation, idempotency, concurrency checks, and verification.

## D-005 — Repository is session memory

Decision: `AGENTS.md` defines request semantics; project status, roadmap, decision, traceability, and evidence files are required handoff artifacts.

Consequences: “proceed” is deterministic across ephemeral sessions, and each completed change updates repository truth.

## D-006 — Npm publishing remains disabled

Decision: version 0.3.0 is installed from a clone; `package.json.private` stays true until supply-chain ownership, release signing/provenance, and registry naming are explicitly decided.

Reason: public source cloning is sufficient and safer than an unplanned registry release.

## D-007 — Local Codex now; hosted ChatGPT as a separate product track

Decision: use the user-level local Codex stdio MCP for personal finance management now. Stop pursuing the laptop-hosted ChatGPT tunnel. Plan a separately hosted connector for later ChatGPT use and possible public distribution.

Consequences: the current personal workflow requires the Mac only while Codex is in use. Removing that dependency requires remote hosting; public distribution additionally requires multi-user MCP OAuth, an owned ZenMoney OAuth client, encrypted token lifecycle, tenant isolation, policies, operations, and publication review. This supersedes D-001 only where it called a public connector a permanent non-goal; no public connector exists today.

## D-008 — Bounded taxonomy writes, retirement instead of archive/delete

Decision: expose explicit preview/apply pairs for category creation, allowlisted update, and retirement. Preserve the D-004 prohibition on generic patch/delete tools, but supersede its blanket prohibition on category-structure writes.

Reason: explicit user demand now exists, and the pinned backend provides optimistic-concurrency tag writes. ZenMoney tags support one-level parents and visibility/budget fields but no archive field. Retirement therefore sets all income/expense/budget selection flags to false while preserving IDs and historical references.

Consequences: agents may rename, reparent, restore, or retire only after showing an exact preview and receiving confirmation. Category consolidation is now available only through the dedicated journaled workflow described by D-015; generic deletion remains prohibited.

## D-009 — Suggest missing receipt date/account inside the preview

Decision: do not interrupt a no-match receipt workflow merely because its date or paying account was not identified. Suggest the MCP host's local current date and rank an eligible account from a semantic hint, bounded payee/category usage, recent use, or a deterministic fallback. Return only inferred fields in `suggestedFields` with basis and confidence.

Reason: the exact preview already provides a safe, fast correction point. A separate date/account question adds friction without adding more protection than showing and confirming the selected values.

Consequences: hosts must omit unidentified values rather than inventing them, visibly mark every returned suggestion, and bind the suggested date/account into the same short-lived preview token. Existing expense account/date fields remain immutable, and ambiguous transaction matches still require clarification.

## D-010 — Opt-in minimal local receipt evidence with automatic review readiness

Decision: keep receipt memory disabled by default and retain only exact user-previewed narrow purpose, current category ID, receipt month, item count, supported subtotal, instrument, timestamp, and a SHA-256 receipt idempotency key. Reject broad durable purposes such as `Produce`, `Groceries`, `Food`, and `Other`; never store raw receipt/OCR, merchant/product/brand/SKU text, transaction IDs, credentials, or raw ZenMoney responses. Record only after a verified financial apply.

Decision: use one versioned JSON state file with atomic fsync/rename writes, a fixed-root exclusive lock, POSIX `0700`/`0600` permissions, 180-day default retention (30–730 configurable), 1,000-record and 4 MiB caps, exact inspect/delete/purge controls, and fail-closed corruption/symlink handling. Reads do not silently mutate state; retention compaction happens during confirmed settings changes or a new verified record.

Decision: trigger read-only category review readiness after the same normalized narrow purpose appears in three distinct active receipts for one current category ID and instrument. Readiness never authorizes taxonomy mutation.

Reason: transaction-level `Groceries` is too coarse to discover durable receipt-line groupings across ephemeral sessions, while storing artifacts or raw OCR creates unnecessary privacy and injection risk.

Consequences: the local file can still reveal habits and is not application-encrypted; the single-user release relies on OS account/disk protection and explicit retention/deletion. Hosted or multi-user storage must add encryption and tenant isolation. Memory failure never compensates or rolls back a ZenMoney operation that already verified.

## D-011 — Direct hosted HTTP, never a laptop tunnel

Decision: remote ChatGPT access uses a separately deployed Streamable HTTP MCP resource server at `/mcp`. Local Codex/Claude continue to use stdio. The repository contains no tunnel installer, runtime manager, or tunnel setup path.

Decision: the initial deployment profile is a paid single-instance Render Docker service with a persistent encrypted disk. An external OAuth authorization server authenticates MCP clients; the connector verifies bearer tokens and binds every MCP session to the authenticated subject. Public listing is a later, separate decision.

Consequences: a deployed private connector works while the laptop is off. The operator owns service availability, cost, policy, deletion, secrets, monitoring, and incident response. Disk-backed state and in-memory sessions prohibit horizontal scaling until shared state/session routing is designed.

## D-012 — Minimal persistent operation receipts

Decision: persist a deterministic operation ID, phase, write-attempt count, target IDs, and one-way plan/before/expected fingerprints before and during supported multi-step writes. Never persist preview tokens, amounts, category names, receipt text, credentials, or raw ZenMoney responses.

Consequences: after restart the user can list privacy-safe records and explicitly inspect one against current ZenMoney state. The connector classifies it as not started, completed, compensated, or manual review instead of blindly replaying a write. Journal retention is bounded to 30 days and 200 records with private permissions.

## D-013 — Allowlisted support diagnostics

Decision: operational events use a closed schema of component, phase, outcome, operation kind, one-way operation reference, duration, and allowlisted code. The support bundle includes runtime and bounded status only; it excludes paths, IDs, amounts, labels, receipt text, tenant subjects, tokens, and raw errors.

Consequences: the local doctor can detect corrupt recovery/event stores without making support logs a financial-data export. This is not a substitute for a hosted telemetry backend or SLO program.

## D-014 — Hosted OAuth custody

Decision: hosted MCP client authentication and ZenMoney authorization are distinct boundaries. The MCP resource server validates introspected OAuth tokens (`issuer`, `audience`, `subject`, `scope`, expiration). Each subject receives a separate AES-256-GCM ZenMoney credential envelope and HMAC-derived storage namespace. Link state is one-time, short-lived, and S256-PKCE-bound; unlink is exact-previewed and attempts upstream revocation before local deletion.

Consequences: deployment must stop if the owned ZenMoney client cannot support the verified flow; it may not downgrade to shared personal credentials. The master key derives separate encryption and lookup keys and requires deliberate envelope migration when rotated. Ordinary unlink removes only the credential; a separate destructive preview is required to revoke/unlink and permanently delete the authenticated tenant's connector state.

## D-015 — Fail-closed category consolidation

Decision: category consolidation is a dedicated exact workflow, not generic patch/delete. It discovers all transactions, reminders, reminder markers, and budgets from a full reference snapshot; migrates supported references; retires the source last; re-reads and verifies; and uses the persistent journal plus concurrency-safe compensation.

Decision: any source budget reference blocks the preview from producing an apply token because authoritative budget move/delete semantics are unavailable in the pinned backend/current documentation.

Consequences: the connector never produces an incorrect partial merge. The user can clear or move source budgets in ZenMoney and request a fresh preview.

## D-016 — Synthetic extraction contract, honest accuracy boundary

Decision: keep a source-controlled, fully synthetic receipt-facts corpus spanning image/PDF shapes, discounts, currencies, ambiguous/partial input, refunds, tax/tip, and multiple totals. The deterministic runner measures contract parsing and ambiguity behavior.

Consequences: the pack prevents integration regressions without committing user receipts. It must never be presented as proof of OCR or model accuracy; such a claim needs a separately governed representative evaluation set and named host model/version.
