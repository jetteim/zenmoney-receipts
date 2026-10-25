# Publication verification — F-030, F-031, F-032

Recorded: 2026-10-25T19:19:49Z, after completion of the checks below.
Target: local repository publication of full-price evidence, allowlisted marketplace packaging and the credential-aware Codex launcher. This is a source publication check, not a release or hosted deployment. F-025/F-026 remain paused.

## Commands and results

- `npm run setup:plan`: passed; dry-run only, no installation or registration changes.
- `npm run doctor -- --output json`: passed runtime, build, credential discovery, registration and storage checks. This call does not test live access.
- `npm run check`: exit 0; 105 application tests passed, one opt-in hosted test skipped; typecheck/build, correction CLI synthetic checks, 39-tool MCP smoke, private backend process smoke, ten synthetic receipt fixtures, repository checks, six skill-evaluator tests and three skill package checks passed. Output: `/private/tmp/zenmoney-prepush-check.log`.
- `npm run doctor:live`: the sandboxed attempt found the environment credential but failed its API request. An approved outside-sandbox retry exited 0 and passed `live.zenmoney-readonly`. Output from the successful retry: `/private/tmp/zenmoney-prepush-doctor-live.log`. No financial records were printed or changed.
- `python3 scripts/package-agensi.py`: passed; all three text-only allowlisted ZIPs passed integrity, archive-path and relative-link validation. The receipt package checksum matches the previously recorded submission. Generated archives remain ignored under `artifacts/agensi/`.
- The initial commit was blocked by the global scanner treating a dynamic credential-property assignment as a literal secret. The launcher now reuses one environment-variable-name constant for both MCP forwarding and the child environment. No credential value or scanner exemption was added. The full offline check passed again after this refactor; `python3 /Users/maximlee/.config/git/hooks/scan-staged.py` passed, as did targeted staged checks for active credential values, common credential formats and personal receipt-evidence identifiers. Only filenames, rule names and pass/fail results were emitted by the targeted scan.
- `gh auth status` and repository permission lookup: authenticated account has push access. `git push --dry-run origin HEAD:main` authenticated successfully before preparation; remote publication is verified separately after the commit.

Diagnostic signals: `auth.zenmoney`, `live.zenmoney-readonly`, `credentialSource` and `credentialDiagnostic`. No metric or trace series was added. The launched MCP session verified environment-based credentials and live synchronization; original restricted-process direct Keychain access is not claimed repaired.

## Boundaries and rollback

No financial writes, receipt-memory changes, secret configuration edits, hook changes, deployment or marketplace resubmission were performed for this publication check. Personal receipts, evidence groups and financial exports remain outside the checkout; this file contains engineering verification only.

Rollback: revert the publication commit through ordinary Git history and rebuild the previous source. Stop the optional launched CLI session to end its process-local credential forwarding. Stored receipt evidence and the existing Keychain entry are independent of the code revert. Hosted deployment, OAuth verification, other-host compatibility and current marketplace approval remain unverified.
