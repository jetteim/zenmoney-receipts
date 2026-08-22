import { describe, expect, it } from "vitest";

import { protectedResourceMetadata, sessionBelongsToTenant } from "../src/hosted-server.js";

describe("hosted Streamable HTTP boundaries", () => {
  it("publishes the exact MCP resource and authorization server metadata", () => {
    expect(
      protectedResourceMetadata({
        resource: "https://connector.example/mcp",
        authorizationServerIssuer: "https://identity.example/",
        scopes: ["mcp:tools"]
      })
    ).toEqual({
      resource: "https://connector.example/mcp",
      authorization_servers: ["https://identity.example"],
      scopes_supported: ["mcp:tools"],
      resource_name: "ZenMoney Receipts"
    });
  });

  it("rejects an MCP session when the authenticated tenant changes", () => {
    expect(sessionBelongsToTenant({ tenantId: "tenant-alpha" }, "tenant-alpha")).toBe(true);
    expect(sessionBelongsToTenant({ tenantId: "tenant-alpha" }, "tenant-beta")).toBe(false);
  });
});
