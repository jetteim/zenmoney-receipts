# C4 architecture views

## System context

The user owns the receipt, ZenMoney account, local agent host, and optional ChatGPT workspace. The host extracts receipt facts and invokes this connector. The connector calls ZenMoney. OpenAI Secure MCP Tunnel is a transport boundary only for private ChatGPT use.

## Containers

```text
[Receipt + user]
       |
       v
[Codex / Claude / ChatGPT host]
       | local stdio, or private outbound tunnel
       v
[zenmoney-receipts MCP process]
       | private child stdio
       v
[@nonnname/zenmoney-mcp backend] ---> [ZenMoney /v8/diff API]

[macOS Keychain or process environment] -- credential --> MCP/backend processes
```

No repository component stores receipt files or a long-lived financial snapshot. Preview/application state is currently process-local.

## MCP components

- `server.ts`: bounded schemas, safety annotations, sanitized MCP responses.
- `service.ts`: matching, validation, preview/apply orchestration, post-write verification.
- `receipt-operations.ts`: exact reconciliation/create plans and compensating actions.
- `receipt-defaults.ts`: host-local date resolution and bounded deterministic account recommendation.
- `taxonomy-operations.ts`: allowlisted category plans, exact comparison, and retirement-state derivation.
- `direct-write.ts`: complete receipt-create API shape.
- `backend.ts`: private child MCP lifecycle and concurrency-aware upstream calls.
- `credentials.ts`: environment/Keychain credential boundary.
- `cli.ts` and `scripts/`: agent installation, diagnostics, and private-tunnel lifecycle.

## Dynamic write sequence

```text
Host → service: sync + select exact source/account/categories
Host → preview tool: structured receipt plan
service → host: before/after + marked suggestions + signed/opaque short-lived token
User → host: explicit confirmation
Host → apply tool: token + confirmed=true
service → backend/ZenMoney: bounded write(s)
service → backend/ZenMoney: re-sync and verify
service → host: verified result, or scoped compensation/manual-review state
```

Taxonomy mutations use the same preview/confirm sequence but call only the upstream tag create/update verbs. The service re-resolves the exact category version, sibling names, parent depth, parent activity, and child state immediately before writing. Retirement changes four visibility/budget flags and preserves category/transaction IDs; no category delete or bulk retag component exists.

F-005 will add a minimal permission-restricted operation journal between apply phases so crash recovery does not rely solely on process memory.
