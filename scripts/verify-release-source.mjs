import { execFileSync, spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function verifyReleaseSource({ cwd = projectRoot, revision = 'HEAD', stableRef = 'refs/remotes/origin/master' } = {}) {
  const commit = ref => {
    try {
      return execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], {
        cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      }).trim()
    } catch {
      throw new Error(`Cannot resolve release source ${ref}; fetch the stable branch with full history`)
    }
  }
  const releaseCommit = commit(revision)
  const stableCommit = commit(stableRef)
  const result = spawnSync('git', ['merge-base', '--is-ancestor', releaseCommit, stableCommit], {
    cwd, encoding: 'utf8', windowsHide: true,
  })
  if (result.status === 1) throw new Error('Release tags must point to a commit already merged into master')
  if (result.status !== 0) throw new Error('Cannot verify release ancestry; fetch the stable branch with full history')
  return releaseCommit
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(`Verified stable release source: ${verifyReleaseSource({ revision: process.env.GITHUB_SHA || 'HEAD' })}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
