import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { avatarMiddleware } from '../server/avatars.ts'

test('native avatar bridge validates routes, caches PNGs and never forwards credentials', async t => {
  const calls: string[] = []
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
  let broken = true
  const middleware = avatarMiddleware({ PAPERCLIP_API_URL: 'http://paperclip.example', PAPERCLIP_API_KEY: 'secret' }, (async (url, init) => {
    calls.push(String(url))
    assert.equal(init?.headers, undefined)
    assert.equal(init?.redirect, 'error')
    return broken ? new Response('down', { status: 503 }) : new Response(png, { headers: { 'Content-Type': 'image/png' } })
  }) as typeof fetch)
  const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end() }) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const path = '/api/office-avatar/cap-v1/orchid-peach.png'
  for (const invalid of ['/api/office-avatar/cap-v2/orchid-peach.png', '/api/office-avatar/cap-v1/unknown.png', '/api/office-avatar/https://evil.test/a.png']) assert.equal((await fetch(base + invalid)).status, 404)
  assert.equal((await fetch(base + path, { method: 'POST' })).status, 405)
  assert.equal(calls.length, 0)
  assert.equal((await fetch(base + path)).status, 503)
  broken = false
  const response = await fetch(base + path)
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
  assert.equal((await fetch(base + path)).status, 200)
  assert.equal(calls.length, 2)
  assert.equal(calls[1], 'http://paperclip.example/api/agent-avatars/cap-v1/orchid-peach/rest.png?size=64&scale=1')
})
