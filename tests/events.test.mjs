import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { readFile } from 'node:fs/promises'
import { loadTypeScript } from './load-typescript.mjs'
const { createEventSubscription } = await loadTypeScript('../src/lib/eventSubscription.ts')
const { projectEntryUrl, hasProxyRoute } = await loadTypeScript('../src/lib/projectRouting.ts')
const { appEvents, workspaceEventNames } = await loadTypeScript('../src/lib/appEvents.ts')

test('frontend and backend use the same legal Tauri event names', async () => {
  const rust = await readFile(new URL('../src-tauri/src/events.rs', import.meta.url), 'utf8')
  const backend = new Map([...rust.matchAll(/pub const (\w+): &str = "([^"]+)";/g)].map((match) => [match[1], match[2]]))
  assert.equal(backend.size, Object.keys(appEvents).length)
  assert.equal(new Set(Object.values(appEvents)).size, backend.size)
  for (const [key, name] of Object.entries(appEvents)) {
    assert.match(name, /^[a-zA-Z0-9_:/-]+$/)
    assert.equal(backend.get(key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()), name)
  }
  assert(workspaceEventNames.every((name) => Object.values(appEvents).includes(name)))
})

test('connection is announced only after every listener is registered', async () => {
  let finish
  const statuses = []
  const received = []
  const callbacks = new Map()
  const disposed = []
  const stop = createEventSubscription({
    events: [appEvents.configChanged, appEvents.healthUpdated],
    subscribe: async (event, callback) => {
      callbacks.set(event, callback)
      if (event === appEvents.healthUpdated) await new Promise(resolve => { finish = resolve })
      return () => disposed.push(event)
    },
    onStatus: value => statuses.push(value),
    onEvent: (event, payload) => received.push({ event, payload }),
  })
  try {
    await delay(0)
    assert.deepEqual(statuses, [false])
    finish()
    await delay(0)
    assert.deepEqual(statuses, [false, true])
    callbacks.get(appEvents.healthUpdated)({ latency_ms: 12 })
    callbacks.get(appEvents.healthUpdated)({ latency_ms: 87 })
    assert.equal(received[1].payload.latency_ms, 87)
  } finally { stop() }
  assert.deepEqual(disposed, [appEvents.configChanged, appEvents.healthUpdated])
})

test('failed setup clears partial listeners and retries without duplicates', async () => {
  let fail = true
  const active = new Set()
  const statuses = []
  const stop = createEventSubscription({
    events: ['one', 'two'], retryDelay: 10,
    subscribe: async event => {
      if (event === 'two' && fail) { fail = false; throw new Error('IPC unavailable') }
      assert(!active.has(event))
      active.add(event)
      return () => active.delete(event)
    },
    onStatus: value => statuses.push(value), onEvent: () => {},
  })
  try {
    await delay(0)
    assert.equal(active.size, 0)
    assert(!statuses.includes(true))
    await delay(40)
    assert.deepEqual([...active], ['one', 'two'])
    assert.equal(statuses.at(-1), true)
  } finally { stop() }
  assert.equal(active.size, 0)
})

test('unmount during async setup disposes late subscriptions', async () => {
  let finish
  let disposed = 0
  const statuses = []
  const stop = createEventSubscription({
    events: ['one', 'two'],
    subscribe: async () => { await new Promise(resolve => { finish = resolve }); return () => disposed++ },
    onStatus: value => statuses.push(value), onEvent: () => {},
  })
  stop()
  finish()
  await delay(0)
  assert.equal(disposed, 1)
  assert.deepEqual(statuses, [false])
})

test('dispose cancels retry after a connection failure', async () => {
  let attempts = 0
  const stop = createEventSubscription({
    events: ['one'], retryDelay: 10,
    subscribe: async () => { attempts++; throw new Error('offline') },
    onStatus: () => {}, onEvent: () => {},
  })
  await delay(0)
  stop()
  await delay(30)
  assert.equal(attempts, 1)
})

test('project entry URLs reflect explicit routing including Unicode names', () => {
  assert.equal(projectEntryUrl({ name: 'one', listen: ':8080' }), 'http://localhost:8080/')
  assert.equal(projectEntryUrl({ name: 'one', listen: ':8080', path_prefix: true }), 'http://localhost:8080/one/')
  assert.equal(projectEntryUrl({ name: '测试', listen: ':8080', path_prefix: true }), 'http://localhost:8080/%E6%B5%8B%E8%AF%95/')
})

test('disabled and empty projects do not count as enabled proxy routes', () => {
  const project = { enabled: true, current: 'dev', environments: { dev: {} } }
  assert.equal(hasProxyRoute(project), true)
  assert.equal(hasProxyRoute({ ...project, enabled: false }), false)
  assert.equal(hasProxyRoute({ ...project, environments: {} }), false)
  assert.equal(hasProxyRoute({ ...project, current: 'missing' }), false)
  assert.equal(hasProxyRoute({ current: 'dev', environments: { dev: {} } }), true)
})
