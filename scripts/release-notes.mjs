import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function extractRelease(changelog, version) {
  const headings = [...changelog.matchAll(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\s*$/gm)]
  const matches = headings.filter((heading) => heading[1] === version)
  if (matches.length !== 1) throw new Error(`请在 CHANGELOG.md 中为 ${version} 添加唯一的「## [${version}] - YYYY-MM-DD」更新日志`)
  const heading = matches[0]
  if (headings[0] !== heading) throw new Error('当前版本的更新日志必须位于 CHANGELOG.md 最前面')
  const next = headings.find((item) => item.index > heading.index)
  const body = changelog.slice(heading.index + heading[0].length, next?.index ?? changelog.length).trim()
  if (!/^[-*] \S.+$/m.test(body) || /待补充|TODO|TBD/i.test(body)) throw new Error(`${version} 的更新日志尚未完成，请描述本次实际变更`)
  const date = heading[2]
  if (Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('更新日志日期无效')
  return { version, date, markdown: `# Caddy Proxy Tools ${version}\n\n发布日期：${date}\n\n${body}\n` }
}

export function validateVersions(packageJson, tauriJson, cargoToml, cargoLock) {
  const version = packageJson.version
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('发布版本须为 major.minor.patch 格式')
  const cargoVersion = cargoToml.match(/^\[package\]\s*\n(?:(?!\[)[\s\S])*?^version\s*=\s*"([^"]+)"/m)?.[1]
  const lockVersion = cargoLock.match(/\[\[package\]\]\s*\r?\nname = "caddy-proxy-tools"\s*\r?\nversion = "([^"]+)"/)?.[1]
  if (tauriJson.version !== version || cargoVersion !== version || lockVersion !== version) throw new Error('package.json、tauri.conf.json、Cargo.toml、Cargo.lock 的应用版本必须一致')
  return version
}

export function validateReleaseTag(tag, version) {
  if (tag !== `v${version}`) throw new Error(`发布标签 ${tag} 与应用版本 ${version} 不一致，应使用 v${version}`)
}

export async function prepareRelease(root = projectRoot, tag) {
  const [packageJson, tauriJson, cargoToml, cargoLock, changelog] = await Promise.all([
    readFile(join(root, 'package.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'src-tauri/Cargo.toml'), 'utf8'),
    readFile(join(root, 'src-tauri/Cargo.lock'), 'utf8'),
    readFile(join(root, 'CHANGELOG.md'), 'utf8'),
  ])
  const version = validateVersions(packageJson, tauriJson, cargoToml, cargoLock)
  if (tag) validateReleaseTag(tag, version)
  const release = extractRelease(changelog, version)
  const directory = join(root, 'docs/releases')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, `${version}.md`), release.markdown)
  await writeFile(join(directory, 'RELEASE_NOTES.md'), release.markdown)
  return release
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const tagIndex = process.argv.indexOf('--tag')
    if (tagIndex >= 0 && !process.argv[tagIndex + 1]) throw new Error('--tag 需要指定版本标签')
    const release = await prepareRelease(projectRoot, tagIndex >= 0 ? process.argv[tagIndex + 1] : undefined)
    console.log(`已校验版本与更新日志：v${release.version}（${release.date}）`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
