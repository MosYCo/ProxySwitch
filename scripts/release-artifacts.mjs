import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

export const bundleExtensions = { nsis: '.exe', msi: '.msi', deb: '.deb', rpm: '.rpm', appimage: '.appimage', dmg: '.dmg' }
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const commonReleaseFiles = (version) => [`RELEASE_NOTES_${version}.md`, 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.zip']
export const safeReleaseName = (name) => name && !['.', '..'].includes(name) && basename(name) === name && !/[\\/\r\n\0]/.test(name)

export function publicReleaseName(name) {
  if (!safeReleaseName(name)) throw new Error(`Unsafe public release filename: ${name}`)
  const normalized = name.replaceAll(' ', '.')
  if (!/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(normalized) || normalized.endsWith('.')) throw new Error(`Unsafe public release filename: ${name}`)
  return normalized
}

export function isCurrentInstaller(name, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safeReleaseName(name) && new RegExp(`(?:^|[_-])${escaped}(?=[_-])`).test(name) && /\.(exe|msi|deb|rpm|AppImage|dmg)$/i.test(name)
}

export async function collectInstallers(directory, version, startedAt) {
  const artifacts = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) artifacts.push(...await collectInstallers(path, version, startedAt))
    else if (entry.isFile() && isCurrentInstaller(entry.name, version) && (await stat(path)).mtimeMs >= startedAt - 2000) artifacts.push(path)
  }
  return artifacts
}

export function validateInstallerKinds(names, bundles) {
  for (const kind of bundles) {
    const extension = bundleExtensions[kind]
    if (!extension || !names.some((name) => name.toLowerCase().endsWith(extension))) throw new Error(`Missing installer format: ${kind}`)
  }
  if (names.some((name) => !bundles.some((kind) => name.toLowerCase().endsWith(bundleExtensions[kind])))) throw new Error('Unexpected installer format')
}

export async function assertEmptyDirectory(directory) {
  try {
    if ((await readdir(directory)).length) throw new Error(`发布目录已有产物，不会覆盖：${directory}`)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}

export async function writeChecksums(directory, names) {
  if (names.some((name) => !safeReleaseName(name)) || new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error('Invalid or duplicate release filename')
  const lines = await Promise.all([...names].sort().map(async (name) => `${digest(await readFile(join(directory, name)))}  ${name}`))
  await writeFile(join(directory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`)
}
