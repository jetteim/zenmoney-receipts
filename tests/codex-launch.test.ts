import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ credential: vi.fn(), spawn: vi.fn() }));
vi.mock("../src/credentials.js", () => ({ resolveCredential: mocks.credential }));
vi.mock("node:child_process", () => ({ spawnSync: mocks.spawn }));
import { launchCodex } from "../src/codex-launch.js";

const fixture = ["synthetic", "launch", "fixture"].join("-");
let stderr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  mocks.credential.mockReturnValue({ token: fixture, source: "macos-keychain" });
  mocks.spawn.mockReturnValue({ status: 0 });
});
afterEach(() => vi.restoreAllMocks());

describe("trusted-terminal Codex launch", () => {
  it("passes the credential only through process environment and forwards its name to MCP", () => {
    expect(launchCodex(["--help"])).toBe(0);
    const [command, args, options] = mocks.spawn.mock.calls[0]!;
    expect(command).toBe("codex");
    expect(args).toContain('mcp_servers.zenmoney-receipts.env_vars=["ZENMONEY_ACCESS_TOKEN"]');
    expect(args).toContain("--help");
    expect(JSON.stringify(args)).not.toContain(fixture);
    expect(options.env.ZENMONEY_ACCESS_TOKEN).toBe(fixture);
    expect(options.stdio).toBe("inherit");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("refuses to launch when the parent process cannot access the credential", () => {
    mocks.credential.mockReturnValue({ token: null, source: "missing" });
    expect(launchCodex([])).toBe(2);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("preserves child failure and keeps thrown errors private", () => {
    mocks.spawn.mockReturnValue({ status: 7 });
    expect(launchCodex([])).toBe(7);
    mocks.spawn.mockImplementation(() => { throw new Error(fixture); });
    expect(launchCodex([])).toBe(1);
    expect(JSON.stringify(stderr.mock.calls)).not.toContain(fixture);
  });
});
