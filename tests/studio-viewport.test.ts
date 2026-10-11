import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioViewport } from '../src/studio-viewport'
import { officeLayout, seatPosition } from '../src/layout'

test('desktop gets a closer floor while mobile keeps a readable scrollable minimum', () => {
  const size = { width: 640, height: 448 }
  assert.equal(studioViewport(size, 980, 1).scale, 1.35)
  assert.equal(studioViewport(size, 800, 1).scale, 1.25)
  for (const available of [288, 350, 640]) {
    const display = studioViewport(size, available, 1)
    assert.equal(display.scale, 1.15)
    assert.equal(display.width, 736)
    assert.ok(display.width > available)
  }
})

test('roster expansion preserves zoom and provisions native DPI pixels for the entire floor', () => {
  for (const count of [0, 1, 4, 6, 12, 24, 40]) {
    const size = officeLayout(Array.from({ length: count }, (_, i) => seatPosition(i)))
    for (const available of [350, 800, 980]) for (const dpr of [1, 1.25, 2, 3]) {
      const display = studioViewport(size, available, dpr)
      assert.equal(display.scale, studioViewport(officeLayout([]), available, dpr).scale)
      assert.equal(display.height, Math.max(1, Math.ceil(count / 6)) * 448 * display.scale)
      assert.equal(display.bufferWidth, Math.ceil(display.width * dpr))
      assert.equal(display.bufferHeight, Math.ceil(display.height * dpr))
    }
  }
})
