import { expect, test } from '@playwright/test'
import { demoDeliveries } from '../../src/pipeline'

test('dynamic polling preserves specialist handoffs and pipeline on a narrow reduced-motion office', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const specialists = ['orchestrator', 'developer', 'browser-qa', 'reviewer']
  const agent = (id: string, specialist?: string) => ({ id, name: specialist ?? 'A very long generic agent name '.repeat(3), role: 'general', title: 'Research colleague', status: 'running', activity: 'working', specialist })
  let agents = specialists.map(s => agent(`uuid-${s}`, s))
  let tasks: { taskId: string; title: string }[] = []
  await page.route('**/api/office-state', route => route.fulfill({ json: { mode: 'live', snapshot: {}, agents, tasks, deliveries: demoDeliveries } }))
  await page.route('**/api/office-avatar/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="pink"/></svg>' }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.roster li')).toHaveCount(4)
  const initialHeight = await page.locator('canvas').getAttribute('height')
  agents = [...agents, agent('generic')]
  await expect(page.locator('.roster li')).toHaveCount(5)
  await expect(page.locator('#activity-summary')).toHaveText('5 working · 0 idle')
  expect(Number(await page.locator('canvas').getAttribute('height'))).toBeGreaterThan(Number(initialHeight))
  agents = agents.map(a => a.id === 'generic' ? { ...a, name: 'Renamed colleague', appearance: { schemaVersion: 1, characterVersion: 'cap-v1', paletteId: 'orchid-peach' }, avatarUrl: '/api/agent-avatars/cap-v1/orchid-peach/rest.png?size=512&scale=1' } : a).reverse()
  await expect(page.locator('.roster [data-agent-id="generic"] h3')).toHaveText('Renamed colleague')
  await expect(page.locator('.roster [data-agent-id="generic"] img')).toHaveAttribute('src', '/api/office-avatar/cap-v1/orchid-peach.png')
  tasks = [{ taskId: 'DEV-999', title: 'Specialist handoff still works' }]
  await expect(page.locator('.task-bubble')).toContainText('DEV-999')
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'bubble')
  await expect(page.locator('.pipeline-panel')).toContainText('Ready for human merge')
  agents = [...agents, ...Array.from({ length: 35 }, (_, i) => agent(`generic-${i}`))]
  await expect(page.locator('.roster li')).toHaveCount(40)
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
  expect(errors).toEqual([])
})
