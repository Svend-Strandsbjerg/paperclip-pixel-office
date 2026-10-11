import { expect, test } from '@playwright/test'

test('idle coffee, working room visits, transitions and reduced motion', async ({ page }) => {
  // Drive only the animation clock: network polling and authoritative demo controls
  // stay real. This observes infrequent trips without waiting several minutes.
  await page.addInitScript(() => {
    let callback: FrameRequestCallback, time = 1
    window.requestAnimationFrame = next => { callback = next; return 1 }
    Object.assign(window, { advanceOffice: (seconds: number) => {
      for (let i = 0; i < seconds * 20; i++) { time += 50; callback(time) }
    } })
  })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('.desk-label')).toHaveCount(4)
  const advance = (seconds: number) => page.evaluate(s => (window as unknown as { advanceOffice(s: number): void }).advanceOffice(s), seconds)
  const room = () => page.locator('canvas').evaluate(canvas => {
    const context = canvas.getContext('2d')!, scale = canvas.width / 640
    return Array.from(context.getImageData(500 * scale, 155 * scale, 65 * scale, 110 * scale).data)
  })
  await page.getByRole('button', { name: 'All idle', exact: true }).click()
  await advance(1)
  const empty = await room()
  let coffee = false
  for (let i = 0; i < 70; i++) {
    await advance(1)
    if (JSON.stringify(await room()) !== JSON.stringify(empty)) { coffee = true; break }
  }
  expect(coffee).toBe(true)
  await advance(4)
  await page.screenshot({ path: 'test-results/activity-coffee.png', fullPage: true })
  await page.getByRole('button', { name: 'All working', exact: true }).click()
  await advance(20)
  await expect(page.locator('.desk-label[data-activity="working"]')).toHaveCount(4)
  let work = false
  for (let i = 0; i < 90; i++) {
    await advance(1)
    // Paper at the collaboration table is above the coffee area.
    work = await page.locator('canvas').evaluate(canvas => {
      const scale = canvas.width / 640
      const data = canvas.getContext('2d')!.getImageData(536 * scale, 165 * scale, 12 * scale, 15 * scale).data
      for (let i = 0; i < data.length; i += 4) if (data[i] === 255 && data[i + 1] === 244 && data[i + 2] === 214) return true
      return false
    })
    if (work) break
  }
  expect(work).toBe(true)
  await page.screenshot({ path: 'test-results/activity-work-room.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await advance(1)
  await page.screenshot({ path: 'test-results/activity-mobile.png', fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await advance(1)
  const still = await page.locator('canvas').evaluate(c => c.toDataURL())
  await advance(100)
  expect(await page.locator('canvas').evaluate(c => c.toDataURL())).toBe(still)
  expect(errors).toEqual([])
})
