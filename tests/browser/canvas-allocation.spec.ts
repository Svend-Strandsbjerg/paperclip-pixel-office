import { expect, test } from '@playwright/test'
import { studioViewport, MAX_CANVAS_AREA, MAX_CANVAS_DIMENSION } from '../../src/studio-viewport'

for (const config of [
  { name: 'QA191-01 narrow 40-agent floor', width: 390, height: 844, count: 40, dpr: 3 },
  { name: 'desktop native DPR', width: 1440, height: 1000, count: 4, dpr: 2 },
]) {
  test(config.name, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.addInitScript(() => {
        const created: HTMLCanvasElement[] = []
        ;(window as any).createdCanvases = created
        const create = document.createElement.bind(document)
        document.createElement = ((...args: Parameters<typeof create>) => {
          const element = create(...args)
          if (element instanceof HTMLCanvasElement) created.push(element)
          return element
        }) as typeof document.createElement
      })
      const agents = Array.from({ length: config.count }, (_, i) => ({ id: `agent-${i}`, name: `Agent ${i}`, role: 'general', status: 'running', activity: 'working' }))
      await page.route('**/api/office-state', route => route.fulfill({ json: { mode: 'live', snapshot: {}, agents, tasks: [], deliveries: [] } }))
      await page.goto(baseURL!)
      await expect(page.locator('.roster li')).toHaveCount(config.count)
      const expected = studioViewport({ width: 640, height: Math.ceil(config.count / 6) * 448 }, await page.locator('.scene-viewport').evaluate(el => el.clientWidth), config.dpr)
      await expect(page.locator('canvas')).toHaveAttribute('width', String(expected.bufferWidth))
      await expect(page.locator('canvas')).toHaveAttribute('height', String(expected.bufferHeight))
      await expect.poll(() => page.locator('canvas').evaluate(canvas => {
        const background = (window as any).createdCanvases.find((c: HTMLCanvasElement) => !c.isConnected && c.width === canvas.width && c.height === canvas.height)
        if (!background) return false
        // Both layers must contain painted pixels in the last module, not just the first.
        return [canvas, background].every(c => {
          const data = c.getContext('2d')!.getImageData(0, c.height - 100, c.width, 50).data
          return data.some((value: number, i: number) => i % 4 === 3 && value > 0)
        })
      })).toBe(true)
      expect(expected.bufferWidth * expected.bufferHeight).toBeLessThanOrEqual(MAX_CANVAS_AREA)
      expect(Math.max(expected.bufferWidth, expected.bufferHeight)).toBeLessThanOrEqual(MAX_CANVAS_DIMENSION)
      expect(await page.locator('canvas').evaluate(c => c.getBoundingClientRect().width)).toBe(expected.width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(config.width)
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })
}
