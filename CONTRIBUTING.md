# Contributing

Read `AGENTS.md` and the project files under `docs/project/` before choosing work. Create focused changes tied to a roadmap ID or add a traced roadmap entry first.

```bash
npm ci
npm run check
git diff --check
```

Use synthetic fixtures only. Never commit personal receipts, credentials, raw ZenMoney responses, or financial exports. Live read-only testing is allowed only against your own account. Live write testing requires explicit current authorization, uses the opt-in environment guard documented in the README, and must verify cleanup of the exact generated IDs.

Keep MCP changes bounded and backward-conscious. New mutation capability requires preview/apply separation, explicit confirmation, concurrency semantics, idempotency, verification, compensation/recovery analysis, safety annotations, and adversarial tests.
