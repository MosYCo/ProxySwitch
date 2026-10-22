import { execFileSync, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { projectRoot, validateVersions, extractRelease } from './release-notes.mjs'
import { buildTargets } from './ci-metadata.mjs'

const git = args => execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const requireSha = value => { if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error('需要完整的已审查提交 SHA'); return value }
const requireVersion = value => { if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value ?? '')) throw new Error('需要不带 v 的正式版本号'); return value }
const requireNumber = value => { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw new Error('需要有效的 PR 编号'); return number }

export function mergeMethod(pr) {
  if (pr.head.ref === 'develop' && pr.base.ref === 'master') return 'merge'
  if (pr.head.ref.startsWith('codex/') && pr.base.ref === 'develop') return 'squash'
  throw new Error('仅支持 codex/* → develop 和 develop → master，不自动合并其他分支组合')
}

export function assertChecks(run, jobs) {
  const expected = ['plan', 'UI components and interactions', 'Checks passed', ...buildTargets.map(target => `Check (${target.id})`)]
  if (run?.status !== 'completed' || run.conclusion !== 'success' || expected.some(name => !jobs.some(job => job.name === name && job.status === 'completed' && job.conclusion === 'success'))) throw new Error('完整 CI 尚未成功，不能合并或创建发布标签')
}

export function assertMergeReady(snapshot, { head, base, repository }) {
  requireSha(head); requireSha(base)
  const { pr, run, jobs, statuses, reviews, threads, target } = snapshot
  mergeMethod(pr)
  if (pr.state !== 'open' || pr.draft || pr.head.repo?.full_name !== repository || pr.head.sha !== head || pr.base.sha !== base || target.commit.sha !== base) throw new Error('PR 或目标分支已变化，请重新审查')
  if (pr.mergeable !== true || pr.mergeable_state !== 'clean') throw new Error(`PR 尚不满足分支保护：${pr.mergeable_state}`)
  assertChecks(run, jobs)
  if (statuses.statuses.length && statuses.state !== 'success') throw new Error('存在未通过的提交状态')
  const latest = new Map()
  for (const review of reviews) if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) latest.set(review.user.login, review.state)
  if ([...latest.values()].includes('CHANGES_REQUESTED') || reviews.some(review => review.state === 'PENDING')) throw new Error('存在需要处理的审查意见')
  if (!threads || threads.pageInfo.hasNextPage || threads.nodes.some(thread => !thread.isResolved)) throw new Error('存在未解决的审查讨论')
}

export function githubRepository(remoteUrl) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remoteUrl)
  if (!match) throw new Error('发布远程必须是 github.com 仓库，不接受带凭据的 URL')
  return match[1]
}

