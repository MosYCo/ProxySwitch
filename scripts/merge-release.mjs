import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildTargets } from './ci-metadata.mjs'
import { prepareRelease, projectRoot } from './release-notes.mjs'
import { assertEmptyDirectory, commonReleaseFiles, digest, isCurrentInstaller, publicReleaseName, safeReleaseName, validateInstallerKinds, writeChecksums } from './release-artifacts.mjs'
import { createUpdatePlatforms, macUpdateName, updaterPublicKey } from './updater-artifacts.mjs'

export async function mergeRelease(input, output, version, targets = buildTargets, publicKey = updaterPublicKey) {
  await assertEmptyDirectory(output)
  const entries = await readdir(input, { withFileTypes: true })
  if (entries.length !== targets.length || entries.some((entry) => !entry.isDirectory() || !targets.some((item) => item.id === entry.name))) throw new Error('Missing or unexpected platform artifacts')
  const shared = commonReleaseFiles(version), files = new Map(), installerNames = new Set()
  let updateMetadata
  const platforms = {}
  for (const target of targets) {
    const directory = join(input, target.id)
    const sums = (await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8')).trim().split(/\r?\n/)
    const names = new Set()
    for (const line of sums) {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line)
      if (!match || !safeReleaseName(match[2]) || match[2] === 'SHA256SUMS.txt' || names.has(match[2])) throw new Error(`Invalid checksums: ${target.id}`)
      const [, hash, name] = match
      names.add(name)
      const source = join(directory, name)
      if (digest(await readFile(source)) !== hash) throw new Error(`Checksum mismatch: ${target.id}/${name}`)
      const outputName = publicReleaseName(name)
      if (name === 'latest.json') continue
      if (shared.includes(name)) {
        if (files.has(outputName) && files.get(outputName).hash !== hash) throw new Error(`Common release file differs: ${name}`)
      } else {
        const payload = name.endsWith('.sig') ? name.slice(0, -4) : name
        if (!isCurrentInstaller(payload, version) && !(target.platform.startsWith('macos') && payload === macUpdateName(version, target))) throw new Error(`Unexpected release file: ${name}`)
        const key = outputName.toLowerCase()
        if (installerNames.has(key)) throw new Error(`Duplicate installer name: ${name}`)
        installerNames.add(key)
      }
      files.set(outputName, { source, hash })
    }
    const listed = await readdir(directory, { withFileTypes: true })
    if (listed.length !== names.size + 1 || listed.some((entry) => !entry.isFile() || entry.name !== 'SHA256SUMS.txt' && !names.has(entry.name))) throw new Error(`Unlisted release files: ${target.id}`)
    if (shared.some((name) => !names.has(name))) throw new Error(`Missing release documentation: ${target.id}`)
    validateInstallerKinds([...names].filter((name) => !shared.includes(name) && name !== 'latest.json' && !name.endsWith('.sig') && !name.endsWith('.app.tar.gz')), target.bundles)
    const verified = await createUpdatePlatforms(directory, [...names], target, version, publicKey)
    if (!names.has('latest.json')) throw new Error(`Missing update manifest: ${target.id}`)
    const manifest = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8'))
    const { platforms: announced, ...metadata } = manifest
    if (metadata.version !== version || !metadata.notes || !/^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(metadata.pub_date)
        || JSON.stringify(announced) !== JSON.stringify(verified)) throw new Error(`Invalid update manifest: ${target.id}`)
    if (updateMetadata && JSON.stringify(metadata) !== JSON.stringify(updateMetadata)) throw new Error('Update metadata differs between platforms')
    updateMetadata = metadata
    for (const [key, value] of Object.entries(verified)) {
      if (platforms[key]) throw new Error(`Duplicate update platform: ${key}`)
      platforms[key] = value
    }
  }
  await mkdir(output, { recursive: true })
  for (const [name, file] of files) await copyFile(file.source, join(output, name), constants.COPYFILE_EXCL)
  await writeFile(join(output, 'latest.json'), `${JSON.stringify({ ...updateMetadata, platforms }, null, 2)}\n`, { flag: 'wx' })
  const published = [...files.keys(), 'latest.json']
  await writeChecksums(output, published)
  return published.sort()
}

async function main() {
  const release = await prepareRelease(projectRoot, process.env.RELEASE_TAG || undefined)
  const input = resolve(process.argv[2] || 'artifacts/release-inputs'), output = resolve(process.argv[3] || 'artifacts/release-assets')
  const names = await mergeRelease(input, output, release.version)
  console.log(`Verified and merged ${buildTargets.length} platforms: ${names.join(', ')}, SHA256SUMS.txt`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
