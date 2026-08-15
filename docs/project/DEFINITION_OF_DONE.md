# Definition of done and release gates

A change is complete only when:

- its roadmap/story outcome and failure behavior are explicit;
- schemas and outputs are bounded, machine-readable where automated, and secret-safe;
- write changes preserve preview, explicit confirmation, concurrency validation, idempotency, and post-write verification;
- unit/contract/adversarial tests cover the changed boundary;
- `npm run check` and `git diff --check` pass;
- durable status, roadmap, traceability, and decisions are updated;
- remaining external verification is named rather than inferred.

A release additionally requires:

- clean dependency lockfile and zero known production vulnerabilities at release time;
- CI green on supported Node versions;
- sanitized evidence for read-only live compatibility after ZenMoney/backend changes;
- explicit fresh authorization plus verified cleanup for any live write E2E;
- version consistency across package, MCP server, and plugin manifest;
- rollback and credential-revocation instructions;
- no credentials, raw receipts, financial exports, or unsanitized logs in Git history.

Private ChatGPT readiness has two distinct gates: repository/tunnel tooling passes locally, then a human verifies tunnel association and the 16 discovered tools in the intended ChatGPT workspace. The first must never be reported as proof of the second.
