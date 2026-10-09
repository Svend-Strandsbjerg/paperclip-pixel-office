import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountOffice } from '../src/renderer.ts'
import { demoHandoff } from '../src/handoff.ts'
import { mapVisualState } from '../src/state.ts'

test('renderer floats idle/working native ghosts, glides handoffs, settles, and respects reduced motion', t => {
  let callback: FrameRequestCallback
  let now = 0
  let allocations = 0
  const rotations: number[] = [], translations: number[][] = [], images: unknown[] = []
  const documents: number[][] = []
  const media = { matches: false }
  const bubble = { hidden: true, textContent: '', dataset: {}, style: { setProperty() {} }, setAttribute() {}, remove() {} }
  const ctx = new Proxy({
    fillRect: (...args: number[]) => { if ((ctx as unknown as CanvasRenderingContext2D).fillStyle === '#fff4d6') documents.push(args) },
    rotate: (angle: number) => rotations.push(angle),
    translate: (...args: number[]) => translations.push(args),
    drawImage: (image: unknown) => { if (image instanceof Image) images.push(image) },
  }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => {} })
  const globals: Record<string, unknown> = {
    window: { matchMedia: () => media },
    document: { hidden: false, createElement: (tag: string) => tag === 'canvas' ? { getContext: () => ctx } : bubble, addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: (next: FrameRequestCallback) => { callback = next; return 1 },
    cancelAnimationFrame() {},
    Image: class { complete = true; naturalWidth = 64; src = ''; constructor() { allocations++ } },
  }
  let office: ReturnType<typeof mountOffice> | undefined
  t.after(() => office?.destroy())
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : Reflect.deleteProperty(globalThis, key))
  }
  t.mock.method(performance, 'now', () => now)
  const canvas = { width: 0, height: 0, dataset: {} as Record<string, string>, parentElement: { append() {} }, getContext: () => ctx }
  const state = mapVisualState({ developer: 'working' })
  office = mountOffice(canvas as unknown as HTMLCanvasElement, state)
  function frame(time: number) {
    now = time; rotations.length = 0; translations.length = 0; images.length = 0; documents.length = 0
    callback!(time)
  }
  frame(1)
  assert.equal(documents.length, 0)
  const first = translations.map(v => [...v])
  const originalImages = [...images]
  frame(17)
  assert.notDeepEqual(translations[0], first[0]) // idle
  assert.notDeepEqual(translations[2], first[2]) // working
  assert.deepEqual(images, originalImages)
  assert.equal(allocations, 1) // cached shared demo image
  office.handoff(demoHandoff)
  frame(33)
  for (let time = 49; time < 2000; time += 16) frame(time)
  assert.equal(canvas.dataset.handoff, 'outbound')
  assert.equal(documents.length, 1)
  assert.ok(rotations[0] > 0)
  for (let time = 2000; time < 5100; time += 16) frame(time)
  assert.equal(canvas.dataset.handoff, 'bubble')
  assert.ok(Math.abs(rotations[0]) < 0.001)
  assert.equal(bubble.hidden, false)
  for (let time = 5100; time < 12000; time += 16) frame(time)
  assert.equal(canvas.dataset.handoff, 'rest')
  assert.equal(documents.length, 0)
  assert.ok(Math.abs(rotations[0]) < 0.001)
  media.matches = true
  frame(12016)
  assert.ok(rotations.every(angle => angle === 0))
  assert.deepEqual(translations[0], [104 * 3, (104 + 44 - 10) * 3])
  office.handoff({ ...demoHandoff, taskId: 'reduced' })
  frame(12032)
  assert.equal(canvas.dataset.handoff, 'bubble')
  assert.equal(bubble.hidden, false)
  assert.deepEqual(images, originalImages)
  office.setState([...state, { ...state[1], id: 'dynamic-agent', col: 6, row: 18 }])
  media.matches = false
  frame(12048)
  assert.equal(images.length, 5)
  assert.notEqual(translations[8][1], (18 * 16 + 8 + 44 - 10) * 3)
  assert.equal(allocations, 1)
  // Each specialist and a future roster member is the result courier.
  for (const source of ['developer', 'browser-qa', 'reviewer', 'dynamic-agent']) {
    frame(now + 12000)
    office.handoff({ source, target: 'orchestrator', kind: 'result', taskId: 'DEV-99', title: 'Complete' })
    frame(now + 16)
    const started = now
    const sourceIndex = source === 'dynamic-agent' ? 4 : state.findIndex(a => a.id === source)
    const sourcePosition = [...translations[sourceIndex * 2]]
    for (let t = started + 16; t < started + 2000; t += 16) frame(t)
    assert.equal(documents.length, 1)
    assert.notDeepEqual(translations[sourceIndex * 2], sourcePosition)
    for (let t = now + 16; t < started + 5000; t += 16) frame(t)
    assert.match(bubble.textContent, /^Result DEV-99/)
    for (let t = now + 16; t < started + 8500; t += 16) frame(t)
    assert.equal(canvas.dataset.handoff, 'returning')
    assert.equal(documents.length, 0)
    for (let t = now + 16; t < started + 12000; t += 16) frame(t)
    assert.equal(canvas.dataset.handoff, 'rest')
    assert.ok(Math.abs(rotations[sourceIndex]) < 0.001)
  }
})
