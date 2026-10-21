#!/usr/bin/env node
/**
 * Cross-platform Caddy sidecar downloader.
 * Pure JS extraction — no system tools required.
 * Verifies the pinned release and cached executable before use.
 *
 * Usage:
 *   node scripts/download-caddy.mjs [version] [platform]
 *
 * Options:
 *   version  - must match scripts/caddy-release.json; omitted by default
 *   platform - linux | macos-arm | macos-intel | windows | all (default: auto-detect)
 */

import { existsSync, mkdirSync, readFileSync, rmSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, dirname, basename, resolve } from "node:path";
import { gunzipSync, createInflateRaw } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, "..", "src-tauri", "binaries");
const BASE_URL = "https://github.com/caddyserver/caddy/releases/download";
export const pinnedRelease = JSON.parse(readFileSync(join(__dirname, "caddy-release.json"), "utf8"));

// ── Helpers ──────────────────────────────────────────────

export function detectPlatform() {
  const p = process.platform;
  const a = process.arch;
  if (p === "linux")  return a === "arm64" ? null : "linux";
  if (p === "darwin") return a === "arm64" ? "macos-arm" : "macos-intel";
  if (p === "win32")  return a === "x64" ? "windows" : null;
  return null;
}

export function verifyDigest(bytes, expected, algorithm = "sha256") {
  if (createHash(algorithm).update(bytes).digest("hex") !== expected) throw new Error(`Caddy ${algorithm.toUpperCase()} checksum mismatch`);
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

export async function extractTarGz(archivePath, targetName) {
  // Decompress gzip → raw tar (pure JS, no streams needed)
  const tar = gunzipSync(readFileSync(archivePath));

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

export async function extractZip(archivePath, targetName) {
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
  let entry = null;

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
      entry = { fileName, compMethod, compSize, uncompSize, localHeaderOffset: lhOffset };
      break;
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  if (!entry) throw new Error(`ZIP: "${targetName}" not found in archive`);
  if (entry.compSize === 0xffffffff || entry.uncompSize === 0xffffffff) {
    throw new Error(`ZIP: "${entry.fileName}" uses ZIP64, which is not supported`);
  }

  // Read Local File Header to get the actual data offset
  const lfh = entry.localHeaderOffset;
  if (buf.readUInt32LE(lfh) !== 0x04034b50) throw new Error("ZIP: bad Local File Header");
  const lfhNameLen = buf.readUInt16LE(lfh + 26);
  const lfhExtraLen = buf.readUInt16LE(lfh + 28);
  const dataOffset = lfh + 30 + lfhNameLen + lfhExtraLen;
  const dataEnd = dataOffset + entry.compSize;

  const lfhCompMethod = buf.readUInt16LE(lfh + 8);
  if (lfhCompMethod !== entry.compMethod) {
    throw new Error("ZIP: Local File Header and Central Directory compression methods differ");
  }
  if (dataEnd > buf.length) throw new Error("ZIP: compressed data extends past archive end");

  // The Local File Header can store zero sizes when a data descriptor is used.
  // Central Directory values are authoritative for locating the file data.
  const compData = buf.subarray(dataOffset, dataEnd);

  if (entry.compMethod === 0) {
    // Stored (no compression)
    return compData;
  }

  if (entry.compMethod === 8) {
    // Deflated
    const inflated = await new Promise((resolve, reject) => {
      const chunks = [];
      createInflateRaw()
        .on("data", (c) => chunks.push(c))
        .on("end", () => resolve(Buffer.concat(chunks)))
        .on("error", reject)
        .end(compData);
    });
    if (inflated.length !== entry.uncompSize) {
      throw new Error(`ZIP: extracted size mismatch for "${entry.fileName}"`);
    }
    return inflated;
  }

  throw new Error(`ZIP: unsupported compression method ${entry.compMethod}`);
}

// ── Main download + extract ──────────────────────────────

export async function ensureCaddy(platform, { release = pinnedRelease, directory = BIN_DIR, fetcher = fetch } = {}) {
  const target = release.targets[platform];
  if (!target) throw new Error(`Unknown or unsupported platform: ${platform}`);
  if (!/^\d+\.\d+\.\d+$/.test(release.version) || [target.binary, target.archive].some((name) => !name || basename(name) !== name || /[\\/]/.test(name))) throw new Error("Invalid pinned Caddy release");
  const targetPath = join(directory, target.binary);
  if (existsSync(targetPath)) {
    try {
      verifyDigest(readFileSync(targetPath), target.binary_sha256);
      console.log(`Verified cached Caddy ${release.version}: ${target.binary}`);
      return targetPath;
    } catch { console.log(`Replacing an unverified Caddy cache: ${target.binary}`); }
  }
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `.caddy-${randomUUID()}`);
  const archivePath = `${temporary}.archive`;
  const executablePath = `${temporary}.executable`;
  try {
    const url = `${BASE_URL}/v${release.version}/${target.archive}`;
    const response = await fetcher(url, { headers: { "User-Agent": "moss-proxyswitch" }, signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${target.archive}`);
    const archive = Buffer.from(await response.arrayBuffer());
    verifyDigest(archive, target.archive_sha512, "sha512");
    verifyDigest(archive, target.archive_sha256);
    writeFileSync(archivePath, archive, { flag: "wx" });
    const executable = target.archive.endsWith(".zip") ? await extractZip(archivePath, "caddy.exe") : await extractTarGz(archivePath, "caddy");
    verifyDigest(executable, target.binary_sha256);
    writeFileSync(executablePath, executable, { flag: "wx", mode: 0o755 });
    chmodSync(executablePath, 0o755);
    renameSync(executablePath, targetPath);
    console.log(`Verified and installed Caddy ${release.version}: ${target.binary}`);
    return targetPath;
  } finally {
    rmSync(archivePath, { force: true });
    rmSync(executablePath, { force: true });
  }
}

// ── Entry point ──────────────────────────────────────────

async function main() {
  const argVersion = process.argv[2] || "";
  const argPlatform = process.argv[3] || "";

  if (argVersion && argVersion.replace(/^v/, "") !== pinnedRelease.version) throw new Error(`This source tree pins Caddy ${pinnedRelease.version}; update scripts/caddy-release.json and third-party notices before changing versions`);

  const platforms = argPlatform
    ? (argPlatform === "all" ? Object.keys(pinnedRelease.targets) : [argPlatform])
    : [detectPlatform()];

  for (const plat of platforms) {
    await ensureCaddy(plat);
  }

  console.log(`\nAll done! Binaries in: ${BIN_DIR}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
