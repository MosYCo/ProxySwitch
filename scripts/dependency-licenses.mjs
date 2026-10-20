import { readFileSync, writeFileSync, readdirSync, existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const legalName = /^(licen[cs]e|copying|notice|copyright)/i
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const normalize = (text) => text.replace(/\r\n/g, '\n').trim()
function legalFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).filter((file) => file.isFile() && legalName.test(file.name)).map((file) => ({ name: file.name, text: normalize(readFileSync(join(directory, file.name), 'utf8')) })).sort((a,b) => a.name < b.name ? -1 : 1)
}
function fallback(expression) {
  return [...new Set(expression.match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g) || [])].filter((id) => existsSync(join(root, 'licenses/spdx', `${id}.txt`))).map((id) => ({ name: `SPDX ${id} (upstream package declares this license without a license file)`, text: normalize(readFileSync(join(root, 'licenses/spdx', `${id}.txt`), 'utf8')) }))
}
function findPackage(name, parent) {
  let directory = parent
  while (true) {
    const candidate = join(directory, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    const next = dirname(directory); if (next === directory) throw new Error(`Missing installed dependency: ${name}`)
    directory = next
  }
}
function npmPackages() {
  const packages = new Map()
  function visit(name, parent, optional = false) {
    let directory
    try { directory = findPackage(name, parent) } catch (error) { if (optional) return; throw error }
    const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    const id = `${metadata.name}@${metadata.version}`
    if (packages.has(id)) return
    const license = typeof metadata.license === 'string' ? metadata.license : metadata.license?.type || metadata.licenses?.map((item) => item.type).join(' OR ')
    if (!license) throw new Error(`Missing npm license declaration: ${id}`)
    const files = legalFiles(directory)
    packages.set(id, { id, license, authors: JSON.stringify(metadata.author || metadata.contributors || ''), source: `https://registry.npmjs.org/${metadata.name}/-/${metadata.name.split('/').pop()}-${metadata.version}.tgz`, files: files.length ? files : fallback(license) })
    for (const dependency of Object.keys(metadata.dependencies || {})) visit(dependency, directory)
    for (const dependency of Object.keys(metadata.optionalDependencies || {})) visit(dependency, directory, true)
  }
  const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  for (const name of Object.keys(metadata.dependencies)) visit(name, root)
  return [...packages.values()]
}
function rustPackages() {
  const target = execFileSync('rustc', ['-vV'], { cwd: root }).toString().match(/^host: (.+)$/m)?.[1]
  if (!target) throw new Error('Could not determine the Rust target')
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--filter-platform', target], { cwd: join(root, 'src-tauri'), maxBuffer: 64 * 1024 * 1024 }).toString())
  return metadata.packages.filter((item) => item.name !== 'caddy-proxy-tools').map((item) => {
    const files = legalFiles(dirname(item.manifest_path))
    if (item.license_file) {
      const directory = dirname(item.manifest_path)
      const path = resolve(directory, item.license_file)
      if (!path.startsWith(directory + sep)) throw new Error(`License file escapes package directory: ${item.name}`)
      const name = relative(directory, path).replaceAll('\\', '/')
      if (existsSync(path) && !files.some((file) => file.name === name)) files.push({ name, text: normalize(readFileSync(path, 'utf8')) })
    }
    return { id: `${item.name}@${item.version}`, license: item.license || 'See upstream license file', authors: item.authors.join('; '), source: `https://crates.io/crates/${item.name}/${item.version}`, files: files.length ? files : fallback(item.license || '') }
  })
}

const manifestHash = sha(readFileSync(join(root, 'scripts/caddy-release.json')))
const caddyNotices = readFileSync(join(root, 'licenses/CADDY_DEPENDENCIES.txt'), 'utf8')
if (!caddyNotices.includes(`Release manifest SHA-256: ${manifestHash}`)) throw new Error('Caddy dependency notices are stale; run node scripts/caddy-licenses.mjs')
const packages = [...npmPackages().map((item) => ({ ...item, ecosystem: 'npm' })), ...rustPackages().map((item) => ({ ...item, ecosystem: 'Rust' }))].sort((a,b) => `${a.ecosystem}:${a.id}` < `${b.ecosystem}:${b.id}` ? -1 : 1)
for (const item of packages) if (!item.files.length) throw new Error(`No license text found for ${item.ecosystem}:${item.id}`)
const sections = packages.map((item) => `${'='.repeat(72)}\n${item.ecosystem}: ${item.id}\nDeclared license: ${item.license}\nAuthors: ${item.authors || 'See upstream source copyright notices'}\nSource: ${item.source}\n${item.files.map((file) => `\n--- ${file.name} ---\n${file.text}\n`).join('')}`)
writeFileSync(join(root, 'licenses/DEPENDENCIES.txt'), `Third-party dependency licenses\n\nGenerated by scripts/dependency-licenses.mjs from installed production npm dependencies\nand the locked Cargo dependency graph for the current build target. Cargo entries also\ninclude build/test dependencies. Registry source URLs identify the corresponding sources.\nCaddy and its Go modules are covered separately in Caddy-LICENSE.txt and CADDY_DEPENDENCIES.txt.\nWhen a crate omits license files, its declared SPDX text and author metadata are included.\n\n${sections.join('\n')}`)
console.log(`Wrote license notices for ${packages.length} npm and Rust packages`)
