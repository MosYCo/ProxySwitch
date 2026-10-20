import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './load-typescript.mjs'

const { defaultSettings, healthCheckEnabled, parseStatusCodes, parseHeaderRules, formatHeaderRules, resolveProxyOptions } = await loadTypeScript('../src/lib/settings.ts')
const { projectEntryUrl } = await loadTypeScript('../src/lib/projectRouting.ts')
const { initialLogState, logStateReducer } = await loadTypeScript('../src/lib/logPresentation.ts')

test('health scope and explicit project/environment overrides determine pending counts', () => {
  const env = { addr: 'http://localhost:3000' }
  const project = { enabled: true, current: 'dev', health: { enabled: false } }
  assert.equal(healthCheckEnabled(defaultSettings, project, 'dev', env), false)
  assert.equal(healthCheckEnabled(defaultSettings, project, 'dev', { ...env, health: { enabled: true } }), true)
  const settings = { ...defaultSettings, health: { ...defaultSettings.health, only_current: true } }
  assert.equal(healthCheckEnabled(settings, { ...project, health: {} }, 'stage', env), false)
  assert.equal(healthCheckEnabled({ ...settings, health: { ...settings.health, enabled: false } }, { ...project, health: { enabled: true } }, 'dev', env), false)
})
test('header rules support values containing colons and explicit removals', () => {
  const rules = parseHeaderRules('X-Endpoint: https://api.example.com\n-X-Debug\nX-Empty:')
  assert.deepEqual(rules, { 'x-endpoint': 'https://api.example.com', 'x-debug': null, 'x-empty': '' })
  assert.deepEqual(parseHeaderRules(formatHeaderRules(rules)), rules)
  for (const value of ['X Broken: test', 'X-Mode: a\nx-mode: b', 'Host: host', 'not a rule']) assert.throws(() => parseHeaderRules(value))
})
test('empty overrides inherit but zero timeout and header removals are explicit', () => {
  const resolved = resolveProxyOptions({ connect_timeout_ms: 3000, response_timeout_ms: 5000, request_headers: { 'X-A': 'global', 'x-b': 'global' } }, { response_timeout_ms: 0, request_headers: { 'X-a': 'project' } }, { connect_timeout_ms: null, request_headers: { 'x-a': null } })
  assert.equal(resolved.connect_timeout_ms, 3000)
  assert.equal(resolved.response_timeout_ms, 0)
  assert.deepEqual(resolved.request_headers, { 'x-a': null, 'x-b': 'global' })
})
test('status code input rejects partial numbers and removes duplicates', () => {
  assert.deepEqual(parseStatusCodes(''), [])
  assert.deepEqual(parseStatusCodes('200, 204，200'), [200, 204])
  for (const value of ['200abc', '200.5', '99', '600']) assert.throws(() => parseStatusCodes(value))
})
test('custom project paths are reflected in every copied entry URL', () => {
  assert.equal(projectEntryUrl({ name: 'one', listen: ':8080', path_prefix: true, route_prefix: '/api/订单' }), 'http://localhost:8080/api/%E8%AE%A2%E5%8D%95/')
})
test('live log retention follows settings while preserving independent stream cursors', () => {
  const entries = Array.from({ length: 800 }, (_, i) => ({ id: i + 1, category: i % 2 ? 'system' : 'caddy', timestamp: '2026-01-01', level: 'INFO', message: 'test' }))
  let state = logStateReducer(initialLogState, { type: 'configure', limit: 150 })
  state = logStateReducer(state, { type: 'merge', entries })
  assert.equal(state.entries.length, 300)
  state = logStateReducer(state, { type: 'clear', result: { source: 'caddy', through_id: 800 } })
  state = logStateReducer(state, { type: 'configure', limit: 1000 })
  state = logStateReducer(state, { type: 'merge', entries })
  assert.equal(state.entries.length, 400)
  assert.ok(state.entries.every(entry => entry.category === 'system'))
})
