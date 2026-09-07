import { access, chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreferenceController, PreferenceStore } from "../src/preferences.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { ZenMoneyReceiptService } from "../src/service.js";

const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "zenmoney-preferences-test-")); roots.push(root);
  const store = new PreferenceStore(join(root, "private"));
  return { root, store, controller: new PreferenceController(store) };
}
afterEach(async () => { vi.useRealTimers(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function apply(controller: PreferenceController, change: unknown) {
  const preview = await controller.preview(change);
  return controller.apply({ previewToken: preview.previewToken, confirmed: true });
}

describe("local preference memory", () => {
  it("exposes the same preview and confirmation boundary through MCP without a backend", async () => {
    const { controller, store } = await setup();
    const service = new ZenMoneyReceiptService({ call: async () => { throw new Error("unexpected financial call"); }, close: async () => {} });
    const server = createServer(service, undefined, { preferences: controller });
    const client = new Client({ name: "preferences-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const preview = await client.callTool({ name: "zenmoney_preview_preferences", arguments: { change: { operation: "enable" } } });
      const result = (preview.structuredContent as { result: { previewToken: string } }).result;
      await expect(access(store.location)).rejects.toThrow();
      const denied = await client.callTool({ name: "zenmoney_apply_preferences", arguments: { previewToken: result.previewToken, confirmed: false } });
      expect(denied.isError).toBe(true);
      const applied = await client.callTool({ name: "zenmoney_apply_preferences", arguments: { previewToken: result.previewToken, confirmed: true } });
      expect(applied.structuredContent).toMatchObject({ result: { verified: true, financialDataChanged: false } });
    } finally { await client.close(); await server.close(); }
  });
  it("defaults off, previews without files, binds immutable plans, and survives restart", async () => {
    const { store, controller } = await setup();
    expect(await controller.inspect()).toMatchObject({ available: true, enabled: false, effective: {} });
    await expect(controller.preview({ operation: "set", key: "foodGrouping", value: "food-type" })).rejects.toThrow("Enable");
    const enabled = await controller.preview({ operation: "enable" });
    await expect(access(store.location)).rejects.toThrow();
    await expect(controller.apply({ previewToken: enabled.previewToken, confirmed: false as true })).rejects.toThrow("confirmation");
    enabled.proposed.values.foodGrouping = "intended-consumer";
    await controller.apply({ previewToken: enabled.previewToken, confirmed: true });
    expect((await controller.inspect()).values).toEqual({});
    const set = await controller.preview({ operation: "set", key: "foodGrouping", value: "food-type" });
    await controller.apply({ previewToken: set.previewToken, confirmed: true });
    expect(await controller.apply({ previewToken: set.previewToken, confirmed: true })).toMatchObject({ alreadyApplied: true, applied: false });
    const restarted = new PreferenceController(new PreferenceStore(store.directory));
    expect(await restarted.inspect()).toMatchObject({ enabled: true, effective: { foodGrouping: "food-type" } });
    await expect(restarted.apply({ previewToken: set.previewToken, confirmed: true })).rejects.toThrow("previous server");
    if (process.platform !== "win32") {
      expect((await lstat(store.directory)).mode & 0o777).toBe(0o700);
      expect((await lstat(store.location)).mode & 0o777).toBe(0o600);
    }
  });

  it("edits, disables, deletes and purges exactly while rejecting stale concurrent plans", async () => {
    const { store, controller } = await setup();
    await apply(controller, { operation: "enable" });
    const other = new PreferenceController(new PreferenceStore(store.directory));
    const stale = await other.preview({ operation: "set", key: "foodGrouping", value: "intended-consumer" });
    await apply(controller, { operation: "set", key: "foodGrouping", value: "food-type" });
    await expect(other.apply({ previewToken: stale.previewToken, confirmed: true })).rejects.toThrow("changed after preview");
    await apply(controller, { operation: "set", key: "foodGrouping", value: "intended-consumer" });
    await apply(controller, { operation: "disable" });
    expect(await controller.inspect()).toMatchObject({ effective: {}, values: { foodGrouping: "intended-consumer" } });
    await apply(controller, { operation: "delete", key: "foodGrouping" });
    await apply(controller, { operation: "enable" });
    await apply(controller, { operation: "set", key: "candidateNotes", value: "never-suggest" });
    expect(await apply(controller, { operation: "purge" })).toMatchObject({ verified: true, financialDataChanged: false, stateAtApply: { enabled: false, values: {} } });
  });

  it("rejects free text, wrong key/value pairs, unknown fields and repository storage before writes", async () => {
    const { store, controller } = await setup();
    for (const change of [
      { operation: "set", key: "foodGrouping", value: "raw receipt text" },
      { operation: "set", key: "foodGrouping", value: "never-suggest" },
      { operation: "enable", instructions: "arbitrary content" },
      { operation: "delete", key: "../../escape" }
    ]) await expect(controller.preview(change)).rejects.toThrow();
    await expect(access(store.directory)).rejects.toThrow();
    const inside = new PreferenceController(new PreferenceStore(join(process.cwd(), "private-preference-test")));
    await expect(inside.preview({ operation: "enable" })).rejects.toThrow("outside the repository");
  });

  it("fails closed on corrupt, oversized, symlinked and shared storage", async () => {
    const { root, store, controller } = await setup();
    await mkdir(store.directory, { mode: 0o700 });
    await writeFile(store.location, "not valid JSON", { mode: 0o600 });
    expect(await controller.inspect()).toMatchObject({ available: false, enabled: null, effective: {} });
    await expect(controller.preview({ operation: "enable" })).rejects.toThrow("corrupt");
    await writeFile(store.location, "x".repeat(4097));
    await expect(controller.preview({ operation: "enable" })).rejects.toThrow("size limit");
    await rm(store.location);
    const target = join(root, "elsewhere.json");
    await writeFile(target, "untouched", { mode: 0o600 });
    await symlink(target, store.location);
    await expect(controller.preview({ operation: "enable" })).rejects.toThrow("Unsafe");
    expect(await readFile(target, "utf8")).toBe("untouched");
    await rm(store.location);
    if (process.platform !== "win32") {
      await chmod(store.directory, 0o755);
      await expect(controller.preview({ operation: "enable" })).rejects.toThrow("private");
    }
  });

  it("rejects busy and expired previews without changing the state", async () => {
    const { store, controller } = await setup();
    await apply(controller, { operation: "enable" });
    const before = await readFile(store.location, "utf8");
    const preview = await controller.preview({ operation: "disable" });
    await writeFile(join(store.directory, ".lock"), "", { mode: 0o600 });
    await expect(controller.apply({ previewToken: preview.previewToken, confirmed: true })).rejects.toThrow("busy");
    await rm(join(store.directory, ".lock"));
    const expiring = await controller.preview({ operation: "disable" });
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 11 * 60000);
    await expect(controller.apply({ previewToken: expiring.previewToken, confirmed: true })).rejects.toThrow("expired");
    expect(await readFile(store.location, "utf8")).toBe(before);
  });
});
