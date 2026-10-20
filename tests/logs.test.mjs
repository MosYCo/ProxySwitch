import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './load-typescript.mjs'

const { initialLogState, logStateReducer, isRoutineLog, filterLogs, groupLogs, proxyRequest, filterRequests } = await loadTypeScript('../src/lib/logPresentation.ts')
const entry = (id, overrides = {}) => ({ id, timestamp: new Date(1700000000000 + id * 1000).toISOString(), level: 'INFO', category: 'caddy', message: 'entry', ...overrides })
const merge = (state, entries) => logStateReducer(state, { type: 'merge', entries })

test('snapshot refresh and live delivery merge without duplicates or lost events', () => {
  let state = merge(initialLogState, [entry(3)])
  state = merge(state, [entry(1), entry(2), entry(3)])
  state = merge(state, [entry(2), entry(4)])
  assert.deepEqual(state.entries.map(log => log.id), [1, 2, 3, 4])
})

test('clearing one stream rejects stale snapshots while keeping the other stream and new events', () => {
  let state = merge(initialLogState, [entry(1, { category: 'system' }), entry(2)])
  state = logStateReducer(state, { type: 'clear', result: { source: 'runtime', through_id: 2 } })
  state = merge(state, [entry(1, { category: 'system' }), entry(2), entry(3, { category: 'system' })])
  assert.deepEqual(state.entries.map(log => log.id), [2, 3])
  state = logStateReducer(state, { type: 'clear', result: { source: 'runtime', through_id: 1 } })
  assert.equal(state.clearedThrough.runtime, 2)
})

test('heavy Caddy traffic cannot evict the software stream', () => {
  const state = merge(initialLogState, [entry(1, { category: 'system' }), ...Array.from({ length: 800 }, (_, i) => entry(i + 2))])
  assert.equal(state.entries.length, 501)
  assert.equal(state.entries[0].id, 1)
  assert.equal(state.entries[1].id, 302)
})

test('only successful read-only admin polling and diagnostics are routine', () => {
  const probe = entry(1, { data: { logger: 'admin.api', msg: 'received request', method: 'GET', uri: '/config/' } })
  assert.equal(isRoutineLog(probe), true)
  assert.equal(isRoutineLog({ ...probe, data: { ...probe.data, method: 'POST', uri: '/load' } }), false)
  assert.equal(isRoutineLog({ ...probe, data: { ...probe.data, uri: '/config/apps/http/' } }), false)
  assert.equal(isRoutineLog({ ...probe, level: 'WARN' }), false)
  assert.equal(isRoutineLog({ ...probe, level: 'ERROR' }), false)
  assert.equal(isRoutineLog({ ...probe, data: { ...probe.data, status: 500 } }), false)
  assert.equal(filterLogs([probe], 'caddy', '', 'all', false).length, 0)
  assert.equal(filterLogs([probe], 'caddy', '', 'all', true).length, 1)
})

test('search includes raw error details and problem filtering includes failed proxy responses', () => {
  const logs = [entry(1, { data: { status: 502, error: 'upstream timeout' } }), entry(2, { category: 'system', level: 'WARN' }), entry(3)]
  assert.deepEqual(filterLogs(logs, 'caddy', 'timeout', 'problems', false).map(log => log.id), [1])
  assert.deepEqual(filterLogs(logs, 'runtime', '', 'problems', false).map(log => log.id), [2])
})

test('repeat groups preserve first and latest times without hiding changed failures', () => {
  const first = entry(1, { level: 'ERROR', data: { ts: 1, error: 'refused' } })
  const repeated = entry(2, { level: 'ERROR', data: { error: 'refused', ts: 2 } })
  const changed = entry(3, { level: 'ERROR', data: { ts: 3, error: 'timeout' } })
  const groups = groupLogs([first, repeated, changed, entry(4)], true)
  assert.equal(groups.length, 3)
  assert.equal(groups[0].count, 2)
  assert.equal(groups[0].firstTimestamp, first.timestamp)
  assert.equal(groups[0].log.id, repeated.id)
  assert.equal(groups[1].count, 1)
  assert.equal(groupLogs([first, repeated], false).length, 2)
})

test('proxy requests stay separate even when their paths and status codes match', () => {
  const logs = [entry(1, { data: { logger: 'http.log.access', request: { uri: '/api' }, status: 200 } }), entry(2, { data: { logger: 'http.log.access', request: { uri: '/api' }, status: 200 } })]
  assert.equal(groupLogs(logs, true).length, 2)
})

test('request details use captured route metadata and the original URI', () => {
  const log = entry(1, { data: { logger: 'http.log.access', cpt_metadata_encoding: 'url', cpt_project: encodeURIComponent('客服{project}+'), cpt_environment: encodeURIComponent('测试环境'), cpt_backend: encodeURIComponent('https://api.example.com/v2/'), cpt_original_uri: '/客服/users?q=1', request: { method: 'POST', uri: '/v2/users?q=1', remote_ip: '127.0.0.1' }, status: 201, duration: 0.032 } })
  const request = proxyRequest(log)
  assert.equal(request.project, '客服{project}+')
  assert.equal(request.environment, '测试环境')
  assert.equal(request.backend, 'https://api.example.com/v2/')
  assert.equal(request.uri, '/客服/users?q=1')
  assert.equal(request.method, 'POST')
  assert.equal(request.status, 201)
  assert.equal(request.durationMs, 32)
})

test('shared-port request filters preserve the environment recorded at request time', () => {
  const make = (id, project, environment, status) => proxyRequest(entry(id, { data: { logger: 'http.log.access', cpt_project: project, cpt_environment: environment, cpt_backend: `http://${environment}.example.com/`, request: { method: 'GET', uri: '/api' }, status } }))
  const requests = [make(1, 'one', 'dev', 200), make(2, 'two', 'dev', 502), make(3, 'one', 'stage', 201)]
  assert.deepEqual(filterRequests(requests, 'one', '', false).map(request => request.environment), ['dev', 'stage'])
  assert.deepEqual(filterRequests(requests, null, '', true).map(request => request.project), ['two'])
  assert.equal(filterRequests(requests, 'one', 'stage.example.com', false).length, 1)
})

test('legacy and unmatched requests are not attributed to a current project by guesswork', () => {
  const request = proxyRequest(entry(1, { data: { logger: 'http.log.access', request: { method: 'GET', uri: '/old/path' }, status: 404 } }))
  assert.equal(request.project, null)
  assert.equal(request.environment, null)
  assert.equal(request.uri, '/old/path')
  assert.equal(proxyRequest(entry(2, { data: { logger: 'admin.api', request: { method: 'GET', uri: '/config/' } } })), null)
})
