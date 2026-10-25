import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), user: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: mocks.execute }));
vi.mock("node:os", () => ({ userInfo: mocks.user }));
import { credentialStatus, resolveCredential } from "../src/credentials.js";

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const fixture = ["synthetic", "credential", "fixture"].join("-");

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ZENMONEY_ACCESS_TOKEN", "");
  vi.stubEnv("USER", "example");
  vi.stubEnv("LOGNAME", "example");
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
  mocks.user.mockReturnValue({ username: "example" });
  mocks.execute.mockReturnValue(fixture);
});
afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(process, "platform", originalPlatform);
});

describe("local credential discovery", () => {
  it("prefers the injected environment without querying Keychain", () => {
    vi.stubEnv("ZENMONEY_ACCESS_TOKEN", ` ${fixture} `);
    expect(resolveCredential()).toMatchObject({ token: fixture, source: "environment" });
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("uses the macOS account and bounds the private Keychain subprocess", () => {
    mocks.user.mockReturnValue({ username: "native-account" });
    expect(resolveCredential()).toMatchObject({ source: "macos-keychain", diagnostic: "keychain" });
    expect(mocks.execute).toHaveBeenCalledWith("/usr/bin/security",
      ["find-generic-password", "-s", "zenmoney-receipts", "-a", "native-account", "-w"],
      expect.objectContaining({ timeout: 15000, stdio: ["ignore", "pipe", "ignore"] }));
  });

  it("falls back to USER when Directory Services is unavailable", () => {
    mocks.user.mockImplementation(() => { throw new Error("account lookup unavailable"); });
    expect(resolveCredential().source).toBe("macos-keychain");
    expect(mocks.execute.mock.calls[0]?.[1]).toContain("example");
  });

  it("falls back to LOGNAME when the native and USER names are unusable", () => {
    mocks.user.mockReturnValue({ username: "501" });
    vi.stubEnv("USER", "bad\nname");
    vi.stubEnv("LOGNAME", "fallback-account");
    expect(resolveCredential().source).toBe("macos-keychain");
    expect(mocks.execute.mock.calls[0]?.[1]).toContain("fallback-account");
  });

  it("reports missing account context without searching an arbitrary account", () => {
    mocks.user.mockImplementation(() => { throw new Error("lookup failed"); });
    vi.stubEnv("USER", "501");
    vi.stubEnv("LOGNAME", "");
    expect(resolveCredential()).toMatchObject({ token: null, diagnostic: "account-unavailable" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(["throw", "empty"])("keeps Keychain %s failures private and distinct from token rejection", mode => {
    if (mode === "throw") mocks.execute.mockImplementation(() => { throw new Error(fixture); });
    else mocks.execute.mockReturnValue("  ");
    const status = credentialStatus();
    expect(status).toMatchObject({ configured: false, source: "missing", diagnostic: "keychain-unavailable" });
    expect(JSON.stringify(status)).not.toContain(fixture);
    expect(status).not.toHaveProperty("token");
  });

  it("never invokes macOS Keychain on another platform", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    expect(resolveCredential()).toMatchObject({ diagnostic: "unsupported-platform" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
