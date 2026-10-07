import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pollOffice, type OfficeSnapshot } from '../src/provider'
import { demoSnapshot } from '../src/state'

const flush = () => new Promise<void>(resolve => setImmediate(resolve))
const live: OfficeSnapshot = { mode: 'live', snapshot: demoSnapshot('working') }

test('polling is serial, retains valid state across failure, and resumes after 1500ms', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let resolve!: (response: Response) => void
  const fetchMock = t.mock.method(globalThis, 'fetch', () => new Promise<Response>(done => { resolve = done }))
  const states: OfficeSnapshot[] = []
  let failures = 0
  const stop = pollOffice(data => states.push(data), () => failures++)
  t.after(stop)
  t.mock.timers.tick(3000)
  assert.equal(fetchMock.mock.callCount(), 1)
  resolve(Response.json(live))
  await flush()
  assert.deepEqual(states, [live])
  t.mock.timers.tick(1499)
  assert.equal(fetchMock.mock.callCount(), 1)
  t.mock.timers.tick(1)
  resolve(Response.json({ error: 'Unavailable' }, { status: 503 }))
  await flush()
  assert.equal(failures, 1)
  assert.deepEqual(states, [live])
  t.mock.timers.tick(1500)
  resolve(Response.json({ ...live, snapshot: demoSnapshot('idle') }))
  await flush()
  assert.equal(states.length, 2)
  assert.equal(states[1].snapshot.developer, 'idle')
  stop()
  t.mock.timers.tick(10000)
  assert.equal(fetchMock.mock.callCount(), 3)
})

test('demo fetch stops polling so controls remain deterministic', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ ...live, mode: 'demo' }))
  const states: OfficeSnapshot[] = []
  const stop = pollOffice(data => states.push(data), () => assert.fail('Unexpected failure'))
  t.after(stop)
  await flush()
  t.mock.timers.tick(30000)
  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(states[0].mode, 'demo')
})

test('timeouts disconnect, retry, and disposal aborts without late callbacks', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let signal!: AbortSignal
  const fetchMock = t.mock.method(globalThis, 'fetch', (_url: unknown, options: RequestInit) => {
    signal = options.signal!
    return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }))
  })
  let failures = 0
  const stop = pollOffice(() => assert.fail('Unexpected state'), () => failures++)
  t.after(stop)
  t.mock.timers.tick(7000)
  await flush()
  assert.equal(signal.aborted, true)
  assert.equal(failures, 1)
  t.mock.timers.tick(1500)
  assert.equal(fetchMock.mock.callCount(), 2)
  stop()
  await flush()
  assert.equal(signal.aborted, true)
  assert.equal(failures, 1)
})
