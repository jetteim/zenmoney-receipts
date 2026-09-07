import { createHash, randomBytes } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { OperationPreviewStore } from "./operation-preview-store.js";

export const preferenceCatalog = {
  foodGrouping: ["food-type", "intended-consumer"],
  categoryGranularity: ["existing-only", "suggest-narrower"],
  candidateNotes: ["ask", "never-suggest"]
} as const;
const keySchema = z.enum(["foodGrouping", "categoryGranularity", "candidateNotes"]);
const valueSchema = z.enum(["food-type", "intended-consumer", "existing-only", "suggest-narrower", "ask", "never-suggest"]);
const valuesSchema = z.object({
  foodGrouping: z.enum(preferenceCatalog.foodGrouping).optional(),
  categoryGranularity: z.enum(preferenceCatalog.categoryGranularity).optional(),
  candidateNotes: z.enum(preferenceCatalog.candidateNotes).optional()
}).strict();
const stateSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative().safe(), enabled: z.boolean(), values: valuesSchema }).strict();
export const preferenceChangeSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("enable") }).strict(),
  z.object({ operation: z.literal("disable") }).strict(),
  z.object({ operation: z.literal("purge") }).strict(),
  z.object({ operation: z.literal("delete"), key: keySchema }).strict(),
  z.object({ operation: z.literal("set"), key: keySchema, value: valueSchema }).strict()
]);
type State = z.infer<typeof stateSchema>;
type Plan = { before: State; proposed: State; expectedDigest: string | null };
const initial = (): State => ({ schemaVersion: 1, revision: 0, enabled: false, values: {} });
const maxBytes = 4096;
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";
const contained = (root: string, target: string) => { const r = relative(root, target); return r === "" || (!r.startsWith(`..${sep}`) && r !== ".." && !isAbsolute(r)); };

function defaultDirectory() {
  const base = process.platform === "darwin" ? join(homedir(), "Library", "Application Support")
    : process.platform === "win32" ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
    : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return resolve(process.env.ZENMONEY_PREFERENCES_DIR || join(base, "zenmoney-receipts", "preferences"));
}

export class PreferenceStore {
  readonly directory: string;
  readonly location: string;
  constructor(directory = defaultDirectory()) {
    this.directory = resolve(directory);
    this.location = join(this.directory, "preferences.json");
  }

  private async guardRoot() {
    const repository = await realpath(resolve(fileURLToPath(new URL("..", import.meta.url))));
    let ancestor = this.directory;
    const suffix: string[] = [];
    while (true) {
      try {
        const canonical = resolve(await realpath(ancestor), ...suffix);
        if (contained(repository, canonical)) throw new Error("Preference storage must be outside the repository");
        break;
      } catch (error) {
        if (!missing(error)) throw error;
        suffix.unshift(relative(dirname(ancestor), ancestor));
        ancestor = dirname(ancestor);
      }
    }
    try { this.privateNode(await lstat(this.directory), true); }
    catch (error) { if (!missing(error)) throw error; }
  }

