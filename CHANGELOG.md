# Changelog

## 0.5.0 — 2026-08-16

- Make receipt date and paying-account inputs optional for matching and new-expense previews.
- Suggest the MCP host's local current date when the receipt date is not identified.
- Recommend an active paying account from semantic hints, bounded payee/category history, recent use, or a deterministic fallback.
- Return only inferred date/account values in `suggestedFields` with basis and confidence while preserving exact preview confirmation.

## 0.4.0 — 2026-08-15

- Add preview/confirm MCP flows to create, rename, reparent, restore, and retire ZenMoney categories.
- Expose category visibility, budget behavior, retirement state, and concurrency versions through a sanitized projection.
- Enforce one-level hierarchy, sibling-title uniqueness, active-parent, stale-version, and explicit-retirement safety checks.
- Add current-session receipt line-item evidence rules for optional, durable-purpose granularity suggestions without persisting receipts.
- Add an explicit guarded refresh path for installed ZenMoney agent skills.
- Keep category deletion and bulk historical consolidation out of the public MCP surface pending crash-safe migration support.

## 0.3.1 — 2026-08-15

- Add an everyday agentic Codex usage guide and roadmap the separately hosted/public connector track.
- Make receipt attachments and short intents automatically expand into proactive receipt, category-review, and savings workflows.
- Install the three workflow skills during Codex setup so fresh sessions load the high-level behavior.

## 0.3.0 — 2026-08-15

- Add durable agent handoff, roadmap, decisions, architecture, traceability, and release gates.
- Add agent-safe dry-run/install, secure macOS auth, structured doctor/schema, and private ChatGPT tunnel lifecycle commands.
- Add checksum-verified installer for the official OpenAI tunnel client.
- Add CI, dependency policy, security/contribution guidance, and Diátaxis-oriented documentation.
- Add bounded per-instrument spending insights and an evidence-based savings-review skill.

## 0.2.0 — 2026-08-15

- Add receipt expense creation and exact existing-expense reconciliation/splitting.
- Add preview/confirmation, post-write verification, idempotency, scoped compensation, and opt-in synthetic live E2E cleanup.

## 0.1.0 — 2026-08-14

- Add bounded ZenMoney reads, receipt matching, category-only preview/apply, category summaries, local MCP packaging, and credential redaction.
