import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildTargets } from './ci-metadata.mjs'
import { prepareRelease, projectRoot } from './release-notes.mjs'
import { assertEmptyDirectory, commonReleaseFiles, digest, isCurrentInstaller, safeReleaseName, validateInstallerKinds, writeChecksums } from './release-artifacts.mjs'

export async function mergeRelease(input, output, version, targets = buildTargets) {
  await assertEmptyDirectory(output)
  const entries = await readdir(input, { withFileTypes: true })
  if (entries.length !== targets.length || entries.some((entry) => !entry.isDirectory() || !targets.some((item) => item.id === entry.name))) throw new Error('Missing or unexpected platform artifacts')
  const shared = commonReleaseFiles(version), files = new Map(), installerNames = new Set()
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
      if (shared.includes(name)) {
        if (files.has(name) && files.get(name).hash !== hash) throw new Error(`Common release file differs: ${name}`)
      } else {
        if (!isCurrentInstaller(name, version)) throw new Error(`Unexpected release file: ${name}`)
        const key = name.toLowerCase()
        if (installerNames.has(key)) throw new Error(`Duplicate installer name: ${name}`)
        installerNames.add(key)
      }
      files.set(name, { source, hash })
    }
    const listed = await readdir(directory, { withFileTypes: true })
    if (listed.length !== names.size + 1 || listed.some((entry) => !entry.isFile() || entry.name !== 'SHA256SUMS.txt' && !names.has(entry.name))) throw new Error(`Unlisted release files: ${target.id}`)
    if (shared.some((name) => !names.has(name))) throw new Error(`Missing release documentation: ${target.id}`)
    validateInstallerKinds([...names].filter((name) => !shared.includes(name)), target.bundles)
  }
  await mkdir(output, { recursive: true })
  for (const [name, file] of files) await copyFile(file.source, join(output, name), constants.COPYFILE_EXCL)
  await writeChecksums(output, [...files.keys()])
  return [...files.keys()].sort()
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
