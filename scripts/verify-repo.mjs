#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const required = [
  "AGENTS.md",
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "docs/getting-started.md",
  "docs/how-to/install-with-agent.md",
  "docs/how-to/private-chatgpt.md",
  "docs/reference/cli.md",
  "docs/reference/mcp-tools.md",
  "docs/project/STATUS.md",
  "docs/project/ROADMAP.md",
  "docs/project/DECISIONS.md",
  "docs/project/TRACEABILITY.md",
  "docs/project/DEFINITION_OF_DONE.md"
];

const failures = [];
for (const file of required) {
  try {
    const content = await readFile(resolve(root, file), "utf8");
    if (!content.trim()) failures.push(`${file} is empty`);
  } catch {
    failures.push(`${file} is missing`);
  }
}

const [manifest, plugin, versionSource] = await Promise.all([
  readFile(resolve(root, "package.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, ".codex-plugin/plugin.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "src/version.ts"), "utf8")
]);
if (manifest.version !== plugin.version) failures.push("package.json and plugin.json versions differ");
if (!versionSource.includes(`\"${manifest.version}\"`)) failures.push("src/version.ts differs from package.json");
if (!manifest.private) failures.push("npm package publishing must remain disabled until a release decision is recorded");

const result = { schemaVersion: "1", command: "verify-repo", ok: failures.length === 0, checkedFiles: required.length, failures };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
