import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EncryptedFileCredentialStore } from "../src/hosted-credential-store.js";
import { HostedOAuthTools } from "../src/hosted-oauth-tools.js";
import { HostedTenantDataController } from "../src/hosted-tenant-data.js";
import { ZenMoneyOAuthController } from "../src/zenmoney-oauth.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "zenmoney-hosted-deletion-"));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await root();
  const tenantRoot = join(directory, "tenant-state", "tenant-hash");
  await mkdir(join(tenantRoot, "receipt-memory"), { recursive: true });
  await mkdir(join(tenantRoot, "operation-journal"), { recursive: true });
  await mkdir(join(tenantRoot, "events"), { recursive: true });
  await writeFile(join(tenantRoot, "receipt-memory", "receipt-memory.json"), "{}\n");
  await writeFile(join(tenantRoot, "operation-journal", "operations.json"), "{}\n");
  await writeFile(join(tenantRoot, "events", "events.json"), "{}\n");
  const store = new EncryptedFileCredentialStore(join(directory, "credentials"), Buffer.alloc(32, 5));
  await store.put("tenant-1", {
    accessToken: "access-private-value",
    refreshToken: null,
    expiresAt: null,
    scope: [],
    updatedAt: "2026-08-22T00:00:00.000Z"
  });
  const oauth = new ZenMoneyOAuthController(store, {
    authorizationEndpoint: "http://127.0.0.1:9997/authorize",
    tokenEndpoint: "http://127.0.0.1:9997/token",
    clientId: "client-1",
    redirectUri: "http://127.0.0.1:9999/oauth/zenmoney/callback",
    scopes: []
  });
  return {
    tenantRoot,
    store,
    tools: new HostedOAuthTools("tenant-1", oauth, false, new HostedTenantDataController(tenantRoot))
  };
}

describe("hosted tenant data deletion", () => {
  it("previews, permanently deletes only connector state, verifies, and replays idempotently", async () => {
    const { tenantRoot, store, tools } = await fixture();
    const preview = await tools.previewDataDeletion();
    expect(preview).toMatchObject({
      requiresConfirmation: true,
      before: {
        linked: true,
        receiptMemoryPresent: true,
        recoveryJournalPresent: true,
        operationalEventsPresent: true
      }
    });
    expect(await store.get("tenant-1")).not.toBeNull();

    const applied = await tools.applyDataDeletion({ previewToken: preview.previewToken, confirmed: true });
    expect(applied).toMatchObject({
      applied: true,
      verified: true,
      linked: false,
      deleted: { credential: true, tenantState: true }
    });
    await expect(access(tenantRoot)).rejects.toThrow();
    expect(await store.get("tenant-1")).toBeNull();
    await expect(
      tools.applyDataDeletion({ previewToken: preview.previewToken, confirmed: true })
    ).resolves.toMatchObject({ applied: false, alreadyApplied: true, verified: true });
  });

  it("rejects state changed after preview", async () => {
    const { tenantRoot, tools } = await fixture();
    const preview = await tools.previewDataDeletion();
    await writeFile(join(tenantRoot, "events", "events.json"), "changed\n");
    await expect(
      tools.applyDataDeletion({ previewToken: preview.previewToken, confirmed: true })
    ).rejects.toThrow("changed after preview");
  });
});
