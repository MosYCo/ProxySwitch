import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { buildTargets } from '../scripts/ci-metadata.mjs'
import { collectInstallers, commonReleaseFiles, isCurrentInstaller, publicReleaseName, validateInstallerKinds, writeChecksums } from '../scripts/release-artifacts.mjs'
import { mergeRelease } from '../scripts/merge-release.mjs'
import { collectMacUpdate, createUpdatePlatforms, macUpdateName, updateManifest, verifyUpdateSignature } from '../scripts/updater-artifacts.mjs'
import { createTestSigner } from './fixtures/updater-signing.mjs'

const version = '0.1.0'
const signer = createTestSigner()
const release = { version, date: '2026-10-21', markdown: '# Test release\n\n- Update fixture\n' }
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
    if (target.platform.startsWith('macos')) await writeFile(join(directory, macUpdateName(version, target)), `Updater fixture: ${target.id}`)
    for (const name of await readdir(directory)) {
      if (/\.(exe|msi|AppImage|app\.tar\.gz)$/i.test(name)) await writeFile(join(directory, `${name}.sig`), signer.sign(await readFile(join(directory, name))))
    }
    const platforms = await createUpdatePlatforms(directory, await readdir(directory), target, version, signer.publicKey)
    await writeFile(join(directory, 'latest.json'), JSON.stringify(updateManifest(release, platforms)))
    await refreshSums(directory)
  }
  return { input, output }
}

async function refreshSums(directory) {
  await writeChecksums(directory, (await readdir(directory)).filter(name => name !== 'SHA256SUMS.txt'))
}

const publishedUpdaterFiles = [
  ...publishedInstallers.filter(name => /\.(exe|msi|AppImage)$/i.test(name)).map(name => `${name}.sig`),
  ...buildTargets.filter(target => target.platform.startsWith('macos')).flatMap(target => { const name = macUpdateName(version, target); return [name, `${name}.sig`] }),
  'latest.json',
]

const merge = (input, output) => mergeRelease(input, output, version, buildTargets, signer.publicKey)

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
  const names = await merge(input, output)
  const expected = [...publishedInstallers, ...publishedUpdaterFiles, ...commonReleaseFiles(version)].sort()
  assert.deepEqual(names, expected)
  assert.deepEqual((await readdir(output)).sort(), [...expected, 'SHA256SUMS.txt'].sort())
  const sums = (await readFile(join(output, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n')
  assert.equal(sums.length, expected.length)
  for (const line of sums) {
    const [, hash, name] = /^([a-f0-9]{64})  (.+)$/.exec(line)
    assert.equal(hash, createHash('sha256').update(await readFile(join(output, name))).digest('hex'))
  }
  const manifest = JSON.parse(await readFile(join(output, 'latest.json'), 'utf8'))
  assert.equal(manifest.version, version)
  assert.deepEqual(Object.keys(manifest.platforms).sort(), ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'linux-x86_64-appimage', 'windows-x86_64', 'windows-x86_64-msi', 'windows-x86_64-nsis'])
  for (const entry of Object.values(manifest.platforms)) {
    const name = new URL(entry.url).pathname.split('/').at(-1)
    verifyUpdateSignature(await readFile(join(output, name)), entry.signature, signer.publicKey)
    assert.ok(expected.includes(name))
    assert.equal(entry.signature, (await readFile(join(output, `${name}.sig`), 'utf8')).trim())
  }
})

