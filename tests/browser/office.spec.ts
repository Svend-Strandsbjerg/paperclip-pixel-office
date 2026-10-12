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

// Reduced motion places a persistent card at the recipient while ghosts stay still.
async function reducedMotionFrame(canvas: Locator, target = 'developer') {
  return canvas.evaluate((node: HTMLCanvasElement, recipient: string) => {
    const copy = document.createElement('canvas')
    copy.width = node.width; copy.height = node.height
    const context = copy.getContext('2d')!
    context.drawImage(node, 0, 0)
    const scale = node.width / 640
    const x = recipient === 'browser-qa' ? 138 : 346
    const y = recipient === 'developer' ? 119 : 247
    // Round the mask outward and composite expected pixels over the scene to
    // include antialiased edges at fractional backing-buffer scales.
    const left = Math.floor(x * scale), top = Math.floor(y * scale)
    const width = Math.ceil((x + 16) * scale) - left, height = Math.ceil((y + 20) * scale) - top
    const documentPixels = Array.from(context.getImageData(left, top, width, height).data)
    context.fillStyle = '#596575'; context.fillRect(x * scale, y * scale, 16 * scale, 20 * scale)
    context.fillStyle = '#fff4d6'; context.fillRect((x + 1) * scale, (y + 1) * scale, 14 * scale, 18 * scale)
    context.fillStyle = '#d7aa66'; context.fillRect((x + 1) * scale, (y + 1) * scale, 14 * scale, 2 * scale)
    context.fillStyle = '#8794a0'; context.fillRect((x + 3) * scale, (y + 6) * scale, 9 * scale, scale)
    context.fillRect((x + 3) * scale, (y + 9) * scale, 7 * scale, scale)
    const expectedDocumentPixels = Array.from(context.getImageData(left, top, width, height).data)
    context.clearRect(left, top, width, height)
    return { pixels: node.toDataURL(), withoutDocument: copy.toDataURL(), documentPixels, expectedDocumentPixels, target: recipient }
  }, target)
}

for (const dpr of [1, 2, 3]) test.describe(`document raster mask at DPR ${dpr}`, () => {
  test.use({ deviceScaleFactor: dpr })
  test('covers fractional document edges while preserving adjacent ghost pixels', async ({ page }) => {
    for (const width of [736, 836, 864]) for (const ratio of [dpr, dpr * 0.757]) {
      await page.setContent(`<canvas width="${Math.floor(width * ratio)}" height="${Math.ceil(448 * width / 640 * ratio)}" style="width:${width}px"></canvas>`)
      const canvas = page.locator('canvas')
      await canvas.evaluate((node: HTMLCanvasElement) => {
        const ctx = node.getContext('2d')!
        ctx.fillStyle = '#456789'; ctx.fillRect(0, 0, node.width, node.height)
      })
      const before = await reducedMotionFrame(canvas)
      await canvas.evaluate((node: HTMLCanvasElement) => {
        const ctx = node.getContext('2d')!
        const scale = node.width / 640
        ctx.scale(scale / 3, scale / 3)
        ctx.fillStyle = '#596575'; ctx.fillRect(346 * 3, 119 * 3, 48, 60)
        ctx.fillStyle = '#fff4d6'; ctx.fillRect(347 * 3, 120 * 3, 42, 54)
        ctx.fillStyle = '#d7aa66'; ctx.fillRect(347 * 3, 120 * 3, 42, 6)
        ctx.fillStyle = '#8794a0'; ctx.fillRect(349 * 3, 125 * 3, 27, 3)
        ctx.fillRect(349 * 3, 128 * 3, 21, 3)
      })
      const during = await reducedMotionFrame(canvas)
      expect(during.pixels).not.toBe(before.pixels)
      expect(during.withoutDocument).toBe(before.withoutDocument)
      expect(during.documentPixels).toEqual(before.expectedDocumentPixels)
      // A changed ghost pixel immediately outside the mask must still fail.
      await canvas.evaluate((node: HTMLCanvasElement) => {
        const ctx = node.getContext('2d')!
        ctx.resetTransform()
        ctx.fillStyle = '#ff0000'
        ctx.fillRect(Math.floor(346 * node.width / 640) - 1, Math.floor(125 * node.width / 640), 1, 1)
      })
      expect((await reducedMotionFrame(canvas)).withoutDocument).not.toBe(before.withoutDocument)
    }
  })
})

