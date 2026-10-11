import { test } from 'node:test'
import assert from 'node:assert/strict'
import { officeActivities } from '../src/office-activities.ts'
import { mapVisualState, rosterLayout, type VisualState } from '../src/state.ts'
import { activityAnchor } from '../src/layout.ts'
import { WALK_SECONDS, HANDOFF_SECONDS } from '../src/handoff.ts'

function setup(activity: 'idle' | 'working') {
  const state = mapVisualState({ orchestrator: activity, developer: activity, 'browser-qa': activity, reviewer: activity })
  const machine = officeActivities()
  machine.sync(state)
  return { state, machine }
}
test('occasional trips reach the room, pause with appropriate props, return, and limit occupancy', () => {
  for (const activity of ['working'] as const) {
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
    assert.deepEqual([...props], ['paper'])
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

function advance(machine: ReturnType<typeof officeActivities>, state: VisualState, seconds: number) {
  let frames = state.map(a => machine.sample(a.id, 0, false))
  for (let i = 0; i < seconds * 10; i++) {
    if (i % 10 === 0) machine.sync(state)
    frames = state.map(a => machine.sample(a.id, 0.1, false))
  }
  return frames
}

test('coffee persists across extended idle polls; only the agent receiving work returns', () => {
  const { state, machine } = setup('idle')
  const gathered = advance(machine, state, 180)
  assert.ok(gathered.every(f => f.phase === 'pause' && f.prop === 'cup'))
  assert.deepEqual(advance(machine, state, 3600), gathered)
  const working = state.map((a, i) => i === 1 ? { ...a, activity: 'working' as const } : a)
  machine.sync(working)
  const first = working.map(a => machine.sample(a.id, 0.1, false))
  assert.equal(first[1].phase, 'returning')
  assert.equal(first[1].prop, undefined)
  assert.equal(first[1].working, true)
  assert.ok(Math.hypot(first[1].x - gathered[1].x, first[1].y - gathered[1].y) <= 4.21)
  for (const i of [0, 2, 3]) assert.deepEqual(first[i], gathered[i])
  const returned = advance(machine, working, 25)
  assert.equal(returned[1].phase, 'desk')
  assert.equal(returned[1].working, true)
  for (const i of [0, 2, 3]) assert.deepEqual(returned[i], gathered[i])
})

test('dynamic rosters gather with separated stable social positions in every studio', () => {
  const layout = rosterLayout()
  const agents = Array.from({ length: 40 }, (_, i) => ({ id: `new-agent-${i}`, name: `Agent ${i}`, role: 'general', status: 'idle', activity: 'idle' as const }))
  const machine = officeActivities()
  const initial = layout(agents.slice(0, 2))
  machine.sync(initial)
  const pair = advance(machine, initial, 180)
  const state = layout(agents)
  machine.sync(state)
  const gathered = advance(machine, state, 240)
  assert.ok(gathered.every(f => f.phase === 'pause'))
  assert.deepEqual(gathered.slice(0, 2), pair)
  for (let i = 0; i < gathered.length; i++) for (let j = i + 1; j < gathered.length; j++) {
    assert.ok(Math.hypot(gathered[i].x - gathered[j].x, gathered[i].y - gathered[j].y) > 40)
  }
  machine.sync([...state].reverse())
  assert.deepEqual(state.map(a => machine.sample(a.id, 0, false)), gathered)
  machine.sync(state.slice(1))
  assert.deepEqual(advance(machine, state.slice(1), 60), gathered.slice(1))
})

test('handoff interruption takes precedence over coffee without disturbing other visitors', () => {
  const { state, machine } = setup('idle')
  const gathered = advance(machine, state, 180)
  const courier = machine.sample(state[0].id, 0.1, false, true)
  assert.equal(courier.phase, 'returning')
  assert.equal(courier.prop, undefined)
  for (let i = 1; i < state.length; i++) assert.deepEqual(machine.sample(state[i].id, 0.1, false), gathered[i])
})

test('reduced motion clears coffee travel and holds static functional work positions', () => {
  const { state, machine } = setup('idle')
  advance(machine, state, 180)
  for (const a of state) {
    const frame = machine.sample(a.id, 0.1, true)
    assert.deepEqual({ x: frame.x, y: frame.y }, activityAnchor(a))
    assert.equal(frame.phase, 'desk')
    assert.equal(frame.prop, undefined)
    assert.deepEqual(machine.sample(a.id, 3600, true), frame)
  }
  const working = state.map((a, i) => i === 0 ? { ...a, activity: 'working' as const } : a)
  machine.sync(working)
  assert.equal(machine.sample(state[0].id, 0.1, true).working, true)
})

test('interrupted coffee recipients reach every lounge seat home within the handoff walk window', () => {
  const state = rosterLayout()(Array.from({ length: 12 }, (_, i) => ({
    id: `recipient-${i}`, name: `Recipient ${i}`, role: 'general', status: 'idle', activity: 'idle' as const,
  })))
  for (const recipient of state) {
    const machine = officeActivities()
    machine.sync(state)
    const gathered = advance(machine, state, 240)
    assert.ok(gathered.every(frame => frame.phase === 'pause' && frame.prop === 'cup'))
    const home = activityAnchor(recipient)
    for (let step = 1; step <= HANDOFF_SECONDS * 60; step++) {
      if (step % 60 === 0) machine.sync([...state].reverse())
      for (const [i, agent] of state.entries()) {
        const frame = machine.sample(agent.id, 1 / 60, false, agent.id === recipient.id)
        if (agent.id !== recipient.id) { assert.deepEqual(frame, gathered[i]); continue }
        assert.equal(frame.prop, undefined)
        if (step === 1) assert.equal(frame.phase, 'returning')
        if (step >= WALK_SECONDS * 60) {
          assert.ok(Math.hypot(frame.x - home.x, frame.y - home.y) < 1, `${agent.id} absent at handoff step ${step}`)
        }
      }
    }
  }
})
