import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'shadcn.manifest.json')
const mode = process.argv[2] || 'check'
const require = createRequire(import.meta.url)
const hash = (source) => createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex')
const config = JSON.parse(await readFile(join(root, 'components.json'), 'utf8'))
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const cliVersion = packageJson.devDependencies.shadcn
const uiDirectory = join(root, 'src/components/ui')

export function validateManagedSources(manifest, files, operation, version, style) {
  if (operation !== 'update' && (manifest.cliVersion !== version || manifest.style !== style)) throw new Error('shadcn CLI 或样式配置已改变，请运行 pnpm ui:update')
  if (JSON.stringify(Object.keys(files).sort()) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error('官方组件清单已变化，请先移走额外文件或恢复缺少的文件，再用 pnpm ui:add 或 pnpm ui:update 管理组件')
  for (const [file, fingerprint] of Object.entries(files)) {
    if (fingerprint === manifest.files[file]) continue
    // update overwrites every listed UI component. Helpers must be clean because
    // the add command does not necessarily regenerate them (notably utils.ts).
    if (operation === 'update' && file.startsWith('src/components/ui/')) continue
    throw new Error(`${file} 已被直接修改。请将定制移至业务层，再${file.startsWith('src/components/ui/') ? '运行 pnpm ui:update 恢复官方源码' : '从 Git 恢复此辅助文件的官方源码'}`)
  }
}

async function generatedFiles() {
  const entries = await readdir(uiDirectory, { withFileTypes: true })
  if (entries.some(entry => !entry.isFile() || !entry.name.endsWith('.tsx'))) throw new Error('components/ui 只允许官方 CLI 生成的 TSX 组件')
  return [...entries.map(entry => `src/components/ui/${entry.name}`), 'src/hooks/use-mobile.ts', 'src/lib/utils.ts'].sort()
}

async function readGeneratedFiles() {
  const files = {}
  for (const file of await generatedFiles()) files[file] = hash(await readFile(join(root, file), 'utf8'))
  return files
}

async function record() {
  const files = await readGeneratedFiles()
  const components = Object.keys(files).filter(file => file.startsWith('src/components/ui/')).map(file => file.split('/').at(-1).slice(0, -4)).sort()
  await writeFile(manifestPath, JSON.stringify({
    cliVersion, style: config.style, registry: `https://ui.shadcn.com/r/styles/${config.style}/{name}.json`, components, files,
  }, null, 2) + '\n')
}

async function checkBusinessControls(directory = join(root, 'src')) {
  const forbidden = new Set(['button', 'input', 'select', 'textarea', 'details', 'summary', 'label'])
  const errors = []
  async function visitDirectory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (path === uiDirectory) continue
      if (entry.isDirectory()) { await visitDirectory(path); continue }
      if (!entry.name.endsWith('.tsx')) continue
      const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = node => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && forbidden.has(node.tagName.getText(source))) {
          const position = source.getLineAndCharacterOfPosition(node.getStart(source))
          errors.push(`${relative(root, path)}:${position.line + 1} 请使用官方 shadcn/ui 组件替代 <${node.tagName.getText(source)}>`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  await visitDirectory(directory)
  if (errors.length) throw new Error(errors.join('\n'))
}

async function check() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const files = await readGeneratedFiles()
  validateManagedSources(manifest, files, 'check', cliVersion, config.style)
  await checkBusinessControls()
  console.log(`官方 shadcn/ui 源码校验通过：${manifest.components.length} 个组件，${Object.keys(files).length} 个受管理文件。`)
}

async function runCli(args) {
  await new Promise((accept, reject) => {
    const child = spawn(process.execPath, [require.resolve('shadcn'), 'add', ...args], { cwd: root, stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? accept() : reject(new Error(`shadcn CLI 执行失败（${code}），未更新组件来源清单`)))
  })
}

async function main() {
  if (mode === 'record') {
    try { await readFile(manifestPath); throw new Error('已有来源清单，请通过 pnpm ui:update 更新官方源码') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await record()
  } else if (mode === 'check') {
    await check()
  } else if (['diff', 'update', 'add'].includes(mode)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const components = mode === 'add' ? process.argv.slice(3) : manifest.components
    if (!components.length || components.some(name => !/^[a-z][a-z0-9-]*$/.test(name))) throw new Error('请提供官方组件名称，例如 pnpm ui:add accordion')
    if (mode !== 'diff') {
      validateManagedSources(manifest, await readGeneratedFiles(), mode, cliVersion, config.style)
      await checkBusinessControls()
    }
    await runCli([...components, ...(mode === 'diff' ? ['--dry-run', '--diff', 'src/'] : ['--overwrite', '--yes'])])
    if (mode !== 'diff') {
      await record()
      await check()
      console.log('请运行 pnpm licenses:generate、pnpm build、pnpm test 和 pnpm test:ui，检查官方更新与业务代码的兼容性。')
    }
  } else throw new Error('支持 check、diff、update 和 add')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
