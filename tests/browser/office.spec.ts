import { expect, test, type Locator } from '@playwright/test'

const roles = ['Orchestrator', 'Developer', 'Browser QA', 'Reviewer']
test('production office renders four stable roles and demonstrates every state', async ({ page, baseURL }) => {
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => { if (!request.url().startsWith(`${baseURL}/`)) external.push(request.url()) })
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
  // Identical textContent assignments still replace text nodes and retrigger a live region.
  const textMutations = await page.locator('.task-bubble').evaluate(async bubble => {
    let count = 0
    const observer = new MutationObserver(records => { count += records.length })
    observer.observe(bubble, { childList: true, characterData: true, subtree: true, attributes: true })
    observer.observe(document.querySelector('canvas')!, { attributes: true, attributeFilter: ['data-handoff'] })
    await new Promise<void>(resolve => {
      let frames = 0
      const tick = () => { if (++frames === 30) resolve(); else requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    count += observer.takeRecords().length
    observer.disconnect()
    return count
  })
  expect(textMutations).toBe(0)
  await expect(page.locator('.task-bubble')).toBeVisible()
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

// Reduced-motion assignments keep every ghost at rest and add a document beside
// the orchestrator (scene 104, 148; native device pixel ratio). Mask that document and
// only the two participants’ decorative effect regions; all avatar pixels and
// nonparticipant effects must remain identical.
async function reducedMotionFrame(canvas: Locator) {
  return canvas.evaluate((node: HTMLCanvasElement) => {
    const copy = document.createElement('canvas')
    copy.width = node.width; copy.height = node.height
    const context = copy.getContext('2d')!
    context.drawImage(node, 0, 0)
    const scale = node.width / 640
    const colorAt = (x: number, y: number) => Array.from(context.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data)
    const documentColors = [colorAt(112, 130), colorAt(113, 131), colorAt(114, 134)]
    context.clearRect(112 * scale, 130 * scale, 8 * scale, 10 * scale)
    for (const x of [104, 312]) context.clearRect((x + 20) * scale, (148 - 34) * scale, 48 * scale, 24 * scale)
    return { pixels: node.toDataURL(), withoutDocument: copy.toDataURL(), documentColors }
  })
}

async function expectStaticDelivery(canvas: Locator, before: Awaited<ReturnType<typeof reducedMotionFrame>>) {
  await expect(canvas).toHaveAttribute('data-handoff', 'bubble')
  const during = await reducedMotionFrame(canvas)
  expect(during.pixels).not.toBe(before.pixels)
  expect(during.withoutDocument).toBe(before.withoutDocument)
  // Visible document border, paper, and text line, not just an arbitrary change.
  expect(during.documentColors).toEqual([
    [89, 101, 117, 255], [255, 244, 214, 255], [135, 148, 160, 255],
  ])
  for (let frame = 0; frame < 5; frame++) {
    await canvas.page().waitForTimeout(300)
    await expect(canvas).toHaveAttribute('data-handoff', 'bubble')
    expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(during.pixels)
  }
}

test('reduced-motion handoff shows task text and a static document with stationary ghosts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-handoff', 'rest')
  const pixels = () => canvas.evaluate(node => node.toDataURL())
  const before = await reducedMotionFrame(canvas)
  await page.getByRole('button', { name: 'Demo handoff', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-handoff', 'bubble')
  await expect(page.locator('.task-bubble')).toBeVisible()
  await expect(page.locator('.task-bubble')).toContainText('DEMO-1')
  await expectStaticDelivery(canvas, before)
  await expect(canvas).toHaveAttribute('data-handoff', 'rest')
  expect(await pixels()).toBe(before.pixels)
})

test('live burst is bounded and discarded tasks never replay on subsequent polls', async ({ page }) => {
  let tasks: { taskId: string; title: string }[] = []
  await page.route('**/api/office-state', route => route.fulfill({ json: { mode: 'live', snapshot: { orchestrator: 'idle', developer: 'idle', 'browser-qa': 'idle', reviewer: 'idle' }, tasks } }))
  await page.goto('/')
  await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
  tasks = Array.from({ length: 5 }, (_, i) => ({ taskId: `DEV-${i + 1}`, title: `Task ${i + 1}` }))
  const bubble = page.locator('.task-bubble')
  await expect(bubble).toHaveText('DEV-4 — Task 4')
  await expect(bubble).toBeVisible({ timeout: 6000 })
  await expect(bubble).toHaveText('DEV-5 — Task 5', { timeout: 10000 })
  await expect(bubble).toBeVisible({ timeout: 6000 })
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest', { timeout: 10000 })
  await page.waitForTimeout(1700)
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
})

test('hidden polling drops handoffs; a long frame gap expires active and waiting work', async ({ page }) => {
  let tasks: { taskId: string; title: string }[] = []
  let polls = 0
  await page.route('**/api/office-state', route => {
    polls++
    return route.fulfill({ json: { mode: 'live', snapshot: { orchestrator: 'idle', developer: 'idle', 'browser-qa': 'idle', reviewer: 'idle' }, tasks } })
  })
  await page.goto('/')
  await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
  tasks = [{ taskId: 'DEV-1', title: 'Before hiding' }, { taskId: 'DEV-2', title: 'Waiting' }]
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'outbound')
  // Headless Chromium does not reliably hide tabs. Exercise the real visibility
  // listener using a controlled visibility getter while network polling continues.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  tasks.push({ taskId: 'DEV-3', title: 'While hidden' })
  const before = polls
  await expect.poll(() => polls).toBeGreaterThan(before)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(1700)
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
  await expect(page.locator('.task-bubble')).toBeHidden()
  tasks.push({ taskId: 'DEV-4', title: 'Fresh after return' }, { taskId: 'DEV-5', title: 'Pending before suspension' })
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'outbound')
  // Advance the monotonic clock independently of animation dt, as with a
  // suspended frame loop; both the active and waiting events must expire.
  await page.evaluate(() => {
    const now = performance.now.bind(performance)
    performance.now = () => now() + 60000
  })
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
  await page.waitForTimeout(1700)
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
})

// Demo ghosts use the neutral #c6ced4 artwork. Read actual canvas pixels at
// the orchestrator's workstation (scene 104, 148; native device pixel ratio), not desk labels
// that remain stationary during travel. Hover may move the body vertically by 6px.
async function orchestratorBounds(canvas: Locator) {
  return canvas.evaluate((el: HTMLCanvasElement) => {
    const scale = el.width / 640
    const left = Math.round(88 * scale), top = Math.round(120 * scale)
    const width = Math.round(32 * scale), height = Math.round(36 * scale)
    const { data } = el.getContext('2d')!.getImageData(left, top, width, height)
    const xs: number[] = [], ys: number[] = []
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i] === 198 && data[i + 1] === 206 && data[i + 2] === 212) {
        xs.push((x + left) / scale); ys.push((y + top) / scale)
      }
    }
    return xs.length ? { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), pixels: xs.length / (scale * scale) } : null
  })
}

