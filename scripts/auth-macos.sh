#!/bin/zsh
set -eu

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "This helper uses macOS Keychain. On other platforms, provide the credential only in the MCP process environment."
  exit 2
fi

/usr/bin/security add-generic-password -U -a "$(id -un)" -s zenmoney-receipts -w
print "Stored the credential in macOS Keychain service zenmoney-receipts."
print "Next: npm run doctor:live"
