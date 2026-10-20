import { copyFileSync, mkdtempSync, rmSync, rmdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const icons = join(root, "src-tauri", "icons")
const require = createRequire(import.meta.url)
const cli = require.resolve("@tauri-apps/cli/tauri.js")

function generate(source, output, sizes = []) {
  const result = spawnSync(process.execPath, [cli, "icon", source, "--output", output, ...sizes.flatMap((size) => ["--png", String(size)])], { cwd: root, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Icon generation failed: ${source}`)
}

// The same SVG powers the sidebar, favicon, and every native app icon.
generate(join(icons, "app-icon.svg"), icons)
copyFileSync(join(icons, "32x32.png"), join(icons, "tray-icon.png"))

const temporary = mkdtempSync(join(tmpdir(), "caddy-proxy-tools-icons-"))
try {
  generate(join(icons, "tray-template.svg"), temporary, [32])
  copyFileSync(join(temporary, "32x32.png"), join(icons, "tray-template.png"))
} finally {
  rmSync(join(temporary, "32x32.png"), { force: true })
  rmdirSync(temporary)
}
console.log("Updated app icons and platform-specific tray icons.")
