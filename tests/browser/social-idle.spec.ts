import { expect, test } from '@playwright/test'

test('dynamic idle visitors change destinations; newly working agent returns', async ({ page }) => {
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
  const later = await advance(75)
  expect(later).not.toEqual(gathered)
  await page.screenshot({ path: 'test-results/social-together.png', fullPage: true })
  working = true
  await expect(page.locator('.desk-label[data-activity="working"]')).toHaveCount(1)
  const returning = await advance(1)
  expect(returning).toHaveLength(2)
  const atWork = await advance(25)
  expect(atWork[0][0]).toBeCloseTo(104, 0)
  await page.screenshot({ path: 'test-results/social-one-working.png', fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await advance(1)
  const still = await page.locator('canvas').evaluate(c => c.toDataURL())
  await advance(100)
  expect(await page.locator('canvas').evaluate(c => c.toDataURL())).toBe(still)
})
