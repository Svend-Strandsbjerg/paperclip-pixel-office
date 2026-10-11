import { expect, test } from '@playwright/test'

test('dynamic polling preserves specialist handoffs on a narrow reduced-motion office', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const specialists = ['orchestrator', 'developer', 'browser-qa', 'reviewer']
  const agent = (id: string, specialist?: string) => ({ id, name: specialist ?? 'A very long generic agent name '.repeat(3), role: 'general', title: 'Research colleague', status: 'running', activity: 'working', specialist })
  let agents = specialists.map(s => agent(`uuid-${s}`, s))
  let tasks: { taskId: string; title: string }[] = []
  await page.route('**/api/office-state', route => route.fulfill({ json: { mode: 'live', snapshot: {}, agents, tasks } }))
  await page.route('**/api/office-avatar/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="pink"/></svg>' }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.roster li')).toHaveCount(4)
  await page.locator('canvas').screenshot({ path: 'test-results/refresh-small.png' })
  const firstArt = await page.locator('canvas').screenshot()
  await page.reload()
  await expect(page.locator('.roster li')).toHaveCount(4)
  expect(await page.locator('canvas').screenshot()).toEqual(firstArt)
  const initialHeight = await page.locator('canvas').getAttribute('height')
  agents = [...agents, agent('generic')]
  await expect(page.locator('.roster li')).toHaveCount(5)
  await expect(page.locator('#activity-summary')).toHaveText('5 working · 0 idle')
  expect(Number(await page.locator('canvas').getAttribute('height'))).toBe(Number(initialHeight))
  agents = agents.map(a => a.id === 'generic' ? { ...a, name: 'Renamed colleague', appearance: { schemaVersion: 1, characterVersion: 'cap-v1', paletteId: 'orchid-peach' }, avatarUrl: '/api/agent-avatars/cap-v1/orchid-peach/rest.png?size=512&scale=1' } : a).reverse()
  await expect(page.locator('.roster [data-agent-id="generic"] h3')).toHaveText('Renamed colleague')
  await expect(page.locator('.roster [data-agent-id="generic"] img')).toHaveAttribute('src', '/api/office-avatar/cap-v1/orchid-peach.png')
  tasks = [{ taskId: 'DEV-999', title: 'Specialist handoff still works' }]
  await expect(page.locator('.task-bubble')).toContainText('DEV-999')
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'bubble')
  await expect(page.locator('.pipeline-panel')).toHaveCount(0)
  agents = [...agents, ...Array.from({ length: 35 }, (_, i) => agent(`generic-${i}`))]
  await expect(page.locator('.roster li')).toHaveCount(40)
  expect(Number(await page.locator('canvas').getAttribute('height'))).toBeGreaterThan(Number(initialHeight))
  expect(await page.locator('canvas').evaluate(c => c.getBoundingClientRect().width)).toBe(736)
  const scene = (await page.locator('.scene').boundingBox())!
  for (const label of await page.locator('.desk-label').all()) {
    const box = (await label.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(scene.x)
    expect(box.x + box.width).toBeLessThanOrEqual(scene.x + scene.width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  agents = agents.filter(a => a.id !== 'generic')
  await expect(page.locator('.roster li')).toHaveCount(39)
  await expect(page.locator('.desk-label[data-agent-id="generic"]')).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 1000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await page.locator('canvas').screenshot({ path: 'test-results/refresh-large.png' })
  expect(errors).toEqual([])
})

for (const width of [1440, 390]) test(`Studio owns the workspace at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/')
  await expect(page.locator('.roster li')).toHaveCount(4)
  await expect(page.getByRole('region', { name: 'Delivery pipeline overview' })).toHaveCount(0)
  await expect(page.locator('.pipeline-panel, .delivery-card, .gate, .pipeline-avatar')).toHaveCount(0)
  const studio = (await page.locator('.office-panel').boundingBox())!
  const workspace = (await page.locator('.workspace').boundingBox())!
  const team = (await page.locator('.team-panel').boundingBox())!
  expect(studio.width).toBe(workspace.width)
  expect(team.y).toBeGreaterThanOrEqual(studio.y + studio.height)
  const canvas = (await page.locator('canvas').boundingBox())!
  if (width === 1440) {
    expect(canvas.width).toBe(await page.locator('.scene-viewport').evaluate(el => el.clientWidth))
    expect(canvas.height).toBeGreaterThan(650)
  } else {
    expect(canvas.width).toBe(736)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
})

for (const reducedMotion of ['reduce', 'no-preference'] as const) test(`Studio preserves outbound and lifecycle return handoffs with ${reducedMotion}`, async ({ page }) => {
  test.setTimeout(45000)
  await page.emulateMedia({ reducedMotion })
  const specialists = ['orchestrator', 'developer', 'browser-qa', 'reviewer']
  const agents = specialists.map(specialist => ({ id: specialist, name: specialist, role: specialist, specialist, status: 'running', activity: 'working' }))
  let assigned = false
  let done = false
  await page.route('**/api/office-state', route => route.fulfill({ json: {
    mode: 'live', snapshot: {}, agents,
    tasks: assigned ? [{ taskId: 'DEV-999', title: 'Build the Studio' }] : [],
    completions: [{ taskId: 'DEV-999', title: 'Build the Studio', agentId: 'developer', status: done ? 'done' : 'open' }],
  } }))
  await page.goto('/')
  await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
  const canvas = page.locator('canvas')
  assigned = true
  await expect(canvas).toHaveAttribute('data-target', 'developer')
  if (reducedMotion === 'no-preference') await expect(canvas).toHaveAttribute('data-handoff', 'outbound')
  await expect(page.locator('.task-bubble')).toContainText('DEV-999', { timeout: 7000 })
  await expect(canvas).toHaveAttribute('data-handoff', 'rest', { timeout: 15000 })
  done = true
  await expect(canvas).toHaveAttribute('data-target', 'orchestrator')
  if (reducedMotion === 'no-preference') await expect(canvas).toHaveAttribute('data-handoff', 'outbound')
  await expect(page.locator('.task-bubble')).toContainText('DEV-999', { timeout: 7000 })
  await expect(canvas).toHaveAttribute('data-handoff', 'rest', { timeout: 15000 })
  await expect(page.locator('.roster [data-activity="working"]')).toHaveCount(4)
  await expect(page.locator('.pipeline-panel')).toHaveCount(0)
})
