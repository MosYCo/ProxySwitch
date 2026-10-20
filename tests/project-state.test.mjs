import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './load-typescript.mjs'

const { getProjectState } = await loadTypeScript('../src/lib/projectState.ts')
const project = { enabled: true, current: 'dev', environments: { dev: { addr: 'http://localhost:3000' } } }

test('disabled projects remain stopped while the engine is running', () => {
  assert.equal(getProjectState({ ...project, enabled: false }, true), 'disabled')
})

test('selecting an environment does not imply that the proxy is running', () => {
  assert.equal(getProjectState(project, false), 'stopped')
  assert.equal(getProjectState(project, true), 'running')
})

test('an unknown engine status is never presented as running', () => {
  assert.equal(getProjectState(project, true, false), 'checking')
  assert.equal(getProjectState(project, false, false), 'checking')
})

test('a project needs its own selected environment before it can serve requests', () => {
  assert.equal(getProjectState({ ...project, current: '' }, true), 'unconfigured')
  assert.equal(getProjectState({ ...project, environments: {} }, true), 'unconfigured')
  assert.equal(getProjectState({ ...project, current: 'toString' }, true), 'unconfigured')
})
