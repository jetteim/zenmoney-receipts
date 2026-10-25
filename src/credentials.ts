import { execFileSync } from "node:child_process";
import { userInfo } from "node:os";

export const KEYCHAIN_SERVICE = "zenmoney-receipts";

export interface CredentialResult {
  token: string | null;
  source: "environment" | "macos-keychain" | "hosted-encrypted" | "missing";
  diagnostic?: "environment" | "keychain" | "keychain-unavailable" | "account-unavailable" | "unsupported-platform";
}

function keychainAccount(): string | undefined {
  try {
    const username = userInfo().username.trim();
    if (username && !/^\d+$/.test(username)) return username;
  } catch {
    // Directory Services may be unavailable inside an agent process.
  }
  for (const value of [process.env.USER, process.env.LOGNAME]) {
    const username = value?.trim();
    if (username && /^[A-Za-z_][A-Za-z0-9_.-]*\$?$/.test(username)) return username;
  }
  return undefined;
}

export function resolveCredential(): CredentialResult {
  const environmentToken = process.env.ZENMONEY_ACCESS_TOKEN?.trim();
  if (environmentToken) {
    return { token: environmentToken, source: "environment", diagnostic: "environment" };
  }

  if (process.platform === "darwin") {
    const account = keychainAccount();
    if (!account) return { token: null, source: "missing", diagnostic: "account-unavailable" };
    try {
      const token = execFileSync(
        "/usr/bin/security",
        [
          "find-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          account,
          "-w"
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 }
      ).trim();
      if (token) {
        return { token, source: "macos-keychain", diagnostic: "keychain" };
      }
    } catch {
      // Never return raw Keychain errors or credential data in diagnostics.
    }
    return { token: null, source: "missing", diagnostic: "keychain-unavailable" };
  }

  return { token: null, source: "missing", diagnostic: "unsupported-platform" };
}

export function credentialStatus(): Omit<CredentialResult, "token"> & { configured: boolean } {
  const credential = resolveCredential();
  return {
    configured: credential.token !== null, source: credential.source,
    ...(credential.diagnostic ? { diagnostic: credential.diagnostic } : {})
  };
}
