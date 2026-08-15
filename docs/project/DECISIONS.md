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
