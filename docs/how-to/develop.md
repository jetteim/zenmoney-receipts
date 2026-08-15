# How to continue development in an ephemeral session

Every session starts from repository state, not remembered chat history.

## Resume the next item

Open the repository in an agent and say:

> Read AGENTS.md and proceed.

The agent should select the first unblocked `Ready / Now` roadmap item, state its ID and safety envelope, implement it, verify it, and update the durable handoff files.

## Add an idea without implementing it

Say:

> Read AGENTS.md. Add “<idea>” to the roadmap. Do not implement it.

The resulting entry must include an ID, outcome, acceptance evidence, dependencies, risks, and traceability links. Ideas remain in `Later / Ideas` until their dependencies and acceptance evidence are clear.

## Before ending any implementation session

```bash
npm run check
git status -sb
git diff --check
```

Update `docs/project/STATUS.md`, `ROADMAP.md`, and `TRACEABILITY.md`. Record a durable design choice in `DECISIONS.md`. Live writes require explicit authorization in the current conversation, even if an older evidence log contains authorization.

If a change updates the bundled agent workflows, refresh the locally installed copies and start a new session:

```bash
npm run skills:install -- --refresh
```

Use a focused commit. Never commit `.env`, tokens, raw receipts, financial exports, or unsanitized live logs.