test('publication rejects incomplete, inconsistent, altered or ambiguous artifacts before writing output', async (t) => {
  const cases = [
    ['missing platform', async (input) => rm(join(input, 'macos-x64'), { recursive: true }), /Missing or unexpected platform/],
    ['changed installer', async (input) => writeFile(join(input, 'linux-x64', installers['linux-x64'][0]), 'altered'), /Checksum mismatch/],
    ['different common notices', async (input) => {
      const directory = join(input, 'linux-x64')
      await writeFile(join(directory, 'LICENSE'), 'different')
      await refreshSums(directory)
    }, /Common release file differs/],
    ['missing RPM', async (input) => {
      const directory = join(input, 'linux-x64')
      await rm(join(directory, installers['linux-x64'][1]))
      await refreshSums(directory)
    }, /Missing installer format: rpm/],
    ['colliding architecture names', async (input) => {
      const directory = join(input, 'macos-x64')
      await rename(join(directory, installers['macos-x64'][0]), join(directory, installers['macos-arm64'][0]))
      await refreshSums(directory)
    }, /Duplicate installer name/],
    ['filenames collide after GitHub normalization', async (input) => {
      const directory = join(input, 'macos-x64')
      const name = 'Moss.ProxySwitch_0.1.0_aarch64.dmg'
      await rename(join(directory, installers['macos-x64'][0]), join(directory, name))
      await refreshSums(directory)
    }, /Duplicate installer name/],
    ['path traversal', async (input) => writeFile(join(input, 'windows-x64', 'SHA256SUMS.txt'), `${'0'.repeat(64)}  ../outside.txt\n`), /Invalid checksums/],
    ['unsigned updater', async (input) => {
      const directory = join(input, 'windows-x64')
      await rm(join(directory, `${installers['windows-x64'][0]}.sig`))
      await refreshSums(directory)
    }, /Missing updater signature/],
    ['signed payload changed with checksums regenerated', async (input) => {
      const directory = join(input, 'windows-x64')
      await writeFile(join(directory, installers['windows-x64'][0]), 'altered but hashed')
      await refreshSums(directory)
    }, /Updater signature verification failed/],
    ['update URL points outside release assets', async (input) => {
      const directory = join(input, 'windows-x64'), path = join(directory, 'latest.json')
      const manifest = JSON.parse(await readFile(path, 'utf8'))
      manifest.platforms['windows-x86_64'].url = 'https://example.com/unsigned.exe'
      await writeFile(path, JSON.stringify(manifest)); await refreshSums(directory)
    }, /Invalid update manifest/],
  ]
  for (const [name, mutate, error] of cases) await t.test(name, async (subtest) => {
    const { input, output } = await fixture(subtest)
    await mutate(input)
    await assert.rejects(merge(input, output), error)
    await assert.rejects(stat(output), { code: 'ENOENT' })
  })
})

test('publication does not overwrite an existing output directory', async (t) => {
  const { input, output } = await fixture(t)
  await mkdir(output)
  await writeFile(join(output, 'existing.txt'), 'preserve')
  await assert.rejects(merge(input, output), /不会覆盖/)
  assert.equal(await readFile(join(output, 'existing.txt'), 'utf8'), 'preserve')
})

test('updater rejects another signing key and altered trusted comments', () => {
  const bytes = Buffer.from('Update payload'), signature = signer.sign(bytes)
  verifyUpdateSignature(bytes, signature, signer.publicKey)
  assert.throws(() => verifyUpdateSignature(bytes, signature, createTestSigner().publicKey), /Invalid updater signature/)
  const changed = Buffer.from(Buffer.from(signature, 'base64').toString().replace('timestamp:1', 'timestamp:2')).toString('base64')
  assert.throws(() => verifyUpdateSignature(bytes, changed, signer.publicKey), /Updater signature verification failed/)
})

test('macOS collection rejects stale versionless archives and absent signatures', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'proxyswitch-mac-update-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'macos'); await mkdir(directory)
  const archive = join(directory, 'Moss ProxySwitch.app.tar.gz')
  await writeFile(archive, 'fixture')
  await assert.rejects(collectMacUpdate(root, Date.now()), { code: 'ENOENT' })
  await writeFile(`${archive}.sig`, 'fixture signature')
  assert.equal(await collectMacUpdate(root, Date.now()), archive)
  await utimes(archive, new Date(0), new Date(0))
  await assert.rejects(collectMacUpdate(root, Date.now()), /Missing fresh macOS updater archive/)
})

test('local Windows builds may select one installer without announcing a nonexistent format', async (t) => {
  const { input } = await fixture(t)
  const target = buildTargets.find(target => target.id === 'windows-x64'), directory = join(input, target.id)
  const msi = installers['windows-x64'][1]
  const platforms = await createUpdatePlatforms(directory, [msi, `${msi}.sig`], { ...target, bundles: ['msi'] }, version, signer.publicKey)
  assert.deepEqual(Object.keys(platforms), ['windows-x86_64', 'windows-x86_64-msi'])
  assert.equal(platforms['windows-x86_64'].url.endsWith('.msi'), true)
})
