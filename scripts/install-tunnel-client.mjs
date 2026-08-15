#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const dryRun = process.argv.includes("--dry-run");
const json = process.argv.includes("--json");
const supportedPlatforms = { darwin: "darwin", linux: "linux", win32: "windows" };
const supportedArchitectures = { arm64: "arm64", x64: "amd64" };
const platform = supportedPlatforms[process.platform];
const architecture = supportedArchitectures[process.arch];
const installDir = resolve(homedir(), ".local/bin");

function emit(value) {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${value.message ?? JSON.stringify(value)}\n`);
}

async function requestJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "zenmoney-receipts-installer" } });
  if (!response.ok) throw new Error(`Release metadata request failed with HTTP ${response.status}.`);
  return response.json();
}

async function download(url) {
  const response = await fetch(url, { headers: { "User-Agent": "zenmoney-receipts-installer" } });
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function findBinary(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findBinary(path);
      if (nested) return nested;
    } else if (entry.name === (process.platform === "win32" ? "tunnel-client.exe" : "tunnel-client")) return path;
  }
  return null;
}

async function main() {
  if (!platform || !architecture) throw new Error(`Unsupported platform/architecture: ${process.platform}/${process.arch}`);
  const result = {
    schemaVersion: "1",
    command: "install-tunnel-client",
    ok: true,
    dryRun,
    source: "https://github.com/openai/tunnel-client/releases/latest",
    target: join(installDir, process.platform === "win32" ? "tunnel-client.exe" : "tunnel-client"),
    verification: "The selected release asset is checked against the release SHA256SUMS.txt before installation."
  };
  if (dryRun) {
    emit(result);
    return;
  }

  const release = await requestJson("https://api.github.com/repos/openai/tunnel-client/releases/latest");
  const suffix = `${platform}-${architecture}.zip`;
  const asset = release.assets?.find((candidate) => candidate.name.endsWith(suffix));
  const checksums = release.assets?.find((candidate) => candidate.name === "SHA256SUMS.txt");
  if (!asset || !checksums) throw new Error(`The latest stable release lacks ${suffix} or SHA256SUMS.txt.`);

  const [archive, checksumBytes] = await Promise.all([download(asset.browser_download_url), download(checksums.browser_download_url)]);
  const expectedLine = checksumBytes.toString("utf8").split(/\r?\n/).find((line) => line.trim().endsWith(asset.name));
  const expected = expectedLine?.trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(archive).digest("hex");
  if (!expected || expected !== actual) throw new Error("Downloaded tunnel-client archive failed SHA-256 verification.");

  const temporary = await mkdtemp(join(tmpdir(), "zenmoney-tunnel-client-"));
  try {
    const archivePath = join(temporary, basename(asset.name));
    const extracted = join(temporary, "extracted");
    await mkdir(extracted);
    await writeFile(archivePath, archive);
    execFileSync("unzip", ["-q", archivePath, "-d", extracted], { stdio: "ignore" });
    const binary = await findBinary(extracted);
    if (!binary) throw new Error("Verified archive did not contain tunnel-client.");
    await mkdir(installDir, { recursive: true });
    await copyFile(binary, result.target);
    if (process.platform !== "win32") await chmod(result.target, 0o755);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }

  const installedVersion = execFileSync(result.target, ["--version"], { encoding: "utf8" }).trim();
  emit({ ...result, tag: release.tag_name, installedVersion, message: `Installed ${installedVersion} at ${result.target}.` });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message.slice(0, 500) : "Installation failed";
  emit({ schemaVersion: "1", command: "install-tunnel-client", ok: false, error: message });
  process.exitCode = 1;
});
