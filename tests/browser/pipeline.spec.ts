import { test, expect } from '@playwright/test'
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
