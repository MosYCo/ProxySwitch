#!/usr/bin/env node
/**
 * Cross-platform Caddy sidecar downloader.
 * Skips download if the binary already exists.
 *
 * Usage:
 *   node scripts/download-caddy.mjs [version] [platform]
 *
 * Options:
 *   version  - Caddy version, e.g. "2.9.1" (default: latest from GitHub API)
 *   platform - linux | macos-arm | macos-intel | windows | all (default: auto-detect)
 */

import { createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync, chmodSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, "..", "src-tauri", "binaries");
const BASE_URL = "https://github.com/caddyserver/caddy/releases/download";

const TARGETS = {
  linux:       { osArch: "linux_amd64",   archive: "tar.gz", name: "caddy-x86_64-unknown-linux-gnu" },
  "macos-arm": { osArch: "mac_arm64",     archive: "tar.gz", name: "caddy-aarch64-apple-darwin" },
  "macos-intel": { osArch: "mac_amd64",   archive: "tar.gz", name: "caddy-x86_64-apple-darwin" },
  windows:     { osArch: "windows_amd64", archive: "zip",    name: "caddy-x86_64-pc-windows-msvc.exe" },
};

function detectPlatform() {
  const p = process.platform;
  const a = process.arch;
  if (p === "linux")  return a === "arm64" ? null : "linux";        // arm64 linux not in targets
  if (p === "darwin") return a === "arm64" ? "macos-arm" : "macos-intel";
  if (p === "win32")  return "windows";
  return null;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "caddy-proxy-tools" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": "caddy-proxy-tools" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function getLatestVersion() {
  const data = await fetchJson("https://api.github.com/repos/caddyserver/caddy/releases/latest");
  const tag = data.tag_name;            // e.g. "v2.11.4"
  return tag.replace(/^v/, "");
}

async function downloadCaddy(version, osArch, archive, targetName) {
  const ext = archive === "zip" ? ".zip" : ".tar.gz";
  const url = `${BASE_URL}/v${version}/caddy_${version}_${osArch}${ext}`;
  const tmpFile = join(BIN_DIR, `_tmp_caddy_${osArch}${ext}`);
  const targetPath = join(BIN_DIR, targetName);

  console.log(`Downloading Caddy v${version} for ${osArch}...`);
  await downloadFile(url, tmpFile);

  console.log(`Extracting to ${targetPath}...`);
  const extractDir = join(BIN_DIR, "_tmp_extract");
  mkdirSync(extractDir, { recursive: true });

  // tar is available on Windows 10+, macOS, and Linux; handles both .zip and .tar.gz
  const tarFlag = archive === "zip" ? "-xf" : "-xzf";
  execSync(`tar ${tarFlag} "${tmpFile}" -C "${extractDir}"`, { stdio: "pipe" });

  // Move the extracted binary to target
  const binName = archive === "zip" ? "caddy.exe" : "caddy";
  const extracted = join(extractDir, binName);
  renameSync(extracted, targetPath);

  // Cleanup
  unlinkSync(tmpFile);
  rmSync(extractDir, { recursive: true, force: true });

  chmodSync(targetPath, 0o755);
  unlinkSync(tmpFile);
  console.log(`Done: ${targetName}`);
}

// --- Main ---

const argVersion = process.argv[2] || "";
const argPlatform = process.argv[3] || "";

mkdirSync(BIN_DIR, { recursive: true });

const version = argVersion || await getLatestVersion();
if (!argVersion) console.log(`Latest version: v${version}`);

const platforms = argPlatform
  ? (argPlatform === "all" ? Object.keys(TARGETS) : [argPlatform])
  : [detectPlatform()];

for (const plat of platforms) {
  if (!plat || !TARGETS[plat]) {
    console.error(`Unknown or unsupported platform: ${plat}`);
    console.error(`Usage: node scripts/download-caddy.mjs [version] [linux|macos-arm|macos-intel|windows|all]`);
    process.exit(1);
  }

  const t = TARGETS[plat];
  const targetPath = join(BIN_DIR, t.name);

  // Skip if binary already exists
  if (existsSync(targetPath)) {
    console.log(`Already exists, skipping: ${t.name}`);
    continue;
  }

  await downloadCaddy(version, t.osArch, t.archive, t.name);
}

console.log(`\nAll done! Binaries in: ${BIN_DIR}`);
