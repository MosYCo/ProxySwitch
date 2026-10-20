import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { inspectPublicFile } from '../scripts/check-public-content.mjs'
test('public-content findings identify locations without exposing a matched secret', () => {
  const secret = 'ghp_' + 'a'.repeat(36)
  const findings = inspectPublicFile('src/example.ts', Buffer.from('first line\n' + secret), '')
  assert.deepEqual(findings, [{ rule: 'github-token', line: 2 }])
  assert(!JSON.stringify(findings).includes(secret))
})
test('only the exact documented TLS fixture is allowed to contain a private identity', () => {
  const bytes = Buffer.from([0, 1, 2, 3]); const digest = createHash('sha256').update(bytes).digest('hex')
  assert.deepEqual(inspectPublicFile('tests/fixtures/health-test.p12', bytes, digest), [])
  assert.equal(inspectPublicFile('tests/fixtures/health-test.p12', Buffer.from([0, 9]), digest)[0].rule, 'changed-test-identity')
  assert.equal(inspectPublicFile('tests/another.p12', bytes, digest)[0].rule, 'private-file')
  assert.equal(inspectPublicFile('.env.production', Buffer.from('setting=value'), digest)[0].rule, 'private-file')
})
