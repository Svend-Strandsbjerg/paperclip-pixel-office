import { expect, test } from '@playwright/test'

for (const dpr of [1, 3]) test(`six occupied seats preserve west-edge materials at DPR ${dpr}`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 }, deviceScaleFactor: dpr, reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const agents = Array.from({ length: 6 }, (_, i) => ({ id: `agent-${i}`, name: `Agent ${i}`, role: 'general', status: 'running', activity: 'working' }))
    await page.route('**/api/office-state', route => route.fulfill({ json: { mode: 'live', snapshot: {}, agents, tasks: [], deliveries: [] } }))
    await page.goto(baseURL!)
    await expect(page.locator('.roster li')).toHaveCount(6)
    const materials = await page.locator('canvas').evaluate(canvas => {
      const ctx = canvas.getContext('2d')!
      const pixel = (x: number, y: number) => Array.from(ctx.getImageData(Math.floor(x / 640 * canvas.width), Math.floor(y / 448 * canvas.height), 1, 1).data)
      // Shelf bottom lies inside the middle-left rug; pot lies inside bottom-left rug.
      return { wood: [pixel(32, 253), pixel(46, 253)], pot: [pixel(39, 375), pixel(44, 375)] }
    })
    expect(materials.wood).toEqual([[201, 164, 124, 255], [201, 164, 124, 255]])
    expect(materials.pot).toEqual([[189, 146, 120, 255], [189, 146, 120, 255]])
    await page.locator('canvas').screenshot({ path: `test-results/DEV-208-six-seats-dpr-${dpr}.png` })
    expect(errors).toEqual([])
  } finally { await context.close() }
})
