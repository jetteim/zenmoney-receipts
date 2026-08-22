import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function run(script: string, args: string[]) {
  return JSON.parse(
    execFileSync(process.execPath, [resolve(root, script), ...args], {
      cwd: root,
      encoding: "utf8"
    })
  );
}

describe("agent installation surfaces", () => {
  it("returns a no-effect structured setup plan", () => {
    const result = run("scripts/install.mjs", ["--host", "all", "--dry-run", "--json"]);
    expect(result).toMatchObject({ schemaVersion: "1", command: "setup", ok: true, dryRun: true });
    expect(result.effects.map((effect: { id: string }) => effect.id)).toEqual([
      "dependencies",
      "verification",
      "host.codex",
      "host.claude",
      "host.codex-skills"
    ]);
    expect(JSON.stringify(result)).not.toMatch(/Bearer\s|access[_-]?token.{8,}/i);
  });
});
