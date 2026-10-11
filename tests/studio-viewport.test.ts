import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_CANVAS_AREA, MAX_CANVAS_DIMENSION, studioViewport } from '../src/studio-viewport'
import { officeLayout, seatPosition } from '../src/layout'

test('desktop gets a closer floor while mobile keeps a readable scrollable minimum', () => {
  const size = { width: 640, height: 448 }
  for (const available of [980, 1294, 1600]) {
    const display = studioViewport(size, available, 2)
    assert.equal(display.width, available) // use the space reclaimed from the team sidebar
    assert.ok(Math.abs(display.height / display.width - size.height / size.width) < 1e-12)
    assert.equal(display.bufferWidth, available * 2)
  }
  assert.equal(studioViewport(size, 800, 1).scale, 1.25)
  for (const available of [288, 350, 640]) {
    const display = studioViewport(size, available, 1)
    assert.equal(display.scale, 1.15)
    assert.equal(display.width, 736)
    assert.ok(display.width > available)
  }
})

test('roster expansion preserves zoom and bounds DPI pixels for the entire floor', () => {
  for (const count of [0, 1, 4, 6, 12, 24, 40]) {
    const size = officeLayout(Array.from({ length: count }, (_, i) => seatPosition(i)))
    for (const available of [350, 800, 980, 1294, 1600]) for (const dpr of [1, 1.25, 2, 3]) {
      const display = studioViewport(size, available, dpr)
      assert.equal(display.scale, studioViewport(officeLayout([]), available, dpr).scale)
      assert.equal(display.height, Math.max(1, Math.ceil(count / 6)) * 448 * display.scale)
      assert.ok(display.bufferWidth * display.bufferHeight <= MAX_CANVAS_AREA)
      assert.ok(Math.max(display.bufferWidth, display.bufferHeight) <= MAX_CANVAS_DIMENSION)
      if (Math.ceil(display.width * dpr) * Math.ceil(display.height * dpr) <= MAX_CANVAS_AREA && Math.ceil(display.height * dpr) <= MAX_CANVAS_DIMENSION) {
        assert.equal(display.effectivePixelRatio, dpr)
        assert.equal(display.bufferWidth, Math.ceil(display.width * dpr))
        assert.equal(display.bufferHeight, Math.ceil(display.height * dpr))
      }
    }
  }
})


test('QA191-01: mobile 40-agent DPR 3 allocation keeps readable CSS scale', () => {
  const size = officeLayout(Array.from({ length: 40 }, (_, i) => seatPosition(i)))
  const display = studioViewport(size, 390, 3)
  assert.equal(display.scale, 1.15)
  assert.equal(display.width, 736)
  assert.equal(display.height, 7 * 448 * 1.15)
  assert.ok(display.effectivePixelRatio > 2)
  assert.ok(display.effectivePixelRatio < 3)
  assert.ok(display.bufferWidth * display.bufferHeight <= MAX_CANVAS_AREA)
  assert.ok(display.bufferHeight <= MAX_CANVAS_DIMENSION)
  assert.ok(display.width * display.effectivePixelRatio <= display.bufferWidth + 1e-9)
  assert.ok(display.height * display.effectivePixelRatio <= display.bufferHeight + 1e-9)
})

test('axis cap remains safe even when exceptionally tall rosters need sub-1 DPR', () => {
  for (const height of [10_000, 100_000]) {
    const display = studioViewport({ width: 640, height }, 390, 3)
    assert.equal(display.scale, 1.15)
    assert.ok(display.effectivePixelRatio < 1)
    assert.ok(display.bufferHeight <= MAX_CANVAS_DIMENSION)
    assert.ok(display.bufferWidth * display.bufferHeight <= MAX_CANVAS_AREA)
  }
})
