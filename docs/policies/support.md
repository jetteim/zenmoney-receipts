# Support policy template

Status: incomplete. Public deployment is blocked until an operator and contact are named.

Support contact: `[EMAIL OR FORM]`

Security contact: `[SECURITY EMAIL]`

Supported hours/timezone: `[HOURS]`

Initial response target: `[TARGET]`

Before contacting support, run `zenmoney-receipts support-bundle`, review the JSON, and attach only that sanitized output plus a short description and timestamp. Never attach receipts, OCR, credentials, environment dumps, raw ZenMoney exports, raw MCP transcripts, or screenshots containing financial data.

For an interrupted write, include the operation ID and recovery classification. Do not include target IDs unless the classification is `manual-review` and the support channel is approved for financial metadata.

Security reports must follow `SECURITY.md`. Suspected credential exposure is urgent: revoke the identity-provider session, unlink/revoke ZenMoney, remove the ChatGPT connection, and notify the security contact.

Supported release window, end-of-life policy, incident severity definitions, status page, escalation path, and data-deletion SLA: `[COMPLETE BEFORE PUBLICATION]`.
