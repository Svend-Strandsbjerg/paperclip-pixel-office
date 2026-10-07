import { expect, test } from '@playwright/test'

const roles = ['Orchestrator', 'Developer', 'Browser QA', 'Reviewer']
test('production office renders four stable roles and demonstrates every state', async ({ page }) => {
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4288/')) external.push(request.url()) })
  await page.goto('/')
  await expect(page.locator('.desk-label')).toHaveCount(4)
  await expect(page.locator('.roster li')).toHaveCount(4)
  for (const role of roles) await expect(page.locator('.desk-label').getByText(role, { exact: true })).toBeVisible()
  await expect(page.locator('#activity-summary')).toHaveText('2 working · 2 idle')
  await expect(page.locator('.desk-label[data-activity="working"]')).toHaveCount(2)
  const placement = () => page.locator('.desk-label').evaluateAll(nodes => nodes.map(node => ({
    role: (node as HTMLElement).dataset.role, left: (node as HTMLElement).style.left, top: (node as HTMLElement).style.top,
  })))
  const before = await placement()
  await page.getByRole('button', { name: 'All idle', exact: true }).click()
  await expect(page.locator('.desk-label[data-activity="idle"]')).toHaveCount(4)
  await expect(page.locator('#activity-summary')).toHaveText('0 working · 4 idle')
  await page.waitForTimeout(100)
  const idle = await page.locator('canvas').screenshot()
  await page.getByRole('button', { name: 'All working', exact: true }).click()
  await expect(page.locator('.desk-label[data-activity="working"]')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'All working', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(100)
  expect(await page.locator('canvas').screenshot()).not.toEqual(idle)
  expect(await placement()).toEqual(before)
  await page.reload()
  expect(await placement()).toEqual(before)
  await expect(page.locator('#activity-summary')).toHaveText('2 working · 2 idle')
  await page.screenshot({ path: 'test-results/office-desktop.png', fullPage: true })
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('mobile labels fit, controls are keyboard accessible, reduced motion retains states', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  for (const role of roles) await expect(page.locator('.desk-label').getByText(role, { exact: true })).toBeVisible()
  const scene = (await page.locator('.scene').boundingBox())!
  for (const label of await page.locator('.desk-label').all()) {
    const box = (await label.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(scene.x)
    expect(box.x + box.width).toBeLessThanOrEqual(scene.x + scene.width)
  }
  const button = page.getByRole('button', { name: 'All working', exact: true })
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#activity-summary')).toHaveText('4 working · 0 idle')
  await page.waitForTimeout(100)
  const first = await page.locator('canvas').screenshot()
  await page.waitForTimeout(350)
  expect(await page.locator('canvas').screenshot()).toEqual(first)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/office-mobile.png', fullPage: true })
})

test('live polls without reload, preserves state on failure and recovers', async ({ page }) => {
  let count = 0
  await page.route('**/api/office-state', async route => {
    count++
    if (count === 3) return route.fulfill({ status: 503, json: { error: 'Office state unavailable' } })
    await route.fulfill({ json: { mode: 'live', snapshot: {
      orchestrator: 'idle', developer: count === 2 || count === 3 ? 'working' : 'idle', 'browser-qa': 'idle', reviewer: 'idle',
    } } })
  })
  await page.goto('/')
  await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
  await expect(page.getByRole('button', { name: 'All working', exact: true })).toBeHidden()
  await expect(page.locator('.desk-label[data-role="developer"]')).toHaveAttribute('data-activity', 'working')
  await expect(page.locator('.source')).toHaveText('DISCONNECTED')
  await expect(page.locator('.desk-label[data-role="developer"]')).toHaveAttribute('data-activity', 'working')
  await expect(page.locator('.demo-note')).toContainText('last received')
  await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
  await expect(page.locator('.desk-label[data-role="developer"]')).toHaveAttribute('data-activity', 'idle')
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1)
})

test('initial disconnect never shows demo activity and later connects', async ({ page }) => {
  let count = 0
  await page.route('**/api/office-state', route => {
    count++
    return route.fulfill(count === 1 ? { status: 503, json: { error: 'Office state unavailable' } } : { json: { mode: 'live', snapshot: { orchestrator: 'idle', developer: 'working', 'browser-qa': 'idle', reviewer: 'idle' } } })
  })
  await page.goto('/')
  await expect(page.locator('.source')).toHaveText('DISCONNECTED')
  await expect(page.locator('.desk-label[data-activity="working"]')).toHaveCount(0)
  await expect(page.locator('#activity-summary')).toHaveText('Activity unavailable')
  await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
  await expect(page.locator('.desk-label[data-activity="working"]')).toHaveCount(1)
})

test('demo handoff uses outbound, readable bubble and return without changing activity', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
  await page.getByRole('button', { name: 'All idle', exact: true }).click()
  await page.getByRole('button', { name: 'Demo handoff', exact: true }).click()
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'outbound')
  await expect(page.locator('.task-bubble')).toHaveText('DEMO-1 — Build the next office feature')
  await expect(page.locator('.task-bubble')).toBeVisible({ timeout: 6000 })
  await expect(page.locator('.desk-label[data-role="developer"]')).toHaveAttribute('data-activity', 'idle')
  const bubbleBox = (await page.locator('.task-bubble').boundingBox())!
  const developerLabel = (await page.locator('.desk-label[data-role="developer"]').boundingBox())!
  expect(bubbleBox.y + bubbleBox.height).toBeLessThanOrEqual(developerLabel.y)
  await page.screenshot({ path: 'test-results/handoff-bubble.png', fullPage: true })
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'returning', { timeout: 5000 })
  await expect(page.locator('.task-bubble')).toBeHidden()
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest', { timeout: 6000 })
})

test('live hydration stays quiet; new delegation animates once; reload and failed issue reads stay quiet', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('requestfailed', request => errors.push(request.url()))
  const old = { taskId: 'DEV-1', title: 'Historical task' }
  const task = { taskId: 'DEV-36', title: '<script>Bounded task text</script>' }
  let tasks: typeof old[] | null = [old]
  await page.route('**/api/office-state', route => route.fulfill({ json: { mode: 'live', snapshot: { orchestrator: 'working', developer: 'idle', 'browser-qa': 'idle', reviewer: 'idle' }, tasks } }))
  await page.goto('/')
  await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
  await expect(page.getByRole('button', { name: 'Demo handoff', exact: true })).toBeHidden()
  await page.waitForTimeout(1700)
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
  tasks = [old, task]
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'outbound')
  await expect(page.locator('.task-bubble')).toBeVisible({ timeout: 6000 })
  await expect(page.locator('.task-bubble')).toHaveText('DEV-36 — <script>Bounded task text</script>')
  await expect(page.locator('.desk-label[data-role="developer"]')).toHaveAttribute('data-activity', 'idle')
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'returning', { timeout: 5000 })
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest', { timeout: 6000 })
  await page.waitForTimeout(1700)
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
  await page.reload()
  await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
  tasks = null
  await page.waitForTimeout(1700)
  tasks = [old, task, { taskId: 'DEV-37', title: 'During outage' }]
  await page.waitForTimeout(1700)
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
  expect(errors).toEqual([])
})
