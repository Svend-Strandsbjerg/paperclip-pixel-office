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
  t.mock.timers.tick(11000)
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

test('task hydration, delegation, malformed responses and issue recovery preserve handoff semantics', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const task = (id: number) => ({ taskId: `DEV-${id}`, title: `Task ${id}` })
  const replies = [
    { ...live, tasks: [task(1)] },
    { ...live, tasks: [task(1), { ...task(2), source: 'reviewer', secret: 'private' }] },
    { ...live, snapshot: {} },
    { ...live, tasks: [task(1), task(2), task(3)] },
    { ...live, tasks: null },
    { ...live, tasks: [task(1), task(2), task(3), task(4)] },
    { ...live, tasks: [task(1), task(2), task(3), task(4), task(5)] },
  ]
  t.mock.method(globalThis, 'fetch', async () => Response.json(replies.shift()))
  const states: OfficeSnapshot[] = []
  const events: unknown[] = []
  let failures = 0
  const stop = pollOffice(data => states.push(data), () => failures++, event => events.push(event))
  t.after(stop)
  await flush()
  assert.deepEqual(events, [])
  t.mock.timers.tick(1500); await flush()
  assert.deepEqual(events, [{ ...task(2), source: 'orchestrator', target: 'developer' }])
  const lastValid = states.at(-1)
  t.mock.timers.tick(1500); await flush()
  assert.equal(failures, 1)
  assert.equal(states.at(-1), lastValid)
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(1500); await flush() }
  assert.equal(events.length, 1)
  t.mock.timers.tick(1500); await flush()
  assert.deepEqual(events, [2, 5].map(id => ({ ...task(id), source: 'orchestrator', target: 'developer' })))
})

test('disposal suppresses late successful state and handoff callbacks even if fetch ignores abort', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let resolve!: (response: Response) => void
  const fetchMock = t.mock.method(globalThis, 'fetch', () => new Promise<Response>(done => { resolve = done }))
  const stop = pollOffice(() => assert.fail('Late state'), () => assert.fail('Late failure'), () => assert.fail('Late handoff'))
  t.after(stop)
  stop()
  resolve(Response.json({ ...live, tasks: [{ taskId: 'DEV-1', title: 'Late task' }] }))
  await flush()
  t.mock.timers.tick(30000)
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('pipeline-only polling updates do not replay handoffs and outages clear freshness', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { demoDeliveries } = await import('../src/pipeline')
  let deliveries: unknown = demoDeliveries
  let broken = false
  t.mock.method(globalThis,'fetch',async()=>broken ? new Response('',{status:503}) : Response.json({...live,tasks:[{taskId:'DEV-1',title:'Existing task'}],deliveries}))
  let events=0, failures=0
  const states: OfficeSnapshot[]=[]
  const stop=pollOffice(d=>states.push(d),()=>failures++,()=>events++)
  t.after(stop);await flush()
  deliveries=[{...demoDeliveries[0],merge:'waiting',pr:{...demoDeliveries[0].pr,head:'b'.repeat(40)},gates:demoDeliveries[0].gates.map(g=>({...g,state:'invalidated'}))}]
  t.mock.timers.tick(1500);await flush()
  assert.equal(states.at(-1)!.deliveries![0].merge,'waiting');assert.equal(events,0)
  broken=true;t.mock.timers.tick(1500);await flush();assert.equal(failures,1)
  broken=false;deliveries=null;t.mock.timers.tick(1500);await flush()
  assert.equal(states.at(-1)!.deliveries,null);assert.equal(events,0)
})
