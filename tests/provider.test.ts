import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { officeMiddleware, mapAgents, readConfig } from '../server/office-state'
import { parseSnapshot } from '../src/provider'
import { demoSnapshot } from '../src/state'
const ids = { orchestrator: 'a', developer: 'b', 'browser-qa': 'c', reviewer: 'd' }
const agents = Object.values(ids).map((id, i) => ({ id, status: i === 1 ? 'running' : 'idle', name: 'untrusted', secret: 'private' }))
const env = { PAPERCLIP_API_URL: 'http://paperclip.test', PAPERCLIP_COMPANY_ID: 'company', PAPERCLIP_API_KEY: 'secret', PAPERCLIP_AGENT_ROLES: JSON.stringify(ids) }
test('stable IDs map running only, ignore names and unknown agents', () => {
  assert.deepEqual(mapAgents([...agents, { id: 'unknown', status: 'running' }], ids), { orchestrator: 'idle', developer: 'working', 'browser-qa': 'idle', reviewer: 'idle' })
  for (const status of ['idle', 'active', 'paused', 'error', 'terminated', 'pending_approval']) assert.equal(mapAgents(agents.map(a => ({ ...a, status })), ids).developer, 'idle')
  for (const input of [{}, [], [...agents, agents[0]], agents.map(a => ({ ...a, status: null }))]) assert.throws(() => mapAgents(input, ids))
})
test('configuration requires explicit unique IDs and never defaults to demo', () => {
  assert.throws(() => readConfig({}))
  assert.throws(() => readConfig({ ...env, PAPERCLIP_AGENT_ROLES: '{}' }))
  assert.throws(() => readConfig({ ...env, PAPERCLIP_AGENT_ROLES: JSON.stringify({ ...ids, developer: 'a' }) }))
  assert.deepEqual(readConfig({ OFFICE_MODE: 'demo' }), { mode: 'demo' })
})
async function withBridge(config: NodeJS.ProcessEnv, fetcher: typeof fetch, run: (url: string) => Promise<void>) {
  const middleware = officeMiddleware(config, fetcher)
  const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end() }) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try { await run(`http://127.0.0.1:${(server.address() as {port: number}).port}/api/office-state`) }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
}
test('HTTP bridge uses GET with server credentials and returns only minimal state', async () => {
  let calls = 0
  await withBridge(env, async (url, options) => {
    calls++
    assert.equal(url, 'http://paperclip.test/api/companies/company/agents')
    assert.equal(options?.method, 'GET')
    assert.equal((options?.headers as Record<string,string>).Authorization, 'Bearer secret')
    assert.equal(options?.redirect, 'error')
    return Response.json(agents)
  }, async url => {
    const response = await fetch(url)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { mode: 'live', snapshot: mapAgents(agents, ids) })
    assert.equal((await fetch(url, { method: 'POST' })).status, 405)
    assert.equal(calls, 1)
  })
})
test('configuration, transport, upstream HTTP and schema failures are sanitized', async () => {
  for (const fetcher of [async () => { throw new Error('secret private raw upstream') }, async () => new Response('secret', { status: 401 }), async () => Response.json({ secret: 'private' })]) {
    await withBridge(env, fetcher, async url => {
      const response = await fetch(url)
      assert.equal(response.status, 503)
      assert.deepEqual(await response.json(), { error: 'Office state unavailable' })
    })
  }
  await withBridge({}, async () => { throw new Error('must not fetch') }, async url => assert.equal((await fetch(url)).status, 503))
})
test('demo is deterministic, explicitly labeled, and makes no upstream request', async () => {
  await withBridge({ OFFICE_MODE: 'demo' }, async () => { throw new Error('must not fetch') }, async url => {
    for (let i = 0; i < 2; i++) assert.deepEqual(await (await fetch(url)).json(), { mode: 'demo', snapshot: demoSnapshot('mixed') })
  })
})
test('browser validates complete snapshots before updating the renderer', () => {
  assert.deepEqual(parseSnapshot({ mode: 'live', snapshot: demoSnapshot('idle') }).snapshot, demoSnapshot('idle'))
  for (const input of [null, {}, { mode: 'live', snapshot: {} }, { mode: 'live', snapshot: { ...demoSnapshot('idle'), developer: 'running' } }]) assert.throws(() => parseSnapshot(input))
  const valid = { mode: 'live', snapshot: demoSnapshot('idle') }
  for (const input of [Object.create(valid), { ...valid, snapshot: Object.assign([], valid.snapshot) }, { ...valid, snapshot: Object.create(valid.snapshot) }]) assert.throws(() => parseSnapshot(input))
  assert.deepEqual(parseSnapshot({ ...valid, secret: 'private', snapshot: { ...valid.snapshot, unknown: 'working' } }), valid)
})
