import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pinnedRelease, extractZip, extractTarGz, verifyDigest } from './download-caddy.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const legalName = /(?:^|\/)(?:licen[cs]e[^/]*|copying[^/]*|notice[^/]*|copyright[^/]*)$/i

function buildInfo(binary) {
  const offset = binary.indexOf(Buffer.from('\xff Go buildinf:', 'latin1'))
  if (offset < 0 || !(binary[offset + 15] & 2)) throw new Error('Unsupported Caddy Go build information')
  let position = offset + 32
  const string = () => {
    let length = 0, shift = 0, byte
    do { byte = binary[position++]; length += (byte & 127) * 2 ** shift; shift += 7 } while (byte & 128)
    const result = binary.toString('utf8', position, position + length); position += length; return result
  }
  string()
  const dependencies = []
  for (const line of string().split('\n')) {
    const parts = line.split('\t')
    if (parts[0] === 'dep') dependencies.push({ module: parts[1], version: parts[2], sum: parts[3] })
    else if (parts[0] === '=>') dependencies[dependencies.length - 1] = { module: parts[1], version: parts[2], sum: parts[3] }
  }
  return dependencies
}

function zipFiles(bytes) {
  let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0) throw new Error('Invalid module ZIP')
  let position = bytes.readUInt32LE(end + 16)
  const count = bytes.readUInt16LE(end + 10)
  const files = []
  for (let index = 0; index < count; index++) {
    if (bytes.readUInt32LE(position) !== 0x02014b50) throw new Error('Invalid ZIP directory')
    const method = bytes.readUInt16LE(position + 10), size = bytes.readUInt32LE(position + 20)
    const nameSize = bytes.readUInt16LE(position + 28), extra = bytes.readUInt16LE(position + 30), comment = bytes.readUInt16LE(position + 32)
    const name = bytes.toString('utf8', position + 46, position + 46 + nameSize)
    const local = bytes.readUInt32LE(position + 42)
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
    const compressed = bytes.subarray(start, start + size)
    if (!name.endsWith('/')) files.push({ name, bytes: method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : (() => { throw new Error('Unsupported ZIP compression') })() })
    position += 46 + nameSize + extra + comment
  }
  return files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}

async function download(url, path) {
  try { return await readFile(path) } catch (error) { if (error.code !== 'ENOENT') throw error }
  let failure
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
      const bytes = Buffer.from(await response.arrayBuffer()); await writeFile(path, bytes); return bytes
    } catch (error) { failure = error }
  }
  throw new Error(`Unable to obtain license sources: ${url}`, { cause: failure })
}

export async function collectCaddyLicenses() {
  const cache = resolve(root, 'artifacts/caddy-upstream')
  await mkdir(cache, { recursive: true })
  const modules = new Map()
  for (const target of Object.values(pinnedRelease.targets)) {
    const path = resolve(cache, target.archive)
    const archive = await download(`https://github.com/caddyserver/caddy/releases/download/v${pinnedRelease.version}/${target.archive}`, path)
    verifyDigest(archive, target.archive_sha512, 'sha512'); verifyDigest(archive, target.archive_sha256)
    const executable = target.archive.endsWith('.zip') ? await extractZip(path, 'caddy.exe') : await extractTarGz(path, 'caddy')
    verifyDigest(executable, target.binary_sha256)
    for (const dependency of buildInfo(executable)) {
      const key = `${dependency.module}@${dependency.version}`
      if (modules.has(key) && modules.get(key).sum !== dependency.sum) throw new Error(`Conflicting Go module checksum: ${key}`)
      modules.set(key, dependency)
    }
  }
  const sorted = [...modules.values()].sort((a, b) => `${a.module}@${a.version}`.localeCompare(`${b.module}@${b.version}`, 'en'))
  const results = new Array(sorted.length)
  let next = 0, complete = 0
  async function worker() {
    while (next < sorted.length) {
      const index = next++, dependency = sorted[index]
      const escape = (value) => value.replace(/[A-Z]/g, (letter) => `!${letter.toLowerCase()}`)
      const url = `https://proxy.golang.org/${escape(dependency.module)}/@v/${escape(dependency.version)}.zip`
      const bytes = await download(url, resolve(cache, `${hash(Buffer.from(url))}.zip`))
      const files = zipFiles(bytes)
      const sum = 'h1:' + createHash('sha256').update(files.map((file) => `${hash(file.bytes)}  ${file.name}\n`).join('')).digest('base64')
      if (sum !== dependency.sum) throw new Error(`Go module source checksum mismatch: ${dependency.module}@${dependency.version}`)
      const legal = files.filter((file) => legalName.test(file.name))
      if (!legal.length) throw new Error(`No license files found: ${dependency.module}@${dependency.version}`)
      const prefix = `${dependency.module}@${dependency.version}/`
      results[index] = `\n${'='.repeat(72)}\n${dependency.module}@${dependency.version}\nSource: ${url}\nGo source checksum: ${sum}\n${legal.map((file) => `\n--- ${file.name.slice(prefix.length)} ---\n${file.bytes.toString('utf8').trim()}\n`).join('')}`
      complete++; if (complete % 10 === 0) console.log(`Caddy dependency licenses: ${complete}/${sorted.length}`)
    }
  }
  const workers = await Promise.allSettled([worker(), worker(), worker(), worker()])
  for (const result of workers) if (result.status === 'rejected') throw result.reason
  const manifestHash = hash(await readFile(resolve(root, 'scripts/caddy-release.json')))
  await writeFile(resolve(root, 'licenses/CADDY_DEPENDENCIES.txt'), `Caddy ${pinnedRelease.version} dependency notices\nRelease manifest SHA-256: ${manifestHash}\n\nGenerated from the Go module information in all four verified official binaries.\nModule archives are checked against the Go h1 checksums embedded in those binaries.\nThe following files retain the upstream license and copyright notices.\n${results.join('')}`)
  console.log(`Wrote notices for ${sorted.length} Caddy Go modules`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await collectCaddyLicenses()
