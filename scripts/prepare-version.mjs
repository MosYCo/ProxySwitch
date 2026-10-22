import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { projectRoot, validateVersions, extractRelease } from './release-notes.mjs'

export const versionFiles = ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'CHANGELOG.md']

function parts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('版本必须为 major.minor.patch，不接受预发布或前导零')
  const result = version.split('.').map(Number)
  if (result.some(value => !Number.isSafeInteger(value))) throw new Error('版本号超出范围')
  return result
}

export function nextVersion(current, requested = 'patch') {
  const previous = parts(current), next = [...previous]
  const index = ['major', 'minor', 'patch'].indexOf(requested)
  if (index >= 0) { next[index]++; next.fill(0, index + 1) }
  else next.splice(0, 3, ...parts(requested))
  const firstDifference = next.findIndex((value, i) => value !== previous[i])
  if (firstDifference < 0 || next[firstDifference] < previous[firstDifference]) throw new Error('新版本必须高于当前版本')
  const version = next.join('.')
  parts(version)
  return version
}

export function planVersion(files, requested = 'patch', date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })) {
  const packageJson = JSON.parse(files['package.json']), tauriJson = JSON.parse(files['src-tauri/tauri.conf.json'])
  const current = validateVersions(packageJson, tauriJson, files['src-tauri/Cargo.toml'], files['src-tauri/Cargo.lock'])
  const version = nextVersion(current, requested)
  const changelog = files['CHANGELOG.md']
  const headings = [...changelog.matchAll(/^## \[([^\]]+)\][^\r\n]*$/gm)]
  if (headings[0]?.[1] !== '未发布' || headings.filter(item => item[1] === '未发布').length !== 1) throw new Error('请先在 CHANGELOG.md 顶部整理唯一的「## [未发布]」中文变更记录')
  if (headings.some(item => item[1] === version)) throw new Error('新版本已经存在于更新日志')
  const updated = { ...files }
  updated['CHANGELOG.md'] = changelog.replace(/^## \[未发布\][ \t]*\r?$/m, `## [${version}] - ${date}`)
  const release = extractRelease(updated['CHANGELOG.md'], version, tauriJson.productName)
  if (!/[\u3400-\u9fff]/.test(release.markdown.split('\n').slice(4).join('\n'))) throw new Error('请用中文描述实际完成的变更')
  for (const file of ['package.json', 'src-tauri/tauri.conf.json']) {
    updated[file] = files[file].replace(/^(  "version":\s*")[^"]+("[,\s]*\r?)$/m, `$1${version}$2`)
  }
  updated['src-tauri/Cargo.toml'] = files['src-tauri/Cargo.toml'].replace(/(^\[package\][\s\S]*?^version\s*=\s*")[^"]+/m, `$1${version}`)
  updated['src-tauri/Cargo.lock'] = files['src-tauri/Cargo.lock'].replace(/(\[\[package\]\]\s*\r?\nname = "caddy-proxy-tools"\s*\r?\nversion = ")[^"]+/, `$1${version}`)
  validateVersions(JSON.parse(updated['package.json']), JSON.parse(updated['src-tauri/tauri.conf.json']), updated['src-tauri/Cargo.toml'], updated['src-tauri/Cargo.lock'])
  if (JSON.parse(updated['package.json']).version !== version) throw new Error('无法更新版本字段，请检查文件格式')
  return { current, version, branch: `codex/prepare-${version}`, files: updated, notes: release.markdown }
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { write: { type: 'boolean', default: false }, date: { type: 'string' } } })
  if (positionals.length > 1) throw new Error('用法：pnpm release:prepare [patch|minor|major|版本号] [--write] [--date YYYY-MM-DD]')
  const files = Object.fromEntries(await Promise.all(versionFiles.map(async file => [file, await readFile(join(projectRoot, file), 'utf8')])))
  const plan = planVersion(files, positionals[0], values.date)
  if (values.write) {
    const git = args => execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', windowsHide: true }).trim()
    if (git(['branch', '--show-current']) !== plan.branch || git(['status', '--porcelain'])) throw new Error(`写入前请从最新 develop 创建 ${plan.branch}，并保持工作区干净`)
    // Validate every replacement before writing; restore earlier files if an I/O operation fails.
    const written = []
    try {
      for (const file of versionFiles) { written.push(file); await writeFile(join(projectRoot, file), plan.files[file]) }
    } catch (error) {
      for (const file of written) await writeFile(join(projectRoot, file), files[file])
      throw error
    }
  }
  console.log(JSON.stringify({ current: plan.current, version: plan.version, branch: plan.branch, written: values.write, files: versionFiles, notes: plan.notes }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
