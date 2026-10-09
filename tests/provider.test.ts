import { demoDeliveries } from '../src/pipeline'
import { mapIdentities, demoIdentities } from '../server/office-state.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { officeMiddleware, mapAgents, readConfig, ISSUE_LIMIT } from '../server/office-state'
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
async function withBridge(config: NodeJS.ProcessEnv, fetcher: typeof fetch, run: (url: string) => Promise<void>, now = Date.now) {
  const middleware = officeMiddleware(config, fetcher, now)
  const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end() }) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try { await run(`http://127.0.0.1:${(server.address() as {port: number}).port}/api/office-state`) }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
}
test('HTTP bridge uses GET with server credentials and returns only minimal state', async () => {
  let calls = 0
  await withBridge(env, async (url, options) => {
    calls++
    assert.ok(['http://paperclip.test/api/companies/company/agents', 'http://paperclip.test/api/companies/company/issues?limit=1000'].includes(String(url)))
    assert.equal(options?.method, 'GET')
    assert.equal((options?.headers as Record<string,string>).Authorization, 'Bearer secret')
    assert.equal(options?.redirect, 'error')
    return Response.json(new URL(String(url)).pathname.endsWith('/issues') ? [] : agents)
  }, async url => {
    const response = await fetch(url)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { mode: 'live', snapshot: mapAgents(agents, ids), identities: mapIdentities(agents, ids), tasks: [], deliveries: [] })
    assert.equal((await fetch(url, { method: 'POST' })).status, 405)
    assert.equal(calls, 2)
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
    for (let i = 0; i < 2; i++) assert.deepEqual(await (await fetch(url)).json(), { mode: 'demo', snapshot: demoSnapshot('mixed'), identities: demoIdentities, tasks: null, deliveries: demoDeliveries })
  })
})
test('browser validates complete snapshots before updating the renderer', () => {
  assert.deepEqual(parseSnapshot({ mode: 'live', snapshot: demoSnapshot('idle') }).snapshot, demoSnapshot('idle'))
  for (const input of [null, {}, { mode: 'live', snapshot: {} }, { mode: 'live', snapshot: { ...demoSnapshot('idle'), developer: 'running' } }]) assert.throws(() => parseSnapshot(input))
})
test('bounded issue read includes parent and child beyond a default page', async () => {
  const issues = Array.from({ length: 200 }, (_, i) => ({ id: `other-${i}`, title: 'Other issue' }))
  const related = [
    { id: 'parent', title: 'Parent', assigneeAgentId: ids.orchestrator },
    { id: 'child', title: 'New task', identifier: 'DEV-39', parentId: 'parent', assigneeAgentId: ids.developer },
  ]
  await withBridge(env, async (url, options) => {
    assert.equal(options?.method, 'GET')
    const request = new URL(String(url))
    if (request.pathname.endsWith('/agents')) return Response.json(agents)
    assert.equal(request.searchParams.get('limit'), String(ISSUE_LIMIT))
    return Response.json([...issues, ...related].slice(0, Number(request.searchParams.get('limit') || 200)))
  }, async url => {
    assert.deepEqual((await (await fetch(url)).json()).tasks, [{ taskId: 'DEV-39', title: 'New task' }])
  })
})
test('issue failures log safe server diagnostics while preserving live agent states', async t => {
  const warn = t.mock.method(console, 'warn', () => {})
  const cases: [() => Promise<Response>, string][] = [
    [async () => { throw new Error('secret private raw upstream') }, 'request failed or timed out'],
    [async () => new Response('secret private', { status: 403 }), 'HTTP 403'],
    [async () => new Response('secret private'), 'invalid issue response'],
    [async () => Response.json({ secret: 'private' }), 'invalid issue response'],
    [async () => Response.json(Array.from({ length: ISSUE_LIMIT }, (_, i) => ({ id: String(i), title: 'private' }))), 'issue limit 1000 reached'],
  ]
  for (const [issueResponse, diagnostic] of cases) {
    await withBridge(env, async url => {
      if (new URL(String(url)).pathname.endsWith('/issues')) return issueResponse()
      return Response.json(agents)
    }, async url => {
      const response = await fetch(url)
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { mode: 'live', snapshot: mapAgents(agents, ids), identities: mapIdentities(agents, ids), tasks: null, deliveries: null })
    })
    const message = warn.mock.calls.at(-1)!.arguments.join(' ')
    assert.ok(message.includes(diagnostic))
    assert.doesNotMatch(message, /secret|private|Bearer|paperclip.test/)
  }
  assert.equal(warn.mock.calls.length, cases.length)
})

