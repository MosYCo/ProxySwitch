import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { prepareRelease, projectRoot } from './release-notes.mjs'
import { writeLicenseArchive } from './license-archive.mjs'

export function isCurrentInstaller(name, version) {
  return name.includes(`_${version}_`) && /\.(exe|msi|deb|rpm|AppImage|dmg|app\.tar\.gz)$/i.test(name)
}

async function collectInstallers(directory, version, startedAt) {
  const artifacts = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) artifacts.push(...await collectInstallers(path, version, startedAt))
    else if (isCurrentInstaller(entry.name, version) && (await stat(path)).mtimeMs >= startedAt - 2000) artifacts.push(path)
  }
  return artifacts
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => ['--no-bundle', '--config', '-c', '--target-dir'].includes(arg) || arg.startsWith('--config=') || arg.startsWith('--target-dir='))) throw new Error('发布流程不接受跳过打包、覆盖配置或自定义 --target-dir；构建目录请使用 CARGO_TARGET_DIR')
  const release = await prepareRelease()
  const directory = join(projectRoot, 'artifacts', release.version)
  try {
    if ((await readdir(directory)).length) throw new Error(`版本 ${release.version} 已有发布产物，请升级版本后再打包；不会覆盖旧安装包`)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const require = createRequire(import.meta.url)
  const cli = require.resolve('@tauri-apps/cli/tauri.js')
  const startedAt = Date.now()
  await new Promise((accept, reject) => {
    const cargoArgs = args.includes('--') ? args : [...args, '--', '--locked']
    const child = spawn(process.execPath, [cli, 'build', ...cargoArgs], { cwd: projectRoot, stdio: 'inherit', env: { ...process.env, pnpm_config_pm_on_fail: 'ignore' } })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`打包失败（${signal || code}），未整理发布产物`)))
  })
  const targetArgument = args.find((arg) => arg.startsWith('--target='))?.slice(9) ?? (args.includes('--target') ? args[args.indexOf('--target') + 1] : undefined)
  const targetRoot = process.env.CARGO_TARGET_DIR ? resolve(projectRoot, 'src-tauri', process.env.CARGO_TARGET_DIR) : join(projectRoot, 'src-tauri/target')
  const profile = args.includes('--debug') ? 'debug' : 'release'
  const bundleDirectory = join(targetRoot, ...(targetArgument ? [targetArgument] : []), profile, 'bundle')
  const installers = await collectInstallers(bundleDirectory, release.version, startedAt)
  if (!installers.length) throw new Error('没有找到本次生成的安装包，旧版本产物不会作为本次发布结果')
  await mkdir(directory, { recursive: true })
  const files = []
  for (const installer of installers) {
    const name = basename(installer)
    await copyFile(installer, join(directory, name))
    files.push(name)
  }
  const notesName = `RELEASE_NOTES_${release.version}.md`
  await writeFile(join(directory, notesName), release.markdown)
  await copyFile(join(projectRoot, 'CHANGELOG.md'), join(directory, 'CHANGELOG.md'))
  files.push(notesName, 'CHANGELOG.md')
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    await copyFile(join(projectRoot, name), join(directory, name)); files.push(name)
  }
  await writeLicenseArchive(projectRoot, join(directory, 'THIRD_PARTY_LICENSES.zip'))
  files.push('THIRD_PARTY_LICENSES.zip')
  const checksums = await Promise.all(files.sort().map(async (name) => `${createHash('sha256').update(await readFile(join(directory, name))).digest('hex')}  ${name}`))
  await writeFile(join(directory, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`)
  console.log(`\n发布目录：${directory}\n${[...files, 'SHA256SUMS.txt'].join('\n')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
