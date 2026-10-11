import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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


test('RV-1: reserved scrollbar space prevents scale feedback with classic 15px scrollbars', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
  const viewportRule = css.match(/\.scene-viewport\s*\{([^}]+)\}/)![1]
  assert.match(viewportRule, /scrollbar-gutter:\s*stable\s*;/)
  const size = { width: 640, height: 448 }
  function next(width: number, windowHeight: number, scrollbar: boolean, stable: boolean) {
    const display = studioViewport(size, width - (stable || scrollbar ? 15 : 0), 1)
    return { width: display.width, scrollbar: display.height > windowHeight * 0.78 }
  }
  // Positive control: the reported case really alternates without reserved space.
  assert.equal(next(760, 669, false, false).scrollbar, true)
  assert.equal(next(760, 669, true, false).scrollbar, false)
  for (let width = 760; width <= 1600; width++) {
    for (let height = 600; height <= 1400; height++) {
      const absent = next(width, height, false, true)
      const present = next(width, height, true, true)
      assert.equal(absent.width, present.width)
      assert.equal(absent.scrollbar, present.scrollbar)
    }
  }
})

test('RV-2: clamped axes cover one shared ratio with less than one edge pixel', () => {
  for (const height of [448, 896, 3136, 44800, 100000]) {
    for (const width of [390, 836.25, 1294, 7000]) for (const dpr of [1.25, 3, 4]) {
      const display = studioViewport({ width: 640, height }, width, dpr)
      assert.ok(display.bufferWidth * display.bufferHeight <= MAX_CANVAS_AREA)
      assert.ok(Math.max(display.bufferWidth, display.bufferHeight) <= MAX_CANVAS_DIMENSION)
      for (const [buffer, css] of [[display.bufferWidth, display.width], [display.bufferHeight, display.height]]) {
        const tail = buffer - css * display.effectivePixelRatio
        assert.ok(tail >= -1e-9 && tail < 1 + 1e-9, `unpainted tail: ${tail}`)
      }
    }
  }
})
