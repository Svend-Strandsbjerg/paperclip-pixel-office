import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { readFile, readdir, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createOfficeServer, listenConfig } from '../server/index.ts'

async function listen(server: Server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
async function close(server: Server) { await new Promise<void>(resolve => server.close(() => resolve())) }

test('production listener defaults and invalid ports', () => {
  assert.deepEqual(listenConfig({}), { host: '127.0.0.1', port: 3000 })
  assert.deepEqual(listenConfig({ HOST: '::1', PORT: '4288' }), { host: '::1', port: 4288 })
  for (const PORT of ['', '0', '-1', '65536', '3.5', 'garbage']) assert.throws(() => listenConfig({ PORT }))
})

test('built app, history fallback, assets, health and protected bridge through production HTTP', async t => {
  const secret = 'server-only-test-credential'
  const server = await createOfficeServer({ OFFICE_MODE: 'demo', PAPERCLIP_API_KEY: secret })
  const url = await listen(server)
  t.after(() => close(server))
  assert.equal((server.address() as { address: string }).address, '127.0.0.1')
  const health = await fetch(url + '/health')
  assert.equal(health.status, 200)
  assert.equal(await health.text(), '{"status":"ok"}')
  assert.equal(health.headers.get('cache-control'), 'no-store')
  const html = await readFile('dist/index.html', 'utf8')
  for (const route of ['/', '/office/teams?tab=activity']) {
    const response = await fetch(url + route)
    assert.match(response.headers.get('content-type')!, /text\/html/)
    assert.equal(await response.text(), html)
  }
  for (const file of await readdir('dist/assets')) {
    const response = await fetch(`${url}/assets/${file}`)
    assert.equal(response.status, 200)
    const body = await response.text()
    assert.equal(body, await readFile(join('dist/assets', file), 'utf8'))
    assert.ok(!body.includes(secret))
    assert.ok(!body.includes('PAPERCLIP_API_KEY'))
  }
  const head = await fetch(url + '/', { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  for (const route of ['/.env', '/%2eenv', '/server/index.ts', '/package.json', '/assets/missing.js', '/api/unknown', '/assets/missing']) assert.equal((await fetch(url + route)).status, 404)
  assert.equal((await fetch(url + '/%ZZ')).status, 400)
  const state = await fetch(url + '/api/office-state?poll=1')
  assert.equal(state.status, 200)
  const body = await state.text()
  assert.equal(JSON.parse(body).mode, 'demo')
  assert.ok(!body.includes(secret))
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
    const response = await fetch(url + '/api/office-state', { method })
    assert.equal(response.status, 405)
    assert.equal(response.headers.get('allow'), 'GET')
  }
  assert.equal((await fetch(url + '/health', { method: 'POST' })).status, 405)
})

test('real HTTP upstream stays read-only, sanitizes tasks, survives outage and recovers', async t => {
  const ids = { orchestrator: 'agent-o', developer: 'agent-d', 'browser-qa': 'agent-q', reviewer: 'agent-r' }
  let broken = false
  const requests: string[] = []
  const upstream = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    assert.equal(req.headers.authorization, 'Bearer private-test-token')
    res.setHeader('Content-Type', 'application/json')
    if (broken) { res.writeHead(500); res.end('{"secret":"private-test-token"}'); return }
    res.end(JSON.stringify(req.url?.includes('/agents') ? Object.values(ids).map(id => ({ id, status: id === ids.developer ? 'running' : 'active', private: 'private-test-token' })) : [
      { id: 'parent', assigneeAgentId: ids.orchestrator },
      { id: 'child', parentId: 'parent', assigneeAgentId: ids.developer, identifier: 'DEV-1', title: '  Safe\n title  ', secret: 'private-test-token' },
    ]))
  })
  const upstreamUrl = await listen(upstream)
  t.after(() => close(upstream))
  const server = await createOfficeServer({ PAPERCLIP_API_URL: upstreamUrl, PAPERCLIP_API_KEY: 'private-test-token', PAPERCLIP_COMPANY_ID: 'test-company', PAPERCLIP_AGENT_ROLES: JSON.stringify(ids) })
  const url = await listen(server)
  t.after(() => close(server))
  const state = await (await fetch(url + '/api/office-state')).json()
  assert.equal(state.snapshot.developer, 'working')
  assert.deepEqual(state.tasks, [{ taskId: 'DEV-1', title: 'Safe title' }])
  assert.ok(!JSON.stringify(state).includes('private-test-token'))
  assert.deepEqual(requests, ['GET /api/companies/test-company/agents', 'GET /api/companies/test-company/issues?limit=1000'])
  broken = true
  const failure = await fetch(url + '/api/office-state')
  assert.equal(failure.status, 503)
  assert.deepEqual(await failure.json(), { error: 'Office state unavailable' })
  assert.deepEqual(await (await fetch(url + '/health')).json(), { status: 'ok' })
  broken = false
  assert.equal((await fetch(url + '/api/office-state')).status, 200)
  await close(upstream)
  assert.equal((await fetch(url + '/api/office-state')).status, 503)
  assert.equal((await fetch(url + '/health')).status, 200)
})

test('outside-root index symlink and non-file index reject before server readiness', async t => {
  const directory = await mkdtemp(join(process.env.PAPERCLIP_RUN_SCRATCH_DIR || tmpdir(), 'office-index-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const root = join(directory, 'dist')
  await mkdir(root)
  const outside = join(directory, 'private.html')
  await writeFile(outside, 'outside-root content')
  const index = join(root, 'index.html')
  await symlink(outside, index)
  // Construction must reject before callers can listen or report /health readiness.
  await assert.rejects(createOfficeServer({ OFFICE_MODE: 'demo' }, root), /Frontend index must be a regular file within dist/)
  await rm(index)
  await mkdir(index)
  await assert.rejects(createOfficeServer({ OFFICE_MODE: 'demo' }, root), /Frontend index must be a regular file within dist/)
})

test('missing config does not prevent readiness; static symlinks cannot expose files outside dist', async t => {
  const directory = await mkdtemp(join(process.env.PAPERCLIP_RUN_SCRATCH_DIR || tmpdir(), 'office-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await assert.rejects(createOfficeServer({}, directory))
  await writeFile(join(directory, 'index.html'), 'app')
  await symlink(join(process.cwd(), 'package.json'), join(directory, 'outside.json'))
  const server = await createOfficeServer({}, directory)
  const url = await listen(server)
  t.after(() => close(server))
  assert.equal((await fetch(url + '/api/office-state')).status, 503)
  assert.equal((await fetch(url + '/health')).status, 200)
  assert.equal((await fetch(url + '/outside.json')).status, 404)
})

for (const signal of ['SIGTERM', 'SIGINT'] as const) test(`production CLI starts and exits cleanly on ${signal}`, async t => {
  const reservation = createServer()
  const url = await listen(reservation)
  await close(reservation)
  const env = { ...process.env, PORT: new URL(url).port, OFFICE_MODE: 'demo' }
  delete env.HOST
  const child = spawn(process.execPath, ['server/index.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL') })
  const exited = once(child, 'exit')
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { clearInterval(poll); reject(new Error('Startup timed out')) }, 5000)
    const poll = setInterval(() => { if (output.includes('Listening')) { clearTimeout(timeout); clearInterval(poll); resolve() } }, 20)
  })
  assert.ok(output.includes(`Listening on ${url}`))
  assert.equal((await fetch(url + '/health')).status, 200)
  child.kill(signal)
  assert.deepEqual(await exited, [0, null])
  await assert.rejects(fetch(url + '/health'))
})