  private privateNode(info: Stats, directory: boolean) {
    if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || (!directory && info.nlink !== 1)) throw new Error("Unsafe preference storage path");
    if (process.platform !== "win32" && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())) throw new Error("Preference storage requires private current-user permissions");
  }

  private async read(): Promise<{ state: State; digest: string | null }> {
    await this.guardRoot();
    let handle;
    try {
      const info = await lstat(this.location);
      this.privateNode(info, false);
      if (info.size > maxBytes) throw new Error("Preference storage exceeds size limit");
      handle = await open(this.location, constants.O_RDONLY | constants.O_NOFOLLOW);
      const actual = await handle.stat();
      this.privateNode(actual, false);
      if (actual.ino !== info.ino || actual.dev !== info.dev || actual.size > maxBytes) throw new Error("Preference storage changed while reading");
      const raw = await handle.readFile("utf8");
      if (Buffer.byteLength(raw) > maxBytes) throw new Error("Preference storage exceeds size limit");
      let state: State;
      try { state = stateSchema.parse(JSON.parse(raw)); }
      catch { throw new Error("Preference storage is corrupt or unsupported"); }
      return { state, digest: digest(raw) };
    } catch (error) {
      if (missing(error)) return { state: initial(), digest: null };
      throw error;
    } finally { await handle?.close(); }
  }

  async inspect() {
    try {
      const { state } = await this.read();
      return { available: true, location: this.location, ...state, effective: state.enabled ? state.values : {}, catalog: preferenceCatalog, maxBytes, scope: "local-advisory-only", untrustedData: true };
    } catch {
      return { available: false, location: this.location, enabled: null, revision: null, values: {}, effective: {}, catalog: preferenceCatalog, maxBytes, scope: "local-advisory-only", untrustedData: true };
    }
  }

  async preview(raw: unknown): Promise<Plan> {
    const parsed = preferenceChangeSchema.safeParse(raw);
    if (!parsed.success) throw new Error("Invalid structured preference change");
    const change = parsed.data;
    if (change.operation === "set" && !(preferenceCatalog[change.key] as readonly string[]).includes(change.value)) throw new Error("Preference value does not belong to this key");
    const current = await this.read();
    const proposed = structuredClone(current.state);
    if (change.operation === "enable") proposed.enabled = true;
    if (change.operation === "disable") proposed.enabled = false;
    if (change.operation === "purge") { proposed.enabled = false; proposed.values = {}; }
    if (change.operation === "delete") delete proposed.values[change.key];
    if (change.operation === "set") {
      if (!proposed.enabled) throw new Error("Enable preference memory through a confirmed preview before saving preferences");
      proposed.values = valuesSchema.parse({ ...proposed.values, [change.key]: change.value });
    }
    if (JSON.stringify(proposed) === JSON.stringify(current.state)) throw new Error("Preference change is a no-op");
    proposed.revision += 1;
    stateSchema.parse(proposed);
    return { before: current.state, proposed, expectedDigest: current.digest };
  }

  async apply(plan: Plan) {
    await this.guardRoot();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.guardRoot();
    const lockPath = join(this.directory, ".lock");
    let lock;
    try { lock = await open(lockPath, "wx", 0o600); }
    catch { throw new Error("Preference storage is busy; inspect it before creating a fresh preview"); }
    let temporary: string | undefined;
    try {
      const current = await this.read();
      if (current.digest !== plan.expectedDigest || current.state.revision !== plan.before.revision) throw new Error("Preferences changed after preview; create a fresh preview");
      const proposed = stateSchema.parse(plan.proposed);
      const raw = JSON.stringify(proposed);
      if (Buffer.byteLength(raw) > maxBytes) throw new Error("Preference storage exceeds size limit");
      temporary = join(this.directory, `.preferences-${randomBytes(12).toString("hex")}.tmp`);
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(raw, "utf8"); await file.sync(); } finally { await file.close(); }
      await this.guardRoot();
      await rename(temporary, this.location);
      temporary = undefined;
      if (process.platform !== "win32") {
        const dir = await open(this.directory, constants.O_RDONLY);
        try { await dir.sync(); } finally { await dir.close(); }
      }
      const verified = await this.read();
      if (verified.digest !== digest(raw)) throw new Error("Preference write could not be verified; inspect current state");
      return { applied: true, alreadyApplied: false, verified: true, stateAtApply: verified.state, location: this.location, financialDataChanged: false };
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      await lock.close();
      await unlink(lockPath);
    }
  }
}

type PreferenceResult = Awaited<ReturnType<PreferenceStore["apply"]>>;
export class PreferenceController {
  constructor(private readonly store = new PreferenceStore(), private readonly previews = new OperationPreviewStore<Plan, PreferenceResult>()) {}
  inspect() { return this.store.inspect(); }
  async preview(change: unknown) {
    const plan = await this.store.preview(change);
    const preview = this.previews.create(structuredClone(plan));
    return { ...preview, before: plan.before, proposed: plan.proposed, location: this.store.location, requiresConfirmation: true, financialDataChanged: false, note: "No preference was changed. Values advise future choices only; current user instructions and financial safety take precedence." };
  }
  async apply(input: { previewToken: string; confirmed: true }) {
    if (input.confirmed !== true) throw new Error("Explicit confirmation is required");
    const start = this.previews.begin(input.previewToken);
    if (start.state === "applied") return { ...start.result, applied: false, alreadyApplied: true };
    try {
      const result = await this.store.apply(start.plan);
      this.previews.markApplied(input.previewToken, result);
      return result;
    } catch (error) {
      this.previews.markFailed(input.previewToken, "Preference apply failed; inspect current state and create a fresh preview");
      throw error;
    }
  }
}
