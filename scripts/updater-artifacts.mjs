import { createHash, createPublicKey, verify } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { publicReleaseName } from './release-artifacts.mjs'

const config = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
export const updaterPublicKey = config.plugins.updater.pubkey

// Tauri stores minisign public keys and signatures as base64-encoded text.
// Verify both the file signature and the signed comment before publication.
export function verifyUpdateSignature(bytes, encodedSignature, encodedPublicKey = updaterPublicKey) {
  const key = Buffer.from(Buffer.from(encodedPublicKey.trim(), 'base64').toString('utf8').trim().split(/\r?\n/)[1] || '', 'base64')
  const lines = Buffer.from(encodedSignature.trim(), 'base64').toString('utf8').trim().split(/\r?\n/)
  const signature = Buffer.from(lines[1] || '', 'base64'), globalSignature = Buffer.from(lines[3] || '', 'base64')
  if (key.length !== 42 || key.subarray(0, 2).toString() !== 'Ed' || signature.length !== 74 || globalSignature.length !== 64
      || !signature.subarray(2, 10).equals(key.subarray(2, 10)) || !lines[2]?.startsWith('trusted comment: ')) throw new Error('Invalid updater signature or signing key')
  const algorithm = signature.subarray(0, 2).toString()
  if (!['ED', 'Ed'].includes(algorithm)) throw new Error('Unsupported updater signature algorithm')
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]), format: 'der', type: 'spki' })
  const message = algorithm === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes
  if (!verify(null, message, publicKey, signature.subarray(10))
      || !verify(null, Buffer.concat([signature.subarray(10), Buffer.from(lines[2].slice(17))]), publicKey, globalSignature)) throw new Error('Updater signature verification failed')
}

export function macUpdateName(version, target, productName = config.productName) {
  const arch = target.target.split('-')[0]
  return publicReleaseName(`${productName}_${version}_${arch}.app.tar.gz`)
}

export async function collectMacUpdate(bundleDirectory, startedAt, productName = config.productName) {
  const directory = join(bundleDirectory, 'macos')
  const expected = `${productName}.app.tar.gz`
  const entries = await readdir(directory)
  if (!entries.includes(expected) || (await stat(join(directory, expected))).mtimeMs < startedAt - 2000) throw new Error('Missing fresh macOS updater archive')
  if ((await stat(join(directory, `${expected}.sig`))).mtimeMs < startedAt - 2000) throw new Error('Missing fresh macOS updater signature')
  return join(directory, expected)
}

export function updaterEntries(names, target, version) {
  const unique = (extension) => {
    const matches = names.filter(name => name.toLowerCase().endsWith(extension))
    if (matches.length !== 1) throw new Error(`Expected one updater ${extension} for ${target.id}`)
    const name = matches[0]
    if (!names.includes(`${name}.sig`)) throw new Error(`Missing updater signature: ${name}`)
    return name
  }
  if (target.platform === 'windows') {
    const nsis = target.bundles.includes('nsis') ? unique('.exe') : undefined
    const msi = target.bundles.includes('msi') ? unique('.msi') : undefined
    return { 'windows-x86_64': nsis || msi, ...(nsis ? { 'windows-x86_64-nsis': nsis } : {}), ...(msi ? { 'windows-x86_64-msi': msi } : {}) }
  }
  if (target.platform === 'linux') {
    if (!target.bundles.includes('appimage')) return {}
    const appimage = unique('.appimage')
    return { 'linux-x86_64': appimage, 'linux-x86_64-appimage': appimage }
  }
  const name = unique('.app.tar.gz')
  if (name !== macUpdateName(version, target)) throw new Error(`Unexpected macOS updater archive: ${name}`)
  return { [`darwin-${target.target.split('-')[0]}`]: name }
}

export async function createUpdatePlatforms(directory, names, target, version, publicKey = updaterPublicKey) {
  const entries = updaterEntries(names, target, version), platforms = {}
  const payloads = new Set(Object.values(entries))
  for (const name of payloads) {
    const signature = (await readFile(join(directory, `${name}.sig`), 'utf8')).trim()
    verifyUpdateSignature(await readFile(join(directory, name)), signature, publicKey)
    for (const [key, file] of Object.entries(entries)) if (file === name) platforms[key] = { signature, url: `https://github.com/MosYCo/ProxySwitch/releases/download/v${version}/${publicReleaseName(name)}` }
  }
  const expectedSignatures = new Set([...payloads].map(name => `${name}.sig`))
  if (names.some(name => name.endsWith('.sig') && !expectedSignatures.has(name))) throw new Error('Unexpected updater signature')
  return platforms
}

export function updateManifest(release, platforms) {
  return { version: release.version, notes: release.markdown, pub_date: `${release.date}T00:00:00Z`, platforms }
}
