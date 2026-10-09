import { test, expect } from '@playwright/test'
import { demoDeliveries } from '../../src/pipeline'
import { demoSnapshot } from '../../src/state'

for (const width of [1440, 375, 320]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`pipeline text contrast at ${width}px with motion ${reducedMotion}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion })
      await page.goto('/')
      const pipeline = page.getByRole('region', { name: 'Delivery pipeline overview' })
      await expect(pipeline.getByText('Ready for human merge')).toBeVisible()
      const contrasts = await pipeline.locator('*').evaluateAll(elements => {
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
            const channel = value / 255
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
          })
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        }
        return elements.filter(element => Array.from(element.childNodes).some(node =>
          node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        )).map(element => {
          let ancestor: Element | null = element
          let background = 'rgba(0, 0, 0, 0)'
          while (ancestor && background === 'rgba(0, 0, 0, 0)') {
            background = getComputedStyle(ancestor).backgroundColor
            ancestor = ancestor.parentElement
          }
          const foreground = getComputedStyle(element).color
          const light = luminance(foreground), dark = luminance(background)
          return { text: element.textContent, foreground, background,
            ratio: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05) }
        })
      })
      expect(contrasts.length).toBeGreaterThan(15)
      for (const sample of contrasts) expect(sample.ratio, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await pipeline.screenshot({ path: testInfo.outputPath('pipeline.png') })
    })
  }
}

test('pipeline smoke: demo rail renders and does not obscure office or handoff controls', async ({ page }) => {
  await page.goto('/')
  const pipeline=page.getByRole('region',{name:'Delivery pipeline overview'})
  await expect(pipeline.getByText('Ready for human merge')).toBeVisible()
  await expect(pipeline.locator('.gate')).toHaveCount(4)
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByRole('button',{name:'Demo Rework handoff',exact:true}).click()
  await expect(page.locator('canvas')).toHaveAttribute('data-target','developer')
  await expect(pipeline.getByText('Ready for human merge')).toBeVisible()
})

// Exercise the real serial live poller against controlled projected API responses.
test('unchanged live polls preserve PR keyboard focus and SHA text selection', async ({ page }) => {
  let polls = 0
  let changed = false
  await page.route('**/api/office-state', async route => {
    polls++
    await route.fulfill({json:{mode:'live',snapshot:demoSnapshot('mixed'),tasks:[],deliveries:changed ? [] : demoDeliveries}})
  })
  await page.goto('/')
  const pipeline=page.getByRole('region',{name:'Delivery pipeline overview'})
  const link=pipeline.getByRole('link')
  await expect(link).toBeVisible()
  await expect(page.locator('.source')).toHaveText('LIVE · CONNECTED')
  await link.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(link).toBeFocused()
  const sha=pipeline.locator('p.delivery-sha')
  const selected=await sha.evaluate(element=>{
    const range=document.createRange();range.selectNodeContents(element)
    const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range)
    return selection.toString()
  })
  const before=polls
  await expect.poll(()=>polls).toBeGreaterThanOrEqual(before+2)
  // Confirm the response has passed through the renderer before checking identity.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await expect(link).toBeFocused()
  expect(await page.evaluate(()=>window.getSelection()?.toString())).toBe(selected)
  changed=true
  await expect(pipeline.getByText('No active delivery parents.')).toBeVisible()
  await expect(link).toHaveCount(0)
})
