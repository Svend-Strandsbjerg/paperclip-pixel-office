import { expect, test } from '@playwright/test'
import { activityAnchor } from '../../src/layout'

test('idle life, delivered card continuity, activity labels and reduced motion', async ({ page }) => {
  await page.addInitScript(() => {
    let callback: FrameRequestCallback, time = 1
    window.requestAnimationFrame = next => { callback = next; return 1 }
    Object.defineProperty(performance, 'now', { value: () => time })
    Object.assign(window, { advanceOffice: (seconds: number) => {
      for (let i = 0; i < seconds * 20; i++) { time += 50; callback(time) }
    } })
  })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('.desk-label')).toHaveCount(4)
  const advance = (seconds: number) => page.evaluate(s => (window as unknown as { advanceOffice(s: number): void }).advanceOffice(s), seconds)
  await page.getByRole('button', { name: 'All idle', exact: true }).click()
  await advance(45)
  const idle = await page.locator('canvas').evaluate(c => c.toDataURL())
  await advance(70)
  expect(await page.locator('canvas').evaluate(c => c.toDataURL())).not.toBe(idle)
  await page.getByRole('button', { name: 'Demo handoff', exact: true }).click()
  await advance(4.2)
  await expect(page.locator('canvas')).toHaveAttribute('data-handoff', 'bubble')
  // Placed document occupies the developer's activity anchor even while idle.
  const card = () => page.locator('canvas').evaluate((c, home) => {
    const scale = c.width / 640
    return Array.from(c.getContext('2d')!.getImageData((home.x + 36) * scale, (home.y - 27) * scale, 10 * scale, 10 * scale).data)
  }, activityAnchor({ col: 19, row: 6 }))
  const waiting = await card()
  expect(waiting.some((v, i) => i % 4 === 0 && v > 240)).toBe(true)
  await advance(15)
  expect(await card()).toEqual(waiting)
  await page.getByRole('button', { name: 'All working', exact: true }).click()
  await advance(6)
  for (const label of await page.locator('.desk-label .activity').all()) {
    await expect(label).toHaveText(/[▦▣⌕✓◇≡] (Coordinating|Building|Inspecting|Reviewing|Researching|Writing)/)
  }
  expect(await card()).not.toEqual(waiting)
  await page.waitForTimeout(100) // allow pending layout/ResizeObserver callbacks
  await advance(0.1)
  await page.screenshot({ path: 'test-results/activity-work.png', fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await advance(1)
  const still = await page.locator('canvas').evaluate(c => c.toDataURL())
  await advance(100)
  expect(await page.locator('canvas').evaluate(c => c.toDataURL())).toBe(still)
  expect(errors).toEqual([])
})
