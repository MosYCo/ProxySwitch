import test from 'node:test'
import assert from 'node:assert/strict'
import { nextVersion, planVersion } from '../scripts/prepare-version.mjs'

const files = () => ({
  'package.json': '{\n  "version": "0.2.1",\n  "dependencies": {"example": "0.2.1"}\n}\n',
  'src-tauri/tauri.conf.json': '{\n  "version": "0.2.1",\n  "productName": "Moss ProxySwitch"\n}\n',
  'src-tauri/Cargo.toml': '[package]\nname = "caddy-proxy-tools"\nversion = "0.2.1"\n\n[dependencies]\nother = "0.2.1"\n',
  'src-tauri/Cargo.lock': '[[package]]\nname = "other"\nversion = "0.2.1"\n\n[[package]]\nname = "caddy-proxy-tools"\nversion = "0.2.1"\n',
  'CHANGELOG.md': '# 更新日志\n\n## [未发布]\n\n### 修复\n\n- 修复代理环境切换。\n\n## [0.2.1] - 2026-10-22\n\n- 保留旧版本说明。\n',
})

test('version preparation advances semver and rejects rollback, duplicates and malformed versions', () => {
  assert.equal(nextVersion('0.2.1'), '0.2.2')
  assert.equal(nextVersion('0.2.1', 'minor'), '0.3.0')
  assert.equal(nextVersion('0.2.1', 'major'), '1.0.0')
  assert.equal(nextVersion('0.2.1', '0.2.5'), '0.2.5')
  for (const version of ['0.2.1', '0.1.9', 'v0.2.2', '0.02.2', '0.2.2-beta.1', '0.2.9007199254740992']) assert.throws(() => nextVersion('0.2.1', version))
})

test('version preparation changes only application versions and preserves previous release notes', () => {
  const source = files(), original = structuredClone(source)
  const plan = planVersion(source, 'patch', '2026-10-23')
  assert.equal(plan.version, '0.2.2')
  assert.equal(plan.branch, 'codex/prepare-0.2.2')
  assert.equal(JSON.parse(plan.files['package.json']).dependencies.example, '0.2.1')
  assert.match(plan.files['src-tauri/Cargo.lock'], /name = "other"\nversion = "0.2.1"/)
  assert.match(plan.files['src-tauri/Cargo.toml'], /other = "0.2.1"/)
  assert.match(plan.files['CHANGELOG.md'], /## \[0.2.2\] - 2026-10-23/)
  assert.match(plan.files['CHANGELOG.md'], /## \[0.2.1\] - 2026-10-22\n\n- 保留旧版本说明。/)
  assert.doesNotMatch(plan.notes, /保留旧版本说明/)
  assert.deepEqual(source, original, 'Planning does not mutate or write the sources')
  const crlf = planVersion(Object.fromEntries(Object.entries(files()).map(([name, content]) => [name, content.replaceAll('\n', '\r\n')])), 'patch', '2026-10-23')
  assert.equal(JSON.parse(crlf.files['src-tauri/tauri.conf.json']).version, '0.2.2')
})

test('version preparation refuses inconsistent sources, invalid dates and unfinished or missing release notes', () => {
  const cases = [
    source => { source['src-tauri/Cargo.lock'] = source['src-tauri/Cargo.lock'].replace(/version = "0.2.1"/g, 'version = "0.2.0"') },
    source => { source['CHANGELOG.md'] = source['CHANGELOG.md'].replace('修复代理环境切换。', 'TODO') },
    source => { source['CHANGELOG.md'] = source['CHANGELOG.md'].replace('## [未发布]', '## [0.2.2] - 2026-10-23') },
    source => { source['CHANGELOG.md'] += '\n## [未发布]\n- 重复记录\n' },
    source => { source['CHANGELOG.md'] += '\n## [0.2.2] - 2026-10-23\n- 重复版本\n' },
  ]
  for (const mutate of cases) { const source = files(); mutate(source); assert.throws(() => planVersion(source, 'patch', '2026-10-23')) }
  assert.throws(() => planVersion(files(), 'patch', '2026-02-30'))
})
