import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

test('EXE upgrade stops only Caddy from the installation directory and releases its executable', { skip: process.platform !== 'win32', timeout: 30_000 }, async t => {
  const temporary = await realpath(tmpdir())
  const root = await mkdtemp(join(temporary, 'proxyswitch-installer-'))
  assert.equal(dirname(root), temporary)
  assert.ok(basename(root).startsWith('proxyswitch-installer-'))
  const children = []
  t.after(async () => {
    for (const { child, exited } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill()
      await exited
    }
    await rm(root, { recursive: true, force: true })
  })
  const source = resolve('src-tauri/binaries/caddy-x86_64-pc-windows-msvc.exe')
  const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'))
  const hook = resolve('src-tauri', config.bundle.windows.nsis.installerHooks)
  const script = join(dirname(hook), 'stop-installed-caddy.ps1')
  const installed = join(root, 'installed app 中文'), external = join(root, 'another installation')
  for (const directory of [installed, external]) {
    await mkdir(directory)
    await copyFile(source, join(directory, 'caddy.exe'))
    await writeFile(join(directory, 'caddy.json'), JSON.stringify({ admin: { disabled: true, config: { persist: false } } }))
    const child = spawn(join(directory, 'caddy.exe'), ['run', '--config', join(directory, 'caddy.json')], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, APPDATA: directory, XDG_CONFIG_HOME: directory, XDG_DATA_HOME: directory },
    })
    const exited = once(child, 'exit')
    children.push({ child, exited })
    let output = ''
    child.stderr.on('data', bytes => { output += bytes })
    const deadline = Date.now() + 5000
    while (!output.includes('serving initial configuration')) {
      assert.equal(child.exitCode, null, output)
      assert.ok(Date.now() < deadline, output)
      await delay(20)
    }
  }
  await assert.rejects(open(join(installed, 'caddy.exe'), 'r+'), error => ['EBUSY', 'EACCES', 'EPERM'].includes(error.code), 'A running Caddy must reproduce the installer file lock')
  const stopped = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-InstallDirectory', installed], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let errors = ''
  stopped.stderr.on('data', bytes => { errors += bytes })
  const [code] = await once(stopped, 'exit')
  assert.equal(code, 0, errors)
  await children[0].exited
  assert.equal(children[1].child.exitCode, null, 'An external Caddy from another directory must keep running')
  const executable = await open(join(installed, 'caddy.exe'), 'r+')
  await executable.close()
  const retry = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-InstallDirectory', installed], { windowsHide: true, stdio: 'ignore' })
  assert.equal((await once(retry, 'exit'))[0], 0, 'Retrying after a successful stop must be harmless')
})
