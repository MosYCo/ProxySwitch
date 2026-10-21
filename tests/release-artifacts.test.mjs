import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { buildTargets } from '../scripts/ci-metadata.mjs'
import { collectInstallers, commonReleaseFiles, isCurrentInstaller, publicReleaseName, validateInstallerKinds, writeChecksums } from '../scripts/release-artifacts.mjs'
import { mergeRelease } from '../scripts/merge-release.mjs'

const version = '0.1.0'
const installers = {
  'windows-x64': ['Moss ProxySwitch_0.1.0_x64-setup.exe', 'Moss ProxySwitch_0.1.0_x64_en-US.msi'],
  'linux-x64': ['Moss ProxySwitch_0.1.0_amd64.deb', 'Moss ProxySwitch-0.1.0-1.x86_64.rpm', 'Moss ProxySwitch_0.1.0_amd64.AppImage'],
  'macos-arm64': ['Moss ProxySwitch_0.1.0_aarch64.dmg'],
  'macos-x64': ['Moss ProxySwitch_0.1.0_x64.dmg'],
}

const publishedInstallers = [
  'Moss.ProxySwitch_0.1.0_x64-setup.exe',
  'Moss.ProxySwitch_0.1.0_x64_en-US.msi',
  'Moss.ProxySwitch_0.1.0_amd64.deb',
  'Moss.ProxySwitch-0.1.0-1.x86_64.rpm',
  'Moss.ProxySwitch_0.1.0_amd64.AppImage',
  'Moss.ProxySwitch_0.1.0_aarch64.dmg',
  'Moss.ProxySwitch_0.1.0_x64.dmg',
]

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'proxyswitch-release-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = join(root, 'input'), output = join(root, 'output')
  for (const target of buildTargets) {
    const directory = join(input, target.id)
    await mkdir(directory, { recursive: true })
    const shared = commonReleaseFiles(version)
    for (const name of shared) await writeFile(join(directory, name), `Common fixture: ${name}\n`)
    for (const name of installers[target.id]) await writeFile(join(directory, name), `Installer fixture: ${target.id}/${name}\n`)
    await writeChecksums(directory, [...shared, ...installers[target.id]])
  }
  return { input, output }
}

test('installer names cover Windows, both macOS architectures, and Linux including RPM', () => {
  for (const name of Object.values(installers).flat()) assert.equal(isCurrentInstaller(name, version), true, name)
  for (const name of ['Moss_0.1.01_x64.dmg', 'Moss_0.1.0.1_x64.exe', 'Moss_0.1.0_x64.exe.sig', 'moss-0.1.1-1.x86_64.rpm', '../Moss_0.1.0_x64.dmg', 'caddy.exe']) assert.equal(isCurrentInstaller(name, version), false, name)
})

test('public filenames match GitHub download names and reject characters GitHub would rename', () => {
  assert.deepEqual(Object.values(installers).flat().map(publicReleaseName), publishedInstallers)
  for (const name of commonReleaseFiles(version)) assert.equal(publicReleaseName(name), name)
  for (const name of ['../outside.exe', '.hidden.exe', 'Moss#ProxySwitch.exe', 'Moss\tProxySwitch.exe', 'Moss.exe.']) assert.throws(() => publicReleaseName(name), /Unsafe public release filename/)
})

test('collection ignores stale bundles, other versions and unrelated executables', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'proxyswitch-collection-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const nested = join(root, 'rpm'); await mkdir(nested)
  const current = join(nested, installers['linux-x64'][1])
  const stale = join(root, installers['windows-x64'][0])
  for (const path of [current, stale, join(root, 'Moss_0.0.9_x64.dmg'), join(root, 'caddy.exe')]) await writeFile(path, 'fixture')
  await utimes(stale, new Date(0), new Date(0))
  assert.deepEqual((await collectInstallers(root, version, Date.now())).map((path) => basename(path)), [basename(current)])
  assert.throws(() => validateInstallerKinds([basename(current)], ['deb', 'rpm', 'appimage']), /Missing installer format/)
})

test('publication preserves every installer and emits one complete SHA-256 manifest', async (t) => {
  const { input, output } = await fixture(t)
  const names = await mergeRelease(input, output, version)
  const expected = [...publishedInstallers, ...commonReleaseFiles(version)].sort()
  assert.deepEqual(names, expected)
  assert.deepEqual((await readdir(output)).sort(), [...expected, 'SHA256SUMS.txt'].sort())
  const sums = (await readFile(join(output, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n')
  assert.equal(sums.length, expected.length)
  for (const line of sums) {
    const [, hash, name] = /^([a-f0-9]{64})  (.+)$/.exec(line)
    assert.equal(hash, createHash('sha256').update(await readFile(join(output, name))).digest('hex'))
  }
})

test('publication rejects incomplete, inconsistent, altered or ambiguous artifacts before writing output', async (t) => {
  const cases = [
    ['missing platform', async (input) => rm(join(input, 'macos-x64'), { recursive: true }), /Missing or unexpected platform/],
    ['changed installer', async (input) => writeFile(join(input, 'linux-x64', installers['linux-x64'][0]), 'altered'), /Checksum mismatch/],
    ['different common notices', async (input) => {
      const directory = join(input, 'linux-x64')
      await writeFile(join(directory, 'LICENSE'), 'different')
      await writeChecksums(directory, [...commonReleaseFiles(version), ...installers['linux-x64']])
    }, /Common release file differs/],
    ['missing RPM', async (input) => {
      const directory = join(input, 'linux-x64')
      await rm(join(directory, installers['linux-x64'][1]))
      await writeChecksums(directory, [...commonReleaseFiles(version), ...installers['linux-x64'].filter((name) => !name.endsWith('.rpm'))])
    }, /Missing installer format: rpm/],
    ['colliding architecture names', async (input) => {
      const directory = join(input, 'macos-x64')
      await rename(join(directory, installers['macos-x64'][0]), join(directory, installers['macos-arm64'][0]))
      await writeChecksums(directory, [...commonReleaseFiles(version), ...installers['macos-arm64']])
    }, /Duplicate installer name/],
    ['filenames collide after GitHub normalization', async (input) => {
      const directory = join(input, 'macos-x64')
      const name = 'Moss.ProxySwitch_0.1.0_aarch64.dmg'
      await rename(join(directory, installers['macos-x64'][0]), join(directory, name))
      await writeChecksums(directory, [...commonReleaseFiles(version), name])
    }, /Duplicate installer name/],
    ['path traversal', async (input) => writeFile(join(input, 'windows-x64', 'SHA256SUMS.txt'), `${'0'.repeat(64)}  ../outside.txt\n`), /Invalid checksums/],
  ]
  for (const [name, mutate, error] of cases) await t.test(name, async (subtest) => {
    const { input, output } = await fixture(subtest)
    await mutate(input)
    await assert.rejects(mergeRelease(input, output, version), error)
    await assert.rejects(stat(output), { code: 'ENOENT' })
  })
})

test('publication does not overwrite an existing output directory', async (t) => {
  const { input, output } = await fixture(t)
  await mkdir(output)
  await writeFile(join(output, 'existing.txt'), 'preserve')
  await assert.rejects(mergeRelease(input, output, version), /不会覆盖/)
  assert.equal(await readFile(join(output, 'existing.txt'), 'utf8'), 'preserve')
})
