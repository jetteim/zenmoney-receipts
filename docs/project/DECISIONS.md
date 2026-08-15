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
