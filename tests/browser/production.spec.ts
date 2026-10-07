import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'

test('production start bridges live HTTP reads, handoff, outage/recovery and reload without leaking credentials', async ({ page }) => {
  test.setTimeout(60000)
  const ids = { orchestrator: 'private-orchestrator', developer: 'private-developer', 'browser-qa': 'private-qa', reviewer: 'private-reviewer' }
  const secret = 'production-browser-test-secret'
  let broken = false
  let delegated = false
  const upstreamMethods: string[] = []
  const upstream = createServer((req, res) => {
    upstreamMethods.push(req.method!)
    res.setHeader('Content-Type', 'application/json')
    if (req.headers.authorization !== `Bearer ${secret}`) { res.writeHead(401); res.end('{}'); return }
    if (broken) { res.writeHead(503); res.end(JSON.stringify({ private: secret })); return }
    res.end(JSON.stringify(req.url?.includes('/agents') ? Object.values(ids).map(id => ({ id, status: id === ids.developer ? 'running' : 'active', secret })) : [
      { id: 'private-parent', assigneeAgentId: ids.orchestrator },
      ...(delegated ? [{ id: 'private-child', parentId: 'private-parent', assigneeAgentId: ids.developer, identifier: 'DEV-123', title: 'Production handoff', secret }] : []),
    ]))
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const upstreamPort = (upstream.address() as { port: number }).port
  const reservation = createServer().listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = (reservation.address() as { port: number }).port
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const child = spawn('npm', ['run', 'start'], { detached: true, stdio: 'pipe', env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(port), OFFICE_MODE: 'live',
    PAPERCLIP_API_URL: `http://127.0.0.1:${upstreamPort}`, PAPERCLIP_COMPANY_ID: 'fixture-company',
    PAPERCLIP_API_KEY: secret, PAPERCLIP_AGENT_ROLES: JSON.stringify(ids),
  } })
  const exited = once(child, 'exit')
  const base = `http://127.0.0.1:${port}`
  const errors: string[] = []
  const unexpectedRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('503')) errors.push(message.text()) })
  page.on('requestfailed', request => errors.push(request.url()))
  page.on('request', request => { if (!request.url().startsWith(base + '/')) unexpectedRequests.push(request.url()) })
  try {
    await expect.poll(async () => { try { return (await fetch(base + '/health')).status } catch { return 0 } }).toBe(200)
    expect(await (await fetch(base + '/health')).json()).toEqual({ status: 'ok' })
    await page.goto(base + '/office/live')
    await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
    await expect(page.locator('.desk-label[data-role="developer"]')).toHaveAttribute('data-activity', 'working')
    await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
    delegated = true
    await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'outbound')
    await expect(page.locator('.task-bubble')).toBeVisible({ timeout: 6000 })
    await expect(page.locator('.task-bubble')).toHaveText('DEV-123 — Production handoff')
    await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'returning', { timeout: 5000 })
    await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest', { timeout: 6000 })
    await page.reload()
    await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
    await page.waitForTimeout(1700)
    await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
    broken = true
    await expect(page.locator('.source')).toHaveText('DISCONNECTED')
    expect(await (await fetch(base + '/health')).json()).toEqual({ status: 'ok' })
    await expect(page.locator('.desk-label[data-role="developer"]')).toHaveAttribute('data-activity', 'working')
    broken = false
    await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
    await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
    expect(upstreamMethods.length).toBeGreaterThan(4)
    expect(new Set(upstreamMethods)).toEqual(new Set(['GET']))
    // Read current browser resources explicitly: response.body() promises retained
    // across reload can remain pending for resources replaced by navigation.
    const bodies = await page.evaluate(async () => {
      const urls = new Set([location.href, '/api/office-state',
        ...Array.from(document.scripts, script => script.src).filter(Boolean),
        ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet]'), link => link.href),
      ])
      return Promise.all(Array.from(urls, async url => (await fetch(url)).text()))
    })
    for (const body of bodies) {
      expect(body).not.toContain(secret)
      for (const id of Object.values(ids)) expect(body).not.toContain(id)
    }
    await page.screenshot({ path: 'test-results/production-live.png', fullPage: true })
    expect(errors).toEqual([])
    expect(unexpectedRequests).toEqual([])
  } finally {
    await page.close()
    if (child.exitCode === null) process.kill(-child.pid!, 'SIGTERM')
    await exited
    await new Promise<void>(resolve => upstream.close(() => resolve()))
  }
})
