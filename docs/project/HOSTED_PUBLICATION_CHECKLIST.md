# Hosted publication checklist

This is a gate, not a progress narrative. Every item needs dated evidence and an owner before public general availability.

## Product and identity

- [ ] Owned ZenMoney OAuth client approved with exact production redirect URI.
- [ ] Live authorization-code, state, S256 PKCE, refresh, revocation, and relink paths verified without exposing credentials.
- [ ] Identity provider publishes OAuth metadata, supports the selected OpenAI client-registration mode, and echoes the MCP resource into the audience.
- [ ] Token issuer, audience, expiration, scope, and tenant-subject negative tests pass in staging.

## Data and security

- [ ] Threat model reviewed by a named owner.
- [ ] Hosting region and sub-processors recorded.
- [ ] `ZENMONEY_HOSTED_MASTER_KEY` stored, backed up, and rotation procedure tested.
- [ ] Persistent-disk restore drill passes; receipt memory, journal, and event stores survive restart/deploy.
- [ ] Cross-tenant session, storage, OAuth state, unlink, and deletion tests pass.
- [ ] Hosted-data deletion is exercised against staging, its namespace absence is verified, and the partial-failure operator cleanup path is rehearsed.
- [ ] Edge request/body/rate limits and abuse response are configured.
- [ ] Dependency audit and container scan are clean at the release commit.

## Financial safety

- [ ] Offline adversarial and crash-point tests pass.
- [ ] Live read-only sync passes against the owned client.
- [ ] Separately authorized synthetic create/reconcile/consolidation/cleanup tests pass with exact cleanup evidence.
- [ ] Budget-referenced consolidation remains blocked until authoritative semantics and live evidence exist.
- [ ] Recovery classifications are exercised across a real process restart; `manual-review` prevents replay.

## Operations

- [ ] Named service owner, on-call/escalation path, and support contact exist.
- [ ] Availability objective chosen with explicit acceptance of the single-disk-instance limitation, or all state migrated to multi-instance transactional storage.
- [ ] Dashboard and alert rules have owner, user impact, threshold/window, and playbook links.
- [ ] Billing alerts and a current monthly cost estimate are recorded.
- [ ] Backup, restore, credential-revocation, incident, and tenant-deletion runbooks are rehearsed.

## Policy and client evidence

- [ ] Privacy, terms, and support templates contain no placeholders and have appropriate review.
- [ ] MCP Inspector discovers every intended tool with accurate annotations and exercises error/confirmation paths.
- [ ] Private ChatGPT staging connection discovers the intended tools and completes both OAuth layers.
- [ ] Receipt/category/savings evaluation prompts and results are retained for comparison.
- [ ] OpenAI submission/review requirements are rechecked against current official documentation.

## Release

- [ ] Version, changelog, package, plugin manifest, docs, Docker image, and Git tag agree.
- [ ] `npm run check`, hosted HTTP integration, `git diff --check`, and CI pass at the release commit.
- [ ] Rollback build and credential-revocation plan are ready.