async function expectOrchestratorAtDesk(canvas: Locator) {
  // Rest ends travel before directional facing finishes easing back to front.
  // Wait for settled horizontal bounds without waiting for hover to stop.
  await expect.poll(async () => {
    const bounds = await orchestratorBounds(canvas)
    return !!bounds && Math.abs(bounds.left - 95) <= 2 && Math.abs(bounds.right - 112) <= 2
  }, { timeout: 3000 }).toBe(true)
  // Sample several frames so a transient pass through the workstation is not
  // enough. The tight horizontal bounds also require the facing to settle.
  for (let frame = 0; frame < 3; frame++) {
    await expect(canvas).toHaveAttribute('data-handoff', 'rest')
    const bounds = await orchestratorBounds(canvas)
    expect(bounds).not.toBeNull()
    expect(bounds!.pixels).toBeGreaterThan(180)
    expect(Math.abs(bounds!.left - 95)).toBeLessThanOrEqual(2)
    expect(Math.abs(bounds!.right - 112)).toBeLessThanOrEqual(2)
    expect(Math.abs(bounds!.top - 128)).toBeLessThanOrEqual(7)
    expect(Math.abs(bounds!.bottom - 147)).toBeLessThanOrEqual(7)
    await canvas.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
  }
}

for (const reducedMotion of [false, true]) test(`demo QA handoff is bounded on mobile, reduced motion ${reducedMotion}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  await page.goto('/')
  await expect(page.locator('.source')).toHaveText('LOCAL DEMO')
  await page.getByRole('button', { name: 'All idle', exact: true }).click()
  const canvas = page.locator('canvas')
  const before = await reducedMotionFrame(canvas)
  await page.getByRole('button', { name: 'Demo QA handoff', exact: true }).click()
  if (!reducedMotion) await expect(canvas).toHaveAttribute('data-handoff', 'outbound')
  await expect(page.locator('.task-bubble')).toBeVisible({ timeout: 6000 })
  await expect(page.locator('.task-bubble')).toHaveText('QA DEMO-2 @ abc1234 — Test the implementation')
  const bubble = (await page.locator('.task-bubble').boundingBox())!
  const label = (await page.locator('.desk-label[data-role="browser-qa"]').boundingBox())!
  expect(bubble.y + bubble.height).toBeLessThanOrEqual(label.y)
  expect(bubble.x).toBeGreaterThanOrEqual(0)
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(390)
  await expect(page.locator('.desk-label[data-role="browser-qa"]')).toHaveAttribute('data-activity', 'idle')
  const during = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())
  if (reducedMotion) await expectStaticDelivery(canvas, before)
  else {
    expect(during).not.toBe(before.pixels)
    expect(await orchestratorBounds(canvas)).toBeNull()
  }
  await page.screenshot({ path: `test-results/qa-mobile-${reducedMotion}.png`, fullPage: true })
  await expect(canvas).toHaveAttribute('data-handoff', 'rest', { timeout: 9000 })
  if (reducedMotion) expect(await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(before.pixels)
  else await expectOrchestratorAtDesk(canvas)
})

for (const reducedMotion of [false, true]) test(`demo Reviewer handoff is bounded on mobile, reduced motion ${reducedMotion}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  await page.goto('/')
  await expect(page.locator('.source')).toHaveText('LOCAL DEMO')
  await page.getByRole('button', { name: 'All idle', exact: true }).click()
  const canvas = page.locator('canvas')
  const before = await reducedMotionFrame(canvas)
  await page.getByRole('button', { name: 'Demo Reviewer handoff', exact: true }).click()
  if (!reducedMotion) await expect(canvas).toHaveAttribute('data-handoff', 'outbound')
  await expect(page.locator('.task-bubble')).toBeVisible({ timeout: 6000 })
  await expect(page.locator('.task-bubble')).toHaveText('Review DEMO-3 @ abc1234 — Review the implementation')
  const bubble = (await page.locator('.task-bubble').boundingBox())!
  const label = (await page.locator('.desk-label[data-role="reviewer"]').boundingBox())!
  expect(bubble.y + bubble.height).toBeLessThanOrEqual(label.y)
  expect(bubble.x).toBeGreaterThanOrEqual(0)
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(390)
  await expect(page.locator('.desk-label[data-role="reviewer"]')).toHaveAttribute('data-activity', 'idle')
  const during = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())
  if (reducedMotion) await expectStaticDelivery(canvas, before)
  else {
    expect(during).not.toBe(before.pixels)
    expect(await orchestratorBounds(canvas)).toBeNull()
  }
  await page.screenshot({ path: `test-results/reviewer-mobile-${reducedMotion}.png`, fullPage: true })
  await expect(canvas).toHaveAttribute('data-handoff', 'rest', { timeout: 9000 })
  if (reducedMotion) expect(await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(before.pixels)
  else await expectOrchestratorAtDesk(canvas)
})

