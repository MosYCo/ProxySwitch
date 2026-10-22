import test from 'node:test'
import assert from 'node:assert/strict'
import { extractRelease, validateVersions, validateReleaseTag } from '../scripts/release-notes.mjs'
import { isCurrentInstaller, tauriBuildArgs } from '../scripts/package-release.mjs'
import { buildTargets } from '../scripts/ci-metadata.mjs'

const packageJson = { version: '2.1.0' }
const cargo = '[package]\nname = "caddy-proxy-tools"\nversion = "2.1.0"\n\n[dependencies]\n'
const lock = '[[package]]\nname = "caddy-proxy-tools"\nversion = "2.1.0"\n'

test('release commands request the application bundle required for signed macOS updates', () => {
  for (const target of buildTargets) {
    for (const bundleArgs of [['--bundles', target.bundles.join(',')], [`--bundles=${target.bundles.join(',')}`]]) {
      const args = tauriBuildArgs(['--ci', '--target', target.target, ...bundleArgs], ['--locked'], target)
      const separator = args.indexOf('--')
      const cli = args.slice(0, separator)
      const requestedBundles = cli.flatMap((arg, index) => arg === '--bundles' ? cli[index + 1].split(',') : arg.startsWith('--bundles=') ? arg.slice(10).split(',') : [])
      // Tauri only creates .app.tar.gz when app is explicitly requested;
      // building dmg alone creates an intermediate .app without an update.
      const required = target.platform.startsWith('macos') ? ['app', 'dmg'] : target.bundles
      assert.deepEqual([...new Set(requestedBundles)].sort(), [...required].sort(), target.id)
      assert.deepEqual(args.slice(separator + 1), ['--locked'])
      assert.equal(target.bundles.includes('app'), false, 'The internal app bundle is not a public installer format')
    }
  }
})

test('release tags must match the exact application version', () => {
  assert.doesNotThrow(() => validateReleaseTag('v2.1.1', '2.1.1'))
  assert.throws(() => validateReleaseTag('v2.1.0', '2.1.1'), /不一致/)
  assert.throws(() => validateReleaseTag('2.1.1', '2.1.1'), /不一致/)
})

test('release requires matching application versions including the Cargo lock', () => {
  assert.equal(validateVersions(packageJson, packageJson, cargo, lock), '2.1.0')
  assert.throws(() => validateVersions(packageJson, { version: '2.0.4' }, cargo, lock), /版本必须一致/)
  assert.throws(() => validateVersions(packageJson, packageJson, cargo, lock.replace('2.1.0', '2.0.4')), /版本必须一致/)
})
test('release notes contain only the requested version and preserve Markdown', () => {
  const result = extractRelease('# 更新日志\n\n## [2.1.0] - 2026-10-20\n\n### 新增\n\n- 项目请求记录\n\n## [2.0.4] - 2026-10-19\n\n- 历史变更\n', '2.1.0')
  assert.match(result.markdown, /### 新增\n\n- 项目请求记录/)
  assert.doesNotMatch(result.markdown, /历史变更/)
})
test('missing duplicate unfinished or incorrectly dated release entries block packaging', () => {
  for (const changelog of [
    '## [2.0.4] - 2026-10-20\n- 旧版本',
    '## [2.1.0] - 2026-10-20\n- TODO\n',
    '## [2.1.0] - 2026-10-20\n',
    '## [2.1.0] - 2026-10-20\n- 新增记录\n## [2.1.0] - 2026-10-20\n- 重复记录\n',
    '## [2.1.0] - 2026-02-30\n- 新增记录\n',
    '## [2.2.0] - 2026-10-20\n- 更新记录\n## [2.1.0] - 2026-10-19\n- 上次记录\n',
  ]) assert.throws(() => extractRelease(changelog, '2.1.0'))
})
test('old installers and unrelated executables are excluded from the current release', () => {
  assert.equal(isCurrentInstaller('Caddy Proxy Tools_2.1.0_x64-setup.exe', '2.1.0'), true)
  assert.equal(isCurrentInstaller('Caddy Proxy Tools_2.1.0_x64_en-US.msi', '2.1.0'), true)
  assert.equal(isCurrentInstaller('Caddy Proxy Tools_2.0.4_x64-setup.exe', '2.1.0'), false)
  assert.equal(isCurrentInstaller('Caddy Proxy Tools_2.1.0_x64-setup.exe.sig', '2.1.0'), false)
  assert.equal(isCurrentInstaller('caddy.exe', '2.1.0'), false)
})
