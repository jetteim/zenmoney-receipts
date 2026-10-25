import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveCredential } from "./credentials.js";

const credentialEnvironmentVariable = "ZENMONEY_ACCESS_TOKEN";

export function launchCodex(args: string[]): number {
  const credential = resolveCredential();
  if (!credential.token) {
    process.stderr.write("Cannot access the ZenMoney credential. Run this launcher in your trusted Terminal where npm run doctor:live passes.\n");
    return 2;
  }
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  try {
    const result = spawnSync("codex", [
      "-C", repoRoot,
      "-c", `mcp_servers.zenmoney-receipts.env_vars=${JSON.stringify([credentialEnvironmentVariable])}`,
      ...args
    ], {
      stdio: "inherit",
      env: { ...process.env, [credentialEnvironmentVariable]: credential.token }
    });
    if (result.error) {
      process.stderr.write("Could not start Codex. Check that the Codex CLI is installed and available in PATH.\n");
      return 1;
    }
    return result.status ?? 1;
  } catch {
    process.stderr.write("Could not start Codex; no credential details are included in this error.\n");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = launchCodex(process.argv.slice(2));
}
