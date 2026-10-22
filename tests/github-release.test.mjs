import test from 'node:test'
import assert from 'node:assert/strict'
import { githubRepository, mergeMethod, assertChecks, assertMergeReady } from '../scripts/github-release.mjs'
import { buildTargets } from '../scripts/ci-metadata.mjs'

const head = 'a'.repeat(40), base = 'b'.repeat(40), repository = 'example/ProxySwitch'
function ready() {
  return {
    pr: { state: 'open', draft: false, head: { ref: 'develop', sha: head, repo: { full_name: repository } }, base: { ref: 'master', sha: base }, mergeable: true, mergeable_state: 'clean' },
    run: { status: 'completed', conclusion: 'success' },
    jobs: ['plan', 'UI components and interactions', 'Checks passed', ...buildTargets.map(target => `Check (${target.id})`)].map(name => ({ name, status: 'completed', conclusion: 'success' })),
    statuses: { statuses: [], state: 'pending' }, reviews: [],
    threads: { pageInfo: { hasNextPage: false }, nodes: [] }, target: { commit: { sha: base } },
  }
}
const check = snapshot => assertMergeReady(snapshot, { head, base, repository })

test('release tooling uses GitHub remotes without embedded credentials and preserves branch merge policies', () => {
  assert.equal(githubRepository('https://github.com/example/ProxySwitch.git'), repository)
  assert.equal(githubRepository('git@github.com:example/ProxySwitch.git'), repository)
  for (const remote of ['https://gitlab.example.com/example/ProxySwitch.git', 'https://user:secret@github.com/example/ProxySwitch.git', 'https://github.com/example/ProxySwitch/tree/master']) assert.throws(() => githubRepository(remote))
  assert.equal(mergeMethod(ready().pr), 'merge')
  assert.equal(mergeMethod({ head: { ref: 'codex/prepare-0.2.2' }, base: { ref: 'develop' } }), 'squash')
  assert.throws(() => mergeMethod({ head: { ref: 'codex/something' }, base: { ref: 'master' } }))
})

test('protected release merge refuses stale reviews, changed branches, incomplete CI and unresolved discussions', () => {
  assert.doesNotThrow(() => check(ready()))
  const mutations = [
    data => { data.pr.head.sha = 'c'.repeat(40) },
    data => { data.pr.base.sha = 'c'.repeat(40) },
    data => { data.target.commit.sha = 'c'.repeat(40) },
    data => { data.pr.head.repo.full_name = 'stranger/ProxySwitch' },
    data => { data.pr.draft = true },
    data => { data.pr.state = 'closed' },
    data => { data.pr.mergeable_state = 'behind' },
    data => { data.run.conclusion = 'failure' },
    data => { data.jobs.pop() },
    data => { data.jobs[0].conclusion = 'skipped' },
    data => { data.statuses = { statuses: [{}], state: 'failure' } },
    data => { data.threads.nodes.push({ isResolved: false }) },
    data => { data.threads.pageInfo.hasNextPage = true },
    data => { data.reviews.push({ user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' }) },
  ]
  for (const mutate of mutations) { const data = ready(); mutate(data); assert.throws(() => check(data)) }
  const resolved = ready()
  resolved.reviews = [{ user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' }, { user: { login: 'reviewer' }, state: 'APPROVED' }]
  assert.doesNotThrow(() => check(resolved))
  assert.throws(() => assertChecks(undefined, []))
})