function credential(repository) {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const result = spawnSync('git', ['credential', 'fill'], {
    cwd: projectRoot, input: `protocol=https\nhost=github.com\nusername=${repository.split('/')[0]}\n\n`, encoding: 'utf8', windowsHide: true, timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  })
  const token = result.stdout?.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9)
  if (result.status !== 0 || !token) throw new Error('无法读取现有 GitHub 凭据；请配置 Git Credential Manager 或 GH_TOKEN，不要将令牌写入文件')
  return token
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: Object.fromEntries(['remote', 'head', 'base', 'title', 'body-file', 'pr', 'head-sha', 'base-sha', 'sha', 'version'].map(name => [name, { type: 'string' }])) })
  const [command] = positionals
  if (positionals.length !== 1 || !['open-pr', 'inspect-pr', 'merge-pr', 'branch-ci', 'tag', 'status'].includes(command)) throw new Error('命令：open-pr / inspect-pr / merge-pr / branch-ci / tag / status，详见 docs/DEVELOPMENT.md')
  const repository = githubRepository(git(['remote', 'get-url', values.remote ?? 'github']))
  const token = credential(repository), root = `/repos/${repository}`
  const api = async (path, method = 'GET', body, optional = false) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ProxySwitch-release', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    })
    if (optional && response.status === 404) return null
    const result = await response.json()
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`)
    return result
  }
  const runsAt = async (workflow, sha, event) => (await api(`${root}/actions/workflows/${workflow}/runs?head_sha=${sha}&event=${event}&per_page=100`)).workflow_runs
  const jobsAt = async run => run ? (await api(`${root}/actions/runs/${run.id}/jobs?per_page=100`)).jobs : []
  const inspect = async number => {
    const pr = await api(`${root}/pulls/${number}`)
    const results = await Promise.allSettled([
      runsAt('ci.yml', pr.head.sha, 'pull_request'), api(`${root}/commits/${pr.head.sha}/status?per_page=100`),
      api(`${root}/pulls/${number}/reviews?per_page=100`), api(`${root}/branches/${pr.base.ref}`),
      api('/graphql', 'POST', { query: 'query($owner:String!,$name:String!,$number:Int!) { repository(owner:$owner,name:$name) { pullRequest(number:$number) { reviewThreads(first:100) { pageInfo { hasNextPage } nodes { isResolved } } } } }', variables: { owner: repository.split('/')[0], name: repository.split('/')[1], number } }),
    ])
    for (const result of results) if (result.status === 'rejected') throw result.reason
    const [runs, statuses, reviews, target, graph] = results.map(result => result.value)
    if (graph.errors || reviews.length >= 100 || statuses.total_count > 100) throw new Error('无法完整读取审查记录或状态，需要人工核查')
    // GitHub can omit pull_requests for completed runs. The allowed branch pairs
    // are unique; match the exact head SHA and same-repository branch as fallback.
    const matchesHead = item => item.head_sha === pr.head.sha && item.head_branch === pr.head.ref && item.repository.full_name === repository
    const run = runs.find(item => matchesHead(item) && item.pull_requests.some(pull => pull.number === number))
      ?? runs.find(item => matchesHead(item) && item.pull_requests.length === 0)
    return { pr, run, jobs: await jobsAt(run), statuses, reviews, target, threads: graph.data?.repository?.pullRequest?.reviewThreads }
  }
  const summary = snapshot => ({ number: snapshot.pr.number, url: snapshot.pr.html_url, state: snapshot.pr.state, merged: snapshot.pr.merged, head: snapshot.pr.head.sha, base: snapshot.pr.base.sha, mergeable: snapshot.pr.mergeable_state, run: snapshot.run && { id: snapshot.run.id, status: snapshot.run.status, conclusion: snapshot.run.conclusion, url: snapshot.run.html_url }, jobs: snapshot.jobs.map(job => ({ name: job.name, status: job.status, conclusion: job.conclusion, active: job.steps?.filter(step => step.status === 'in_progress' || step.conclusion === 'failure').map(step => step.name) })) })
  let output
  if (command === 'open-pr') {
    const head = values.head, base = values.base
    mergeMethod({ head: { ref: head ?? '' }, base: { ref: base } })
    if (!values.title || !values['body-file']) throw new Error('需要 --title 和 --body-file')
    if (git(['branch', '--show-current']) !== head || git(['status', '--porcelain'])) throw new Error('请检出干净的 PR 来源分支')
    if ((await api(`${root}/branches/${encodeURIComponent(head)}`)).commit.sha !== git(['rev-parse', 'HEAD'])) throw new Error('请先推送并核对本地与远程提交')
    const existing = await api(`${root}/pulls?state=open&head=${encodeURIComponent(`${repository.split('/')[0]}:${head}`)}&base=${base}`)
    const pr = existing[0] ?? await api(`${root}/pulls`, 'POST', { head, base, title: values.title, body: await readFile(resolve(values['body-file']), 'utf8') })
    output = { number: pr.number, url: pr.html_url, head: pr.head.sha, base: pr.base.sha }
  } else if (command === 'inspect-pr') {
    output = summary(await inspect(requireNumber(values.pr)))
  } else if (command === 'merge-pr') {
    const number = requireNumber(values.pr), head = requireSha(values['head-sha']), base = requireSha(values['base-sha'])
    const snapshot = await inspect(number)
    assertMergeReady(snapshot, { head, base, repository })
    // Re-read immediately before mutation; server-side protection remains authoritative.
    assertMergeReady({ ...snapshot, pr: await api(`${root}/pulls/${number}`), target: await api(`${root}/branches/${snapshot.pr.base.ref}`) }, { head, base, repository })
    const method = mergeMethod(snapshot.pr)
    const result = await api(`${root}/pulls/${number}/merge`, 'PUT', { sha: head, merge_method: method, commit_title: `${snapshot.pr.title} (#${number})` })
    if (!result.merged) throw new Error('PR 未合并')
    const confirmation = await api(`${root}/pulls/${number}`)
    if (!confirmation.merged || confirmation.merge_commit_sha !== result.sha) throw new Error('无法确认合并结果')
    if (method === 'merge') {
      const commit = await api(`${root}/git/commits/${result.sha}`)
      if (commit.parents.length !== 2 || commit.parents[0].sha !== base || commit.parents[1].sha !== head) throw new Error('发布合并未保留预期父提交')
    }
    output = { number, url: confirmation.html_url, merged: true, sha: result.sha, method }
  } else if (command === 'branch-ci') {
    if (!['develop', 'master'].includes(values.base)) throw new Error('需要 --base develop 或 master')
    const sha = (await api(`${root}/branches/${values.base}`)).commit.sha
    if (values.sha && requireSha(values.sha) !== sha) throw new Error('分支已变化，请重新核对范围')
    const run = (await runsAt('ci.yml', sha, 'push')).find(item => item.head_branch === values.base)
    output = { branch: values.base, sha, run: run && { id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url }, jobs: (await jobsAt(run)).map(job => ({ id: job.id, name: job.name, status: job.status, conclusion: job.conclusion })) }
  } else if (command === 'tag') {
    if (process.env.GITHUB_ACTIONS === 'true') throw new Error('请从本地使用用户授权创建标签；GITHUB_TOKEN 创建的标签不会触发另一个工作流')
    const version = requireVersion(values.version), sha = requireSha(values.sha), number = requireNumber(values.pr), tag = `v${version}`
    const pr = await api(`${root}/pulls/${number}`)
    if (!pr.merged || pr.head.repo?.full_name !== repository || pr.head.ref !== 'develop' || pr.base.ref !== 'master' || pr.merge_commit_sha !== sha) throw new Error('标签必须对应已合并的 develop → master 发布 PR')
    if ((await api(`${root}/branches/master`)).commit.sha !== sha) throw new Error('master 已变化，请重新核对发布范围')
    const files = await Promise.all(['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'CHANGELOG.md'].map(async file => {
      const content = await api(`${root}/contents/${file}?ref=${sha}`)
      if (content.encoding !== 'base64' || !content.content) throw new Error(`无法读取版本文件：${file}`)
      return Buffer.from(content.content, 'base64').toString('utf8')
    }))
    if (validateVersions(JSON.parse(files[0]), JSON.parse(files[1]), files[2], files[3]) !== version) throw new Error('版本号与已合并源码不一致')
    if (/^## \[未发布\]/m.test(files[4])) throw new Error('发布记录仍有「未发布」内容，请先完成版本准备')
    extractRelease(files[4], version, JSON.parse(files[1]).productName)
    const commit = await api(`${root}/git/commits/${sha}`)
    if (commit.parents.length !== 2 || commit.parents[1].sha !== pr.head.sha) throw new Error('发布 PR 必须使用 merge commit')
    const run = (await runsAt('ci.yml', sha, 'push')).find(item => item.head_branch === 'master')
    assertChecks(run, await jobsAt(run))
    const existing = await api(`${root}/git/ref/tags/${tag}`, 'GET', undefined, true)
    if (existing) {
      let object = existing.object
      for (let depth = 0; object.type === 'tag' && depth < 5; depth++) object = (await api(`${root}/git/tags/${object.sha}`)).object
      if (object.type !== 'commit' || object.sha !== sha) throw new Error('已有标签指向其他提交，禁止移动或覆盖')
      output = { tag, sha, created: false, message: '标签已存在，使用 status 查看结果，不重复触发' }
    } else {
      if ((await api(`${root}/branches/master`)).commit.sha !== sha) throw new Error('master 已变化')
      const object = await api(`${root}/git/tags`, 'POST', { tag, message: `Moss ProxySwitch ${version}`, object: sha, type: 'commit' })
      await api(`${root}/git/refs`, 'POST', { ref: `refs/tags/${tag}`, sha: object.sha })
      output = { tag, sha, created: true, message: '已创建标签，Release CI 将自动生成多平台安装包' }
    }
  } else {
    const version = requireVersion(values.version), tag = `v${version}`
    const ref = await api(`${root}/git/ref/tags/${tag}`, 'GET', undefined, true)
    let object = ref?.object
    for (let depth = 0; object?.type === 'tag' && depth < 5; depth++) object = (await api(`${root}/git/tags/${object.sha}`)).object
    const run = object?.type === 'commit' ? (await runsAt('release.yml', object.sha, 'push')).find(item => item.head_branch === tag) : undefined
    const release = await api(`${root}/releases/tags/${tag}`, 'GET', undefined, true)
    output = { tag, sha: object?.sha, run: run && { id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url }, jobs: (await jobsAt(run)).map(job => ({ id: job.id, name: job.name, status: job.status, conclusion: job.conclusion })), release: release && { url: release.html_url, draft: release.draft, prerelease: release.prerelease, assets: release.assets.map(asset => ({ name: asset.name, size: asset.size, state: asset.state, digest: asset.digest, url: asset.browser_download_url })) } }
  }
  console.log(JSON.stringify(output, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