async function expectStaticDelivery(canvas: Locator, before: Awaited<ReturnType<typeof reducedMotionFrame>>) {
  await expect(canvas).toHaveAttribute('data-handoff', 'bubble')
  const during = await reducedMotionFrame(canvas, before.target)
  expect(during.pixels).not.toBe(before.pixels)
  expect(during.withoutDocument).toBe(before.withoutDocument)
  // Visible document border, paper, and text line, not just an arbitrary change.
  expect(during.documentPixels).toEqual(before.expectedDocumentPixels)
  for (let frame = 0; frame < 5; frame++) {
    await canvas.page().waitForTimeout(300)
    await expect(canvas).toHaveAttribute('data-handoff', 'bubble')
    expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(during.pixels)
  }
  return during.pixels
}

test('reduced-motion handoff shows task text and a static document with stationary ghosts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-handoff', 'rest')
  await page.getByRole('button', { name: 'All idle', exact: true }).click()
  const pixels = () => canvas.evaluate(node => node.toDataURL())
  const before = await reducedMotionFrame(canvas)
  await page.getByRole('button', { name: 'Demo handoff', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-handoff', 'bubble')
  await expect(page.locator('.task-bubble')).toBeVisible()
  await expect(page.locator('.task-bubble')).toContainText('DEMO-1')
  const delivered = await expectStaticDelivery(canvas, before)
  await expect(canvas).toHaveAttribute('data-handoff', 'rest')
  expect(await pixels()).toBe(delivered)
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

// Demo ghosts use neutral #c6ced4 artwork with a subtle light/shade overlay.
// Identify its cool gray body (including shaded edges), excluding the warm floor
// and dark eyes. Read actual canvas pixels at
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
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (r >= 155 && r <= 225 && g - r >= 5 && b - g >= 4 && b - r <= 22) {
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
  const before = await reducedMotionFrame(canvas, 'browser-qa')
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
  if (reducedMotion) expect(await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(during)
  else await expectOrchestratorAtDesk(canvas)
})

for (const reducedMotion of [false, true]) test(`demo Reviewer handoff is bounded on mobile, reduced motion ${reducedMotion}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  await page.goto('/')
  await expect(page.locator('.source')).toHaveText('LOCAL DEMO')
  await page.getByRole('button', { name: 'All idle', exact: true }).click()
  const canvas = page.locator('canvas')
  const before = await reducedMotionFrame(canvas, 'reviewer')
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
  if (reducedMotion) expect(await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(during)
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

test('off-desk handoff and queued demo replay clear furniture without an origin jump', async ({ page }) => {
  await page.addInitScript(() => {
    let callback: FrameRequestCallback, time = 1
    let positions: number[][] = []
    const translate = CanvasRenderingContext2D.prototype.translate
    CanvasRenderingContext2D.prototype.translate = function (x, y) {
      if (this.canvas.getAttribute('role') === 'img') positions.push([x / 3, y / 3])
      translate.call(this, x, y)
    }
    window.requestAnimationFrame = next => { callback = next; return 1 }
    Object.defineProperty(performance, 'now', { value: () => time })
    Object.assign(window, { advanceCourier: (seconds: number) => {
      const frames: number[][] = []
      for (let i = 0; i < Math.round(seconds * 20); i++) {
        positions = []; time += 50; callback(time)
        frames.push(positions[0])
      }
      return frames
    } })
  })
  await page.goto('/')
  await expect(page.locator('.desk-label')).toHaveCount(4)
  const advance = (seconds: number) => page.evaluate(s => (window as unknown as { advanceCourier(s: number): number[][] }).advanceCourier(s), seconds)
  await page.getByRole('button', { name: 'All idle', exact: true }).click()
  const before = (await advance(266)).at(-1)!
  expect(before[0]).toBeGreaterThan(400) // exercise the remote idle origin
  await page.getByRole('button', { name: 'Demo handoff', exact: true }).click()
  await page.getByRole('button', { name: 'Demo handoff', exact: true }).click()
  const frames = await advance(22.1)
  let previous = before
  for (const [x, y] of frames) {
    expect(Math.hypot(x - previous[0], y - previous[1])).toBeLessThan(20)
    // Ghost center -> feet. Includes the original 0.9-second failure frame.
    expect(x > 258 && x < 366 && y + 10 > 203 && y + 10 < 264).toBe(false)
    previous = [x, y]
  }
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'rest')
  expect(Math.abs(previous[0] - 104)).toBeLessThan(2)
})
