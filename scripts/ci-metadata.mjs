import { appendFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareRelease, projectRoot } from './release-notes.mjs'
import { pinnedRelease, detectPlatform } from './download-caddy.mjs'

export const buildTargets = JSON.parse(readFileSync(join(projectRoot, '.github/build-targets.json'), 'utf8'))
const ids = new Set(), triples = new Set()
for (const item of buildTargets) {
  const binary = `caddy-${item.target}${item.platform === 'windows' ? '.exe' : ''}`
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || ids.has(item.id) || triples.has(item.target)
      || !/^[a-z0-9.-]+$/.test(item.runner) || pinnedRelease.targets[item.platform]?.binary !== binary
      || !item.bundles?.length || item.bundles.some((kind) => !['nsis', 'msi', 'deb', 'rpm', 'appimage', 'dmg'].includes(kind))) {
    throw new Error(`Invalid build target: ${item.id}`)
  }
  ids.add(item.id); triples.add(item.target)
}
if (!buildTargets.length) throw new Error('Build matrix must not be empty')

export function rustHost() {
  const host = execFileSync('rustc', ['-vV'], { cwd: projectRoot }).toString().match(/^host: (.+)$/m)?.[1]
  if (!host) throw new Error('Could not determine the Rust host')
  return host
}

export function getBuildTarget(target) {
  const result = buildTargets.find((item) => item.target === target)
  if (!result) throw new Error(`Unsupported release target: ${target}`)
  return result
}

async function main() {
  if (process.argv.includes('--check-host')) {
    const item = getBuildTarget(process.env.BUILD_TARGET)
    if (rustHost() !== item.target || detectPlatform() !== item.platform) throw new Error(`Runner architecture does not match ${item.id}`)
    console.log(`Verified native build host: ${item.id}`)
    return
  }
  const release = await prepareRelease(projectRoot, process.env.RELEASE_TAG || undefined)
  const matrix = JSON.stringify({ include: buildTargets })
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${release.version}\nmatrix=${matrix}\n`)
  console.log(`Verified v${release.version}; build targets: ${buildTargets.map((item) => item.id).join(', ')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
