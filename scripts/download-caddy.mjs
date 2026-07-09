#!/usr/bin/env node
/**
 * Cross-platform Caddy sidecar downloader.
 * Pure JS extraction — no system tools required.
 * Skips download if the binary already exists.
 *
 * Usage:
 *   node scripts/download-caddy.mjs [version] [platform]
 *
 * Options:
 *   version  - Caddy version, e.g. "2.9.1" (default: latest from GitHub API)
 *   platform - linux | macos-arm | macos-intel | windows | all (default: auto-detect)
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, "..", "src-tauri", "binaries");
const BASE_URL = "https://github.com/caddyserver/caddy/releases/download";

const TARGETS = {
  linux:         { osArch: "linux_amd64",   archive: "tar.gz", name: "caddy-x86_64-unknown-linux-gnu" },
  "macos-arm":   { osArch: "mac_arm64",     archive: "tar.gz", name: "caddy-aarch64-apple-darwin" },
  "macos-intel": { osArch: "mac_amd64",     archive: "tar.gz", name: "caddy-x86_64-apple-darwin" },
  windows:       { osArch: "windows_amd64", archive: "zip",    name: "caddy-x86_64-pc-windows-msvc.exe" },
};

// ── Helpers ──────────────────────────────────────────────

function detectPlatform() {
  const p = process.platform;
  const a = process.arch;
  if (p === "linux")  return a === "arm64" ? null : "linux";
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
  return data.tag_name.replace(/^v/, "");
}

// ── Pure-JS tar.gz extraction ────────────────────────────
//
// Tar format: each entry is a 512-byte header + file data padded to 512-byte blocks.
// Header layout (octal-encoded fields):
//   offset 0:   filename   (100 bytes, null-terminated)
//   offset 124: file size  (12 bytes, octal string, null/space terminated)
//   offset 156: type flag  (1 byte) — '0' or '\0' = regular file
//
// An all-zero 512-byte block signals end of archive.

async function extractTarGz(archivePath, targetName) {
  // Decompress gzip → raw tar
  const chunks = [];
  await pipeline(
    Readable.from(readFileSync(archivePath)),
    createGunzip(),
    async function* (source) {
      for await (const chunk of source) chunks.push(chunk);
    },
  );
  const tar = Buffer.concat(chunks);

  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);

    // End-of-archive: all zeros
    if (header.every((b) => b === 0)) break;

    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const size = parseInt(header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim(), 8) || 0;
    const type = header[156];

    // Regular file (type '0' or NUL)
    if ((type === 0x30 || type === 0x00) && name.endsWith(targetName)) {
      const dataStart = offset + 512;
      return tar.subarray(dataStart, dataStart + size);
    }

    // Skip to next entry (header + data padded to 512-byte boundary)
    offset += 512 + Math.ceil(size / 512) * 512;
  }

  throw new Error(`File "${targetName}" not found in tar.gz archive`);
}

// ── Pure-JS zip extraction ───────────────────────────────
//
// We only need to extract a single file, so the approach is:
// 1. Read the End of Central Directory record (last 22+ bytes) to locate the Central Directory.
// 2. Scan the Central Directory to find the target filename and its local-header offset.
// 3. Seek to that offset, read the Local File Header, and extract the (deflated) data.
// 4. Inflate with Node's built-in zlib.

import { createInflateRaw } from "node:zlib";

function findSignature(buf, sig, startFrom = 0) {
  for (let i = startFrom; i <= buf.length - 4; i++) {
    if (buf.readUInt32LE(i) === sig) return i;
  }
  return -1;
}

async function extractZip(archivePath, targetName) {
  const buf = readFileSync(archivePath);

  // End of Central Directory signature: 0x06054b50
  const eocdSig = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === eocdSig) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("ZIP: End of Central Directory not found");

  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  // Scan Central Directory for our file
  const cdStart = cdOffset;
  let pos = cdStart;
  let localHeaderOffset = -1;

  while (pos < cdStart + cdSize) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error("ZIP: bad Central Directory entry");
    const compMethod = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const uncompSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const lhOffset = buf.readUInt32LE(pos + 42);
    const fileName = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");

    if (fileName === targetName || fileName.endsWith("/" + targetName) || fileName.endsWith("\\" + targetName)) {
      localHeaderOffset = lhOffset;
      break;
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  if (localHeaderOffset === -1) throw new Error(`ZIP: "${targetName}" not found in archive`);

  // Read Local File Header to get the actual data offset
  const lfh = localHeaderOffset;
  if (buf.readUInt32LE(lfh) !== 0x04034b50) throw new Error("ZIP: bad Local File Header");
  const lfhNameLen = buf.readUInt16LE(lfh + 26);
  const lfhExtraLen = buf.readUInt16LE(lfh + 28);
  const dataOffset = lfh + 30 + lfhNameLen + lfhExtraLen;

  // Re-read sizes from the Local File Header (data descriptor may shift values)
  const lfhCompMethod = buf.readUInt16LE(lfh + 8);
  const lfhCompSize = buf.readUInt32LE(lfh + 18);
  const lfhUncompSize = buf.readUInt32LE(lfh + 22);

  const compData = buf.subarray(dataOffset, dataOffset + lfhCompSize);

  if (lfhCompMethod === 0) {
    // Stored (no compression)
    return compData;
  }

  if (lfhCompMethod === 8) {
    // Deflated
    return new Promise((resolve, reject) => {
      const chunks = [];
      createInflateRaw()
        .on("data", (c) => chunks.push(c))
        .on("end", () => resolve(Buffer.concat(chunks)))
        .on("error", reject)
        .end(compData);
    });
  }

  throw new Error(`ZIP: unsupported compression method ${lfhCompMethod}`);
}

// ── Main download + extract ──────────────────────────────

async function downloadCaddy(version, osArch, archive, targetName) {
  const ext = archive === "zip" ? ".zip" : ".tar.gz";
  const url = `${BASE_URL}/v${version}/caddy_${version}_${osArch}${ext}`;
  const tmpFile = join(BIN_DIR, `_tmp_caddy_${osArch}${ext}`);
  const targetPath = join(BIN_DIR, targetName);

  console.log(`Downloading Caddy v${version} for ${osArch}...`);
  await downloadFile(url, tmpFile);

  console.log(`Extracting to ${targetPath}...`);
  const data = archive === "zip"
    ? await extractZip(tmpFile, "caddy.exe")
    : await extractTarGz(tmpFile, "caddy");

  writeFileSync(targetPath, data);
  chmodSync(targetPath, 0o755);
  unlinkSync(tmpFile);

  console.log(`Done: ${targetName}`);
}

// ── Entry point ──────────────────────────────────────────

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

  if (existsSync(targetPath)) {
    console.log(`Already exists, skipping: ${t.name}`);
    continue;
  }

  await downloadCaddy(version, t.osArch, t.archive, t.name);
}

console.log(`\nAll done! Binaries in: ${BIN_DIR}`);
