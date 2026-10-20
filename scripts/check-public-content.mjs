import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = 'tests/fixtures/health-test.p12'
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['gitlab-token', /\bglpat-[A-Za-z0-9_-]{20,}\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['openai-token', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{24,}\b/g],
  ['personal-path', /[A-Z]:[\\/]+Users[\\/]+[A-Za-z0-9._-]+[\\/]/g],
]

export function inspectPublicFile(path, bytes, fixtureHash) {
  const findings = []
  if (path === fixture) {
    if (createHash('sha256').update(bytes).digest('hex') !== fixtureHash) findings.push({ rule: 'changed-test-identity', line: 1 })
    return findings
  }
  if (/(?:^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example') || /\.(?:pem|key|pfx|p12|keystore|jks)$/i.test(path) || /(?:^|\/)config\.json$/.test(path)) findings.push({ rule: 'private-file', line: 1 })
  if (bytes.includes(0) || /\.(?:png|ico|icns)$/i.test(path)) return findings
  const text = bytes.toString('utf8')
  for (const [rule, regex] of rules) {
    regex.lastIndex = 0
    for (const match of text.matchAll(regex)) findings.push({ rule, line: text.slice(0, match.index).split('\n').length })
  }
  return findings
}

function git(args) { return execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 }) }
function main() {
  const fixtureHash = readFileSync(resolve(root, 'tests/fixtures/health-test.p12.sha256'), 'utf8').trim()
  const results = []
  const paths = [...new Set(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean))]
  for (const path of paths) {
    if (!existsSync(resolve(root, path))) continue
    for (const finding of inspectPublicFile(path, readFileSync(resolve(root, path)), fixtureHash)) results.push({ path, ...finding })
  }
  let historyCount = 0
  if (process.argv.includes('--history')) {
    for (const entry of git(['rev-list', '--objects', '--all']).toString().trim().split('\n')) {
      const separator = entry.indexOf(' ')
      if (separator < 0) continue
      const oid = entry.slice(0, separator)
      const path = entry.slice(separator + 1)
      if (git(['cat-file', '-t', oid]).toString().trim() !== 'blob') continue
      historyCount++
      for (const finding of inspectPublicFile(path, git(['cat-file', 'blob', oid]), fixtureHash)) results.push({ path, object: oid.slice(0, 12), ...finding })
    }
  }
  if (results.length) {
    // Never print the matched credential or private file contents.
    for (const result of results) console.error(`${result.path}:${result.line} ${result.rule}${result.object ? ` (Git object ${result.object})` : ''}`)
    process.exitCode = 1
  } else console.log(`Public-content checks passed: ${paths.length} current paths, ${historyCount} historical blobs. This is a pattern scan, not a guarantee that all sensitive data is absent.`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
