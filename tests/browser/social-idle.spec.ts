import { expect, test } from '@playwright/test'

test('two dynamic coffee visitors persist; only the newly working agent leaves', async ({ page }) => {
  await page.addInitScript(() => {
    let callback: FrameRequestCallback, time = 1
    let positions: number[][] = []
    const translate = CanvasRenderingContext2D.prototype.translate
    CanvasRenderingContext2D.prototype.translate = function (x, y) {
      if (this.canvas.getAttribute('role') === 'img') positions.push([x, y])
      translate.call(this, x, y)
    }
    window.requestAnimationFrame = next => { callback = next; return 1 }
    Object.assign(window, { advanceOffice: (seconds: number) => {
      for (let i = 0; i < seconds * 20; i++) { positions = []; time += 50; callback(time) }
      return positions.filter((_, i) => i % 2 === 0).map(([x, y]) => [x / 3, y / 3])
    } })
  })
  let working = false
  await page.route('**/api/office-state', route => route.fulfill({ json: {
    mode: 'live', snapshot: {}, tasks: [], deliveries: [],
    agents: ['alpha-new', 'beta-new'].map((id, i) => ({ id, name: id, role: 'general', status: working && i === 0 ? 'running' : 'idle', activity: working && i === 0 ? 'working' : 'idle' })),
  } }))
  await page.goto('/')
  await expect(page.locator('.desk-label')).toHaveCount(2)
  const advance = (seconds: number) => page.evaluate(s => (window as unknown as { advanceOffice(s: number): number[][] }).advanceOffice(s), seconds)
  const gathered = await advance(180)
  expect(gathered).toHaveLength(2)
  expect(gathered.every(([x]) => x > 450)).toBe(true)
  expect(Math.hypot(gathered[0][0] - gathered[1][0], gathered[0][1] - gathered[1][1])).toBeGreaterThan(40)
  const persistent = await advance(300)
  expect(persistent.map(([x]) => x)).toEqual(gathered.map(([x]) => x))
  await page.screenshot({ path: 'test-results/social-together.png', fullPage: true })
  working = true
  await expect(page.locator('.desk-label[data-activity="working"]')).toHaveCount(1)
  const returning = await advance(1)
  expect(returning[0][0]).toBeLessThan(gathered[0][0])
  expect(returning[1][0]).toBe(gathered[1][0])
  const atWork = await advance(25)
  expect(atWork[0][0]).toBe(104)
  expect(atWork[1][0]).toBe(gathered[1][0])
  await page.screenshot({ path: 'test-results/social-one-working.png', fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await advance(1)
  const still = await page.locator('canvas').evaluate(c => c.toDataURL())
  await advance(100)
  expect(await page.locator('canvas').evaluate(c => c.toDataURL())).toBe(still)
})
