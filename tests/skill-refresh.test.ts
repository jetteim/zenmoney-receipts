import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const skillNames = [
  "categorize-zenmoney-receipts",
  "review-zenmoney-categories",
  "find-zenmoney-savings"
];
const temporaryRoots: string[] = [];

function installedSkills() {
  const codexRoot = mkdtempSync(join(tmpdir(), "zenmoney-skills-"));
  temporaryRoots.push(codexRoot);
  const installer = join(
    codexRoot,
    "skills/.system/skill-installer/scripts/install-skill-from-github.py"
  );
  mkdirSync(join(installer, ".."), { recursive: true });
  writeFileSync(installer, "# fixture\n");
  for (const skillName of skillNames) {
    cpSync(join(process.cwd(), "skills", skillName), join(codexRoot, "skills", skillName), {
      recursive: true
    });
  }
  return codexRoot;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("skill refresh", () => {
  it("refreshes recognized installed skills from the clone", () => {
    const codexRoot = installedSkills();
    const installed = join(codexRoot, "skills/categorize-zenmoney-receipts/SKILL.md");
    writeFileSync(
      installed,
      readFileSync(installed, "utf8").replace("# Categorize ZenMoney Receipts", "# Stale Copy")
    );

    execFileSync("/bin/zsh", ["scripts/install-skills.sh", "--refresh"], {
      cwd: process.cwd(),
      env: { ...process.env, CODEX_HOME: codexRoot },
      stdio: "pipe"
    });

    expect(readFileSync(installed, "utf8")).toBe(
      readFileSync(join(process.cwd(), "skills/categorize-zenmoney-receipts/SKILL.md"), "utf8")
    );
  });

  it("refuses to overwrite an unrecognized same-named skill", () => {
    const codexRoot = installedSkills();
    const recognized = join(codexRoot, "skills/categorize-zenmoney-receipts/SKILL.md");
    const staleRecognized = readFileSync(recognized, "utf8").replace(
      "# Categorize ZenMoney Receipts",
      "# Keep Until Validation Finishes"
    );
    writeFileSync(recognized, staleRecognized);
    const installed = join(codexRoot, "skills/review-zenmoney-categories/SKILL.md");
    writeFileSync(installed, "---\nname: unrelated-skill\ndescription: fixture\n---\n");

    expect(() =>
      execFileSync("/bin/zsh", ["scripts/install-skills.sh", "--refresh"], {
        cwd: process.cwd(),
        env: { ...process.env, CODEX_HOME: codexRoot },
        stdio: "pipe"
      })
    ).toThrow();
    expect(readFileSync(recognized, "utf8")).toBe(staleRecognized);
  });
});
