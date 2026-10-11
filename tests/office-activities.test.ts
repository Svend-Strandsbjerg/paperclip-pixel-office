import { test } from 'node:test'
import assert from 'node:assert/strict'
import { officeActivities } from '../src/office-activities.ts'
import { mapVisualState } from '../src/state.ts'
import { activityAnchor } from '../src/layout.ts'

function setup(activity: 'idle' | 'working') {
  const state = mapVisualState({ orchestrator: activity, developer: activity, 'browser-qa': activity, reviewer: activity })
  const machine = officeActivities()
  machine.sync(state)
  return { state, machine }
}
test('occasional trips reach the room, pause with appropriate props, return, and limit occupancy', () => {
  for (const activity of ['idle', 'working'] as const) {
    const { state, machine } = setup(activity)
    const phases = new Set<string>(), props = new Set<string>()
    let entered = false, returned = false
    for (let step = 0; step < 1800; step++) {
      if (step % 10 === 0) machine.sync(state)
      const frames = state.map(a => machine.sample(a.id, 0.1, false))
      assert.ok(frames.filter(f => f.phase !== 'desk').length <= 1)
      for (const frame of frames) {
        phases.add(frame.phase)
        if (frame.prop) props.add(frame.prop)
        if (frame.phase === 'pause') { assert.ok(frame.x > 500); entered = true }
        if (entered && frame.phase === 'returning') returned = true
      }
    }
    assert.deepEqual([...phases].sort(), ['desk', 'outbound', 'pause', 'returning'])
    assert.deepEqual([...props], [activity === 'idle' ? 'cup' : 'paper'])
    assert.ok(entered && returned)
  }
})
test('state changes remove stale props immediately and retrace smoothly; polling never restarts trips', () => {
  for (const activity of ['idle', 'working'] as const) {
    const { state, machine } = setup(activity)
    let selected = '', previous = { x: 0, y: 0 }
    for (let step = 0; step < 700 && !selected; step++) for (const a of state) {
      const frame = machine.sample(a.id, 0.1, false)
      if (frame.prop && frame.phase === 'pause') { selected = a.id; previous = frame; break }
    }
    assert.ok(selected)
    machine.sync(state.map(a => ({ ...a, activity: activity === 'idle' ? 'working' : 'idle' })))
    const next = machine.sample(selected, 0.1, false)
    assert.equal(next.phase, 'returning')
    assert.equal(next.prop, undefined)
    assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) <= 4.21)
  }
})
test('reduced motion and handoffs reset excursions; removal and expanded modules are supported', () => {
  const { state, machine } = setup('working')
  for (let i = 0; i < 400; i++) for (const a of state) machine.sample(a.id, 0.1, false)
  for (const a of state) {
    const frame = machine.sample(a.id, 1000, true)
    assert.deepEqual({ x: frame.x, y: frame.y }, activityAnchor(a))
    assert.equal(frame.phase, 'desk')
    assert.equal(machine.sample(a.id, 1, false, true).prop, undefined)
  }
  machine.sync([])
  const expanded = state.map(a => ({ ...a, row: a.row + 28 }))
  machine.sync(expanded)
  let entered = false
  for (let i = 0; i < 800; i++) for (const a of expanded) {
    const frame = machine.sample(a.id, 0.1, false)
    if (frame.phase === 'pause') { assert.equal(frame.y, 448 + 184); entered = true }
  }
  assert.ok(entered)
})
