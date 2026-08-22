# Privacy notice template

Status: not effective. Public deployment is blocked until the operator replaces every bracketed field and obtains appropriate legal review for the intended users and jurisdictions.

Operator: `[LEGAL NAME]`

Contact: `[PRIVACY EMAIL]`

Effective date: `[DATE]`

Hosting region: `[REGION]`

## Data processed

The service processes structured receipt facts supplied by the user’s MCP host and the minimum ZenMoney account, category, transaction, reminder, reminder-marker, and budget data needed for requested workflows. Receipt images/PDFs and raw OCR are not uploaded to this service.

It stores encrypted ZenMoney OAuth access/refresh credentials; per-tenant crash-recovery fingerprints and target IDs; opt-in sanitized receipt-purpose evidence; and allowlisted operational events. It does not intentionally store raw receipts/OCR, product/brand/SKU text, raw ZenMoney responses, prompts, access credentials in logs, or financial values in support bundles.

## Purpose and legal basis

Data is processed only to provide user-requested receipt categorization, category review/management, spending analysis, authorization, safety verification, recovery, and support. The operator must state the applicable legal basis here: `[LEGAL BASIS]`.

## Retention and deletion

Receipt evidence defaults to 180 days when explicitly enabled and can be inspected, deleted individually, or purged. Recovery metadata is retained for up to 30 days. Operational events retain the latest 500 allowlisted records. OAuth credentials remain until unlink, revocation, account deletion, or operator action. Platform snapshots may retain deleted data for `[SNAPSHOT RETENTION]` before expiry.

Requests for access or deletion: `[PROCESS AND SLA]`. The hosted connector exposes an exact-previewed tenant-data deletion tool that revokes/unlinks the credential and removes the authenticated tenant's receipt memory, recovery journal, and operational-event namespace without deleting ZenMoney financial data. The operator must verify deletion, handle any partial failure, and document when platform snapshots expire.

## Sub-processors and transfers

Identity provider: `[NAME / REGION / POLICY LINK]`

Hosting provider: `[NAME / REGION / POLICY LINK]`

ZenMoney: financial-data provider selected by the user

OpenAI/other MCP host: receives tool metadata/results according to the user’s account and provider terms

List international transfer mechanisms and safeguards: `[DETAILS]`.

## Security and incidents

Credentials are encrypted with AES-256-GCM and isolated by a per-tenant HMAC namespace. Transport uses HTTPS. Financial writes require exact preview, explicit confirmation, optimistic concurrency, and verification. Report suspected incidents to `[SECURITY CONTACT]`; the operator’s notification process is `[INCIDENT PROCESS]`.

## User choices

Users can decline receipt memory, unlink ZenMoney, remove the ChatGPT connection, and request deletion. Taxonomy and financial mutations are never inferred from consent to data processing; each write requires its own exact confirmation.
