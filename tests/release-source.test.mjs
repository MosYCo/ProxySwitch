import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { verifyReleaseSource } from '../scripts/verify-release-source.mjs'

function repository(t) {
  const temporary = realpathSync(tmpdir())
  const cwd = mkdtempSync(join(temporary, 'proxyswitch-release-source-'))
  assert.equal(dirname(cwd), temporary)
  assert.ok(basename(cwd).startsWith('proxyswitch-release-source-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim()
  git('init', '--initial-branch=master')
  git('config', 'user.name', 'Release Policy Test')
  git('config', 'user.email', 'release-test@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'tag.gpgsign', 'false')
  git('config', 'core.hooksPath', join(cwd, '.git', 'no-hooks'))
  git('commit', '--allow-empty', '-m', 'stable baseline')
  return { cwd, git, check: revision => verifyReleaseSource({ cwd, revision, stableRef: 'refs/heads/master' }) }
}

test('release source rejects development commits until their history is merged into master', t => {
  const { git, check } = repository(t)
  const baseline = git('rev-parse', 'HEAD')
  git('switch', '-c', 'develop')
  git('commit', '--allow-empty', '-m', 'unreleased work')
  const development = git('rev-parse', 'HEAD')
  assert.equal(check(baseline), baseline)
  assert.throws(() => check(development), /already merged into master/)
  git('switch', 'master')
  git('merge', '--no-ff', '--no-edit', 'develop')
  assert.equal(check(development), development)
  assert.equal(check('HEAD'), git('rev-parse', 'HEAD'))
})

test('release source peels annotated tags and rejects missing or unmerged tag targets', t => {
  const { cwd, git, check } = repository(t)
  const stable = git('rev-parse', 'HEAD')
  git('tag', '-a', 'v0.1.0', '-m', 'stable release')
  assert.equal(check('v0.1.0'), stable)
  git('switch', '-c', 'develop')
  git('commit', '--allow-empty', '-m', 'unreleased work')
  git('tag', 'v0.2.0')
  assert.throws(() => check('v0.2.0'), /already merged into master/)
  assert.throws(() => check('missing-tag'), /Cannot resolve release source/)
  assert.throws(() => verifyReleaseSource({ cwd, stableRef: 'refs/heads/missing' }), /Cannot resolve release source/)
})
