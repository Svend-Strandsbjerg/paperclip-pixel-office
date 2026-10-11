import { test } from 'node:test'
import assert from 'node:assert/strict'
import { officeActivities } from '../src/office-activities.ts'
import { rosterLayout, type VisualState } from '../src/state.ts'
import { activityAnchor, deskBounds } from '../src/layout.ts'
import { WALK_SECONDS } from '../src/handoff.ts'

const roster = (count = 12) => rosterLayout()(Array.from({ length: count }, (_, i) => ({
  id: `future-${i}`, name: `Agent ${i}`, role: 'general', status: 'idle', activity: 'idle' as const,
})))
function setup(state = roster()) {
  const machine = officeActivities(); machine.sync(state)
  return { machine, state }
}
function advance(machine: ReturnType<typeof officeActivities>, state: VisualState, seconds: number) {
  let frames = state.map(a => machine.sample(a.id, 0, false))
  for (let i = 0; i < seconds * 10; i++) frames = state.map(a => machine.sample(a.id, 0.1, false))
  return frames
}
test('finite, varied idle visits are deterministic, asynchronous and collision-safe across 40 agents', () => {
  const { machine, state } = setup(roster(40)), replay = officeActivities(); replay.sync(state)
  const kinds = new Set<string>(), destinations = state.map(() => new Set<string>())
  const departures = new Set<number>()
  let previous = advance(machine, state, 0)
  for (let step = 0; step < 6000; step++) {
    if (step % 10 === 0) { machine.sync([...state].reverse()); replay.sync(state) }
    const frames = state.map(a => machine.sample(a.id, 0.1, false))
    assert.deepEqual(frames, state.map(a => replay.sample(a.id, 0.1, false)))
    frames.forEach((f, i) => {
      assert.ok(Math.hypot(f.x - previous[i].x, f.y - previous[i].y) <= 4.21)
      if (f.phase === 'outbound' && previous[i].phase === 'desk') departures.add(step)
      if (f.behaviour) kinds.add(f.behaviour)
      if (f.phase === 'pause') destinations[i].add(`${f.x}:${f.y}`)
      for (const seat of state) {
        const b = deskBounds(seat)
        assert.ok(!(f.x > b.x - 16 && f.x < b.x + b.width + 16 && f.y > b.y - 6 && f.y < b.y + b.height + 26))
      }
    })
    previous = frames
  }
  assert.equal(kinds.size, 5)
  assert.ok(destinations.every(d => d.size >= 3))
  assert.ok(departures.size > 40)
})
test('incoming workflow preempts any visit and reaches home within the walk window', () => {
  for (const authoritative of [false, true]) {
    const { machine, state } = setup()
    advance(machine, state, 40)
    for (const a of state) {
      if (authoritative) machine.sync(state.map(b => ({ ...b, activity: b.id === a.id ? 'working' : b.activity })))
      for (let i = 0; i <= WALK_SECONDS * 10; i++) {
        const frame = machine.sample(a.id, 0.1, false, !authoritative)
        assert.equal(frame.prop, undefined)
        if (i === WALK_SECONDS * 10) assert.deepEqual({ x: frame.x, y: frame.y }, activityAnchor(a))
      }
    }
  }
})
test('active work stays anchored and reduced motion suppresses all decorative travel', () => {
  const { machine, state } = setup()
  advance(machine, state, 40)
  for (const a of state) assert.deepEqual(machine.sample(a.id, 1, true), { ...activityAnchor(a), dx: 0, dy: 0, phase: 'desk', working: false })
  const working = state.map(a => ({ ...a, activity: 'working' as const }))
  machine.sync(working)
  for (const f of advance(machine, working, 200)) { assert.equal(f.phase, 'desk'); assert.equal(f.working, true) }
})
test('roster removal and polling preserve the remaining agents independent clocks', () => {
  const { machine, state } = setup(), control = officeActivities(); control.sync(state)
  advance(machine, state, 50); advance(control, state, 50)
  machine.sync(state.slice(1))
  assert.deepEqual(advance(machine, state.slice(1), 30), advance(control, state, 30).slice(1))
})
