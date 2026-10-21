import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { prepareRelease, projectRoot } from './release-notes.mjs'
import { writeLicenseArchive } from './license-archive.mjs'
import { getBuildTarget, rustHost } from './ci-metadata.mjs'
import { assertEmptyDirectory, collectInstallers, validateInstallerKinds, writeChecksums } from './release-artifacts.mjs'
import { collectMacUpdate, createUpdatePlatforms, macUpdateName, updateManifest } from './updater-artifacts.mjs'

export { isCurrentInstaller } from './release-artifacts.mjs'

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => ['--no-bundle', '--config', '-c', '--target-dir'].includes(arg) || arg.startsWith('--config=') || arg.startsWith('--target-dir='))) throw new Error('发布流程不接受跳过打包、覆盖配置或自定义 --target-dir；构建目录请使用 CARGO_TARGET_DIR')
  const separator = args.indexOf('--')
  const cliArgs = separator < 0 ? [...args] : args.slice(0, separator)
  const runnerArgs = separator < 0 ? [] : args.slice(separator + 1)
  const option = (name) => {
    const inline = cliArgs.find((arg) => arg.startsWith(`${name}=`))
    if (inline) return inline.slice(name.length + 1)
    const index = cliArgs.indexOf(name)
    if (index < 0) return undefined
    const value = cliArgs[index + 1]
    if (!value || value.startsWith('-')) throw new Error(`${name} 缺少参数`)
    return value
  }
  if (runnerArgs.some((arg) => ['--target', '--target-dir', '--manifest-path', '--package', '-p'].includes(arg) || /^(--target|--target-dir|--manifest-path|--package)=/.test(arg))) throw new Error('请通过 Tauri 的 --target 选择构建平台，不要在 Cargo 参数中覆盖目标或包')
  const explicitTarget = option('--target')
  const target = getBuildTarget(explicitTarget || process.env.CARGO_BUILD_TARGET || rustHost())
  const selectedBundles = option('--bundles')
  const bundles = !selectedBundles ? target.bundles : selectedBundles.split(',')
  if (bundles.some((kind) => !target.bundles.includes(kind))) throw new Error(`平台 ${target.id} 不支持指定的安装包格式`)
  if (!explicitTarget) cliArgs.push('--target', target.target)
  if (!selectedBundles) cliArgs.push('--bundles', bundles.join(','))
  if (!runnerArgs.includes('--locked')) runnerArgs.push('--locked')
  const release = await prepareRelease()
  const versionDirectory = join(projectRoot, 'artifacts', release.version)
  const directory = join(versionDirectory, target.id)
  try {
    if ((await readdir(versionDirectory, { withFileTypes: true })).some((entry) => !entry.isDirectory())) throw new Error(`版本 ${release.version} 已有旧格式发布产物，请升级版本后再打包；不会覆盖旧安装包`)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  await assertEmptyDirectory(directory)
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) throw new Error('缺少 TAURI_SIGNING_PRIVATE_KEY，不能生成可更新的发布版本。请参考 docs/UPDATING.md 配置签名密钥。')
  const require = createRequire(import.meta.url)
  const cli = require.resolve('@tauri-apps/cli/tauri.js')
  const startedAt = Date.now()
  await new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, 'build', ...cliArgs, '--', ...runnerArgs], { cwd: projectRoot, stdio: 'inherit', env: { ...process.env, pnpm_config_pm_on_fail: 'ignore' } })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`打包失败（${signal || code}），未整理发布产物`)))
  })
  const targetRoot = process.env.CARGO_TARGET_DIR ? resolve(projectRoot, 'src-tauri', process.env.CARGO_TARGET_DIR) : join(projectRoot, 'src-tauri/target')
  const profile = option('--profile') || (cliArgs.includes('--debug') ? 'debug' : 'release')
  const bundleDirectory = join(targetRoot, target.target, profile, 'bundle')
  const installers = await collectInstallers(bundleDirectory, release.version, startedAt)
  if (!installers.length) throw new Error('没有找到本次生成的安装包，旧版本产物不会作为本次发布结果')
  validateInstallerKinds(installers.map((path) => basename(path)), bundles)
  await assertEmptyDirectory(directory)
  await mkdir(directory, { recursive: true })
  const files = []
  for (const installer of installers) {
    const name = basename(installer)
    await copyFile(installer, join(directory, name), constants.COPYFILE_EXCL)
    files.push(name)
    if (/\.(exe|msi|appimage)$/i.test(name)) {
      await copyFile(`${installer}.sig`, join(directory, `${name}.sig`), constants.COPYFILE_EXCL)
      files.push(`${name}.sig`)
    }
  }
  if (target.platform.startsWith('macos')) {
    const archive = await collectMacUpdate(bundleDirectory, startedAt)
    const name = macUpdateName(release.version, target)
    await copyFile(archive, join(directory, name), constants.COPYFILE_EXCL)
    await copyFile(`${archive}.sig`, join(directory, `${name}.sig`), constants.COPYFILE_EXCL)
    files.push(name, `${name}.sig`)
  }
  const notesName = `RELEASE_NOTES_${release.version}.md`
  await writeFile(join(directory, notesName), release.markdown, { flag: 'wx' })
  await copyFile(join(projectRoot, 'CHANGELOG.md'), join(directory, 'CHANGELOG.md'), constants.COPYFILE_EXCL)
  files.push(notesName, 'CHANGELOG.md')
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    await copyFile(join(projectRoot, name), join(directory, name), constants.COPYFILE_EXCL); files.push(name)
  }
  await writeLicenseArchive(projectRoot, join(directory, 'THIRD_PARTY_LICENSES.zip'))
  files.push('THIRD_PARTY_LICENSES.zip')
  const platforms = await createUpdatePlatforms(directory, files, { ...target, bundles }, release.version)
  await writeFile(join(directory, 'latest.json'), `${JSON.stringify(updateManifest(release, platforms), null, 2)}\n`, { flag: 'wx' })
  files.push('latest.json')
  await writeChecksums(directory, files)
  console.log(`\n发布目录：${directory}\n${[...files, 'SHA256SUMS.txt'].join('\n')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
