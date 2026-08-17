# Decision log

## D-001 — Private connection, public source

Decision: distribute source for cloning while every ZenMoney and ChatGPT connection remains private to the installing user. Do not build or advertise a public GPT/multi-user hosted connector.

Reason: this matches the intended personal setup and avoids central custody of financial credentials/data.

## D-002 — Local stdio plus OpenAI Secure MCP Tunnel

Decision: Codex/Claude use local stdio. ChatGPT uses an outbound-only private tunnel to the same stdio server.

Consequences: no inbound port/public server is needed; the local machine and tunnel process must remain online; ChatGPT setup requires separate organization/workspace permissions.

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

Consequences: agents may rename, reparent, restore, or retire only after showing an exact preview and receiving confirmation. Hard deletion and bulk historical consolidation remain excluded until `F-005` and `F-016` cover durable migration and every reference type.

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