for (const width of [320, 390]) for (const target of ['browser-qa', 'developer', 'reviewer'] as const) {
  for (const reducedMotion of [false, true]) test(`${width}px long-title ${target} handoff keeps every desk readable, reduced motion ${reducedMotion}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
    const task = { taskId: 'DEV-124', title: 'W'.repeat(80), target, ...(reducedMotion && target !== 'developer' ? { sha: '0123456789abcdef0123456789abcdef01234567' } : {}) }
    let delegated = false
    await page.route('**/api/office-state', route => route.fulfill({ json: {
      mode: 'live', snapshot: { orchestrator: 'idle', developer: 'idle', 'browser-qa': 'idle', reviewer: 'idle' }, tasks: delegated ? [task] : [],
    } }))
    await page.goto('/')
    await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
    delegated = true
    const canvas = page.locator('canvas')
    if (!reducedMotion) await expect(canvas).toHaveAttribute('data-handoff', 'outbound')
    const bubble = page.locator('.task-bubble')
    await expect(bubble).toBeVisible({ timeout: 6000 })
    await expect(bubble).toContainText(task.title)
    const box = (await bubble.boundingBox())!
    const scene = (await page.locator('.scene-viewport').boundingBox())!
    expect(await bubble.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true)
    expect(box.x).toBeGreaterThanOrEqual(scene.x)
    expect(box.x + box.width).toBeLessThanOrEqual(scene.x + scene.width)
    for (const label of await page.locator('.desk-label').all()) {
      await expect(label).toBeVisible()
      const desk = (await label.boundingBox())!
      // Include the bubble's three-pixel shadow, not just its border box.
      expect(box.y + box.height + 3 <= desk.y || desk.y + desk.height <= box.y ||
        box.x + box.width <= desk.x || desk.x + desk.width <= box.x).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `test-results/long-title-${width}-${target}-${reducedMotion}.png`, fullPage: true })
    await expect(canvas).toHaveAttribute('data-handoff', 'rest', { timeout: 9000 })
    await expect(bubble).toBeHidden()
  })
}

test('demo rework uses the shared movement path and leaves live activity alone', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'All idle', exact: true }).click()
  await page.getByRole('button', { name: 'Demo Rework handoff', exact: true }).click()
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'outbound')
  await expect(page.locator('canvas')).toHaveAttribute('data-target', 'developer')
  await expect(page.locator('.task-bubble')).toBeVisible({ timeout: 6000 })
  await expect(page.locator('.task-bubble')).toHaveText('Rework DEMO-4 @ abc1234 — Address QA findings', { timeout: 6000 })
  await expect(page.locator('.desk-label[data-activity="idle"]')).toHaveCount(4)
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'returning', { timeout: 5000 })
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest', { timeout: 6000 })
})

for (const width of [390, 1440]) for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`work effects clear every label at ${width}px with ${reducedMotion}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion })
    let count = 4
    await page.route('**/api/office-state', route => route.fulfill({ json: {
      mode: 'live', snapshot: {}, tasks: [],
      agents: Array.from({ length: count }, (_, i) => ({ id: `worker-${i}`, name: `Working colleague ${i}`, role: 'general', status: 'running', activity: 'working' })),
    } }))
    await page.goto('/')
    for (const size of [4, 40]) {
      count = size
      await expect(page.locator('.desk-label')).toHaveCount(size)
      const overlaps = await page.evaluate(() => {
        const canvas = document.querySelector('canvas')!
        const box = canvas.getBoundingClientRect()
        const scale = box.width / 640
        const labels = Array.from(document.querySelectorAll<HTMLElement>('.desk-label'))
        const bounds = labels.map(label => label.getBoundingClientRect())
        // Label anchors expose the office placement. Activity profiles themselves
        // know only the avatar anchor and their fixed local drawing envelope.
        return labels.flatMap(label => {
          const x = box.x + parseFloat(label.style.left) / 100 * box.width
          const y = box.y + parseFloat(label.style.top) / 100 * box.height + 78 * scale
          const effect = { left: x + 20 * scale, right: x + 68 * scale, top: y - 34 * scale, bottom: y - 10 * scale }
          return bounds.filter(b => effect.left < b.right && effect.right > b.left && effect.top < b.bottom + 2 && effect.bottom > b.top)
            .map(() => label.dataset.agentId)
        })
      })
      expect(overlaps).toEqual([])
    }
  })
}
