# Troubleshoot safely

Start with the structured doctor. It checks the runtime, build, credential source, Codex registration, receipt-memory store, crash-recovery journal, and privacy-safe event store. It does not print financial records.

```bash
npm run build
node dist/cli.js doctor
```

Add `--live` only for a read-only ZenMoney synchronization check. If authentication fails in an agent sandbox but the status says Keychain is configured, run the doctor from the same trusted interactive terminal that launches the MCP host; macOS may deny Keychain access to a different process context.

## Terminal passes but the agent cannot read Keychain

A passing terminal doctor and a failing agent doctor are different process observations. Check `credentialDiagnostic` on connection status. `account-unavailable` means no usable account name was found; `keychain-unavailable` means the lookup returned no usable credential in that process. Neither proves an expired token. Only an upstream authentication response tests the credential itself.

The loader first uses the macOS account name, then validated USER/LOGNAME when Directory Services is unavailable. If Terminal can read Keychain but the agent still cannot, run this from the project directory in that trusted Terminal:

```sh
npm run codex
```

The launcher builds the connector, reads the existing credential privately and starts a new Codex CLI session. It passes the value through child-process environment only and adds a process-local `mcp_servers.zenmoney-receipts.env_vars` override containing only the variable name. No token copying, shell-history credential, permanent config edit or policy disabling is needed. Existing sessions cannot inherit a newly launched process's environment. In the new session, verify connection status and read-only sync before receipt handling. The launcher needs the existing local MCP registration; it does not repair a wrong server path or install the Codex CLI.

Use this only with a trusted local host: environment credentials are accessible to code that inherits them. Stop that launched Codex session to end the override; launch Codex normally to return to direct Keychain discovery. Never paste tokens into chat. Keep secret-scanning hooks enabled. The observed hook only gives feedback about secret-like output; it does not grant macOS Keychain access.

[Official MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) documents `env_vars` forwarding. Other application/remote executor launches need their own supported secret injection boundary; this CLI launcher does not retrofit their environment.

## Interrupted write

Use the `operationId` from the preview/result with `zenmoney_inspect_operation_recovery`. Interpret it literally:

- `completed`: do not repeat the write.
- `not-started`: create a fresh preview.
- `compensated`: the prior state was restored; create a fresh preview.
- `manual-review`: inspect only the exact returned target IDs and do not write again until resolved.

Recovery compares one-way fingerprints; it never returns amounts, categories, or raw journal data unless exact IDs are necessary for manual review.

## Support bundle

```bash
node dist/cli.js support-bundle
```

Review the JSON before sharing it. Its schema excludes credentials, raw errors, receipt/OCR text, financial values, category names, transaction IDs, tenant IDs, usernames, and local paths. Do not supplement it with raw MCP transcripts or environment dumps.

## Hosted failures

- `401` with `WWW-Authenticate`: verify resource metadata, issuer, exact audience `https://HOST/mcp`, expiry, and the `mcp:tools` scope.
- `403 session tenant mismatch`: discard the session and authenticate as the intended user; never reuse a session ID across subjects.
- ZenMoney link expired: call the link-begin tool again. One-time state expires after ten minutes and cannot be reused.
- Restart loses state: the host is not writing `ZENMONEY_HOSTED_DATA_DIR` to a persistent disk. Stop the service before accepting writes.
- Consolidation blocked by budgets: move or clear the named source category’s budgets in ZenMoney and create a fresh preview. The connector intentionally refuses partial migration.

The allowlisted operational events are diagnostic signals, not service-level objectives. No page-worthy alert is defined yet because this repository has no named production on-call owner, customer-impact threshold, dashboard, or approved playbook. Establish those before public general availability.
