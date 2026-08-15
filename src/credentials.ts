import { execFileSync } from "node:child_process";
import { userInfo } from "node:os";

export const KEYCHAIN_SERVICE = "zenmoney-receipts";

export interface CredentialResult {
  token: string | null;
  source: "environment" | "macos-keychain" | "missing";
}

export function resolveCredential(): CredentialResult {
  const environmentToken = process.env.ZENMONEY_ACCESS_TOKEN?.trim();
  if (environmentToken) {
    return { token: environmentToken, source: "environment" };
  }

  if (process.platform === "darwin") {
    try {
      const token = execFileSync(
        "/usr/bin/security",
        [
          "find-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          userInfo().username,
          "-w"
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      ).trim();
      if (token) {
        return { token, source: "macos-keychain" };
      }
    } catch {
      // A missing or locked Keychain item is reported as an unavailable credential.
    }
  }

  return { token: null, source: "missing" };
}

export function credentialStatus(): Omit<CredentialResult, "token"> & { configured: boolean } {
  const credential = resolveCredential();
  return { configured: credential.token !== null, source: credential.source };
}