test('issue read tolerates latency beyond the former 1.5-second budget', async () => {
  await withBridge(env, async (url, options) => {
    if (new URL(String(url)).pathname.endsWith('/agents')) return Response.json(agents)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1700)
      options?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Timed out')) }, { once: true })
    })
    return Response.json([])
  }, async url => {
    const data = await (await fetch(url)).json()
    assert.deepEqual(data.tasks, [])
    assert.equal(data.snapshot.developer, 'working')
  })
})

test('snapshot boundary rejects inherited and non-plain shapes and strips unknown fields', () => {
  const valid = { mode: 'live', snapshot: demoSnapshot('idle') }
  for (const input of [Object.create(valid), Object.assign(new Date(), valid),
    { ...valid, snapshot: Object.assign([], valid.snapshot) },
    { ...valid, snapshot: Object.create(valid.snapshot) },
    { ...valid, snapshot: Object.assign(new Date(), valid.snapshot) }]) assert.throws(() => parseSnapshot(input))
  assert.deepEqual(parseSnapshot({ ...valid, secret: 'private', snapshot: { ...valid.snapshot, unknown: 'working' } }), valid)
})

test('snapshot boundary preserves tasks while excluding identity and activity overrides', () => {
  const valid = { mode: 'live', snapshot: demoSnapshot('idle') }
  const task = { taskId: 'DEV-1', title: 'Build feature' }
  assert.deepEqual(parseSnapshot({ ...valid, tasks: [{ ...task, source: 'reviewer', secret: 'private' }] }), { ...valid, tasks: [task] })
  for (const tasks of [null, [], [task]]) assert.deepEqual(parseSnapshot({ ...valid, tasks }), { ...valid, tasks })
  for (const tasks of [{}, [null], [Object.create(task)], [Object.assign([], task)], Array(1),
    [{ ...task, taskId: 'bad' }], [{ ...task, title: 'x'.repeat(81) }]]) assert.throws(() => parseSnapshot({ ...valid, tasks }))
})

test('live pipeline bridge keeps agents on GitHub outage and exposes only structured projection', async () => {
  const sha='a'.repeat(40), prUrl='https://github.com/owner/repo/pull/1'
  const parent={id:'p',identifier:'DEV-1',title:'Delivery',status:'in_progress',assigneeAgentId:ids.orchestrator}
  const roles=['developer','browser-qa','reviewer'] as const
  const children=roles.map((role,i)=>({id:role,identifier:`DEV-${i+2}`,title:role,parentId:'p',assigneeAgentId:ids[role],status:'done',createdAt:new Date(i*2000).toISOString(),completedAt:new Date(i*2000+1000).toISOString()}))
  let broken=false, now=0, githubCalls=0
  await withBridge({...env,OFFICE_GITHUB_TOKEN:'github-secret'},async(url,options)=>{
    assert.equal(options?.method,'GET');assert.equal(options?.redirect,'error')
    const u=new URL(String(url))
    if(u.hostname==='api.github.com') {
      githubCalls++
      assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer github-secret')
      if(broken) return new Response('private',{status:503})
      return Response.json({number:1,html_url:prUrl,state:'open',merged:false,head:{sha,ref:'feature'},base:{ref:'main',repo:{full_name:'owner/repo'}},private:'github-secret'})
    }
    assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer secret')
    if(u.pathname.endsWith('/agents')) return Response.json(agents)
    if(u.pathname.endsWith('/issues')) return Response.json([parent,...children])
    const issueId=u.pathname.split('/')[3]
    return Response.json(issueId==='p'?[]:[{issueId,type:'pull_request',provider:'github',url:prUrl,metadata:{delivery:{sha,outcome:'passed'},private:'secret'}}])
  },async url=>{
    const ready=await(await fetch(url)).json();assert.equal(ready.deliveries[0].merge,'ready')
    assert.ok(!JSON.stringify(ready).includes('secret'));assert.ok(!JSON.stringify(ready).includes('metadata'))
    broken=true
    const cached=await Promise.all([fetch(url).then(r=>r.json()),fetch(url).then(r=>r.json())])
    assert.ok(cached.every(d=>d.deliveries[0].merge==='ready'));assert.equal(githubCalls,1)
    now=120_000
    const unavailable=await(await fetch(url)).json();assert.equal(unavailable.deliveries[0].merge,'waiting')
    assert.deepEqual(unavailable.snapshot,ready.snapshot);assert.deepEqual(unavailable.tasks,ready.tasks)
    assert.equal(githubCalls,2)
    await fetch(url);assert.equal(githubCalls,2)
    broken=false;now+=5000
    assert.equal((await(await fetch(url)).json()).deliveries[0].merge,'ready')
    assert.equal(githubCalls,3)
  },()=>now)
})
