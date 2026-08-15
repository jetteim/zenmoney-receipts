import { describe, expect, it } from "vitest";

import { backendEnvironment } from "../src/backend.js";

describe("backendEnvironment", () => {
  it("passes the credential under the variable required by the pinned backend", () => {
    const environment = backendEnvironment("test-placeholder", {
      PATH: "/usr/bin",
      HOME: "/tmp/test-home",
      LANG: "C.UTF-8"
    });

    expect(environment).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/tmp/test-home",
      LANG: "C.UTF-8",
      ZENMONEY_ACCESS_TOKEN: "test-placeholder",
      ZENMONEY_ENABLE_WRITE_TOOLS: "true",
      ZENMONEY_SYNC_ON_START: "false"
    });
    expect("ZENMONEY_TOKEN" in environment).toBe(false);
  });
});
