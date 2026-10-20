import test from 'node:test'
import assert from 'node:assert/strict'
import { extractRelease, validateVersions, validateReleaseTag } from '../scripts/release-notes.mjs'
import { isCurrentInstaller } from '../scripts/package-release.mjs'

const packageJson = { version: '2.1.0' }
const cargo = '[package]\nname = "caddy-proxy-tools"\nversion = "2.1.0"\n\n[dependencies]\n'
const lock = '[[package]]\nname = "caddy-proxy-tools"\nversion = "2.1.0"\n'

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
